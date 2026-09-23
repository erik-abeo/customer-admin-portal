import {
  Alert,
  Badge,
  Button,
  Code,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";

import { getAdminName } from "@/api/httpClient";
import type { CustomerMove, CustomerMoveVerification } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { useDatabases } from "@/features/databases/queries";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { isSafeDatabaseName } from "@/features/migrations/migrationTarget";
import {
  canCancelMove,
  hasRetainedSource,
  whyDatabaseNotMovable,
  useCancelCustomerMove,
  useCreateCustomerMove,
  useCustomerMove,
  useCustomerMoves,
  useDropCustomerMoveSource,
  useRollBackCustomerMove,
} from "@/features/moves/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

const STATUS_COLOR: Record<string, string> = {
  planned: "blue",
  draining: "cyan",
  copying: "indigo",
  verifying: "violet",
  flipped: "teal",
  settled: "green",
  failed: "red",
  cancelled: "gray",
  rolled_back: "orange",
};

/** Phases during which the customer cannot start new sessions. */
const QUIESCED: Set<string> = new Set(["draining", "copying", "verifying"]);

const statusLabel = (status: string | null) =>
  status ? status.replace("_", " ") : "unknown";

/**
 * How a move's copy was checked, in words. Recorded per table: a table whose
 * checksum could not be compared falls back to row counts, and matching counts
 * say nothing about the values in them, so a partial fallback is worth saying.
 */
const describeVerification = (rows: CustomerMoveVerification[]) => {
  const byCount = rows.filter((row) => row.VerificationMethod !== "checksum").length;
  if (byCount === 0) return "by table checksum";
  if (byCount === rows.length)
    return "by row count only, so the values themselves were not compared";
  return `by table checksum, except ${byCount} of ${rows.length} tables checked by row count only`;
};

const formatUtc = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "—";

/**
 * Moving customers between servers.
 *
 * The status column is the important one, and specifically whether the customer
 * is offline right now. A move in `copying` means somebody's practice cannot
 * open CrystalPM, and that should be visible without opening anything.
 */
export function MovesPage() {
  const moves = useCustomerMoves();
  const servers = useDatabaseServers();
  const databases = useDatabases();

  const createMove = useCreateCustomerMove();
  const cancelMove = useCancelCustomerMove();
  const rollBack = useRollBackCustomerMove();
  const dropSource = useDropCustomerMoveSource();

  const [formOpen, setFormOpen] = useState(false);
  const [databaseId, setDatabaseId] = useState<string>("");
  const [targetServerId, setTargetServerId] = useState<string>("");
  const [targetName, setTargetName] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const detail = useCustomerMove(detailId ?? undefined);

  const selectedDatabase = (databases.data ?? []).find(
    (d) => String(d.Id) === databaseId,
  );

  // A customer cannot move to the server they are already on, so it is not offered.
  const targetOptions = (servers.data ?? [])
    .filter((s) => !selectedDatabase || s.Id !== selectedDatabase.DatabaseServerId)
    .map((s) => ({ value: String(s.Id), label: s.Name }));

  const resetForm = () => {
    setDatabaseId("");
    setTargetServerId("");
    setTargetName("");
  };

  const planMove = async () => {
    try {
      const result = await createMove.mutateAsync({
        DatabaseId: Number(databaseId),
        TargetDatabaseServerId: Number(targetServerId),
        TargetDatabaseName: targetName.trim() || null,
        RequestedByAdmin: getAdminName(),
      });

      if (!result.Success) {
        notifyError(new Error(result.Message ?? "Could not plan the move"));
        return;
      }

      notifySuccess(result.Message ?? "Move planned.");
      setFormOpen(false);
      resetForm();
    } catch (error) {
      notifyError(error);
    }
  };

  /**
   * Stated back in words before anything is recorded. Planning a move is what
   * starts taking the customer offline, and the executor picks it up within
   * seconds, so the confirmation is the last point at which a wrong pick costs
   * nothing.
   */
  const confirmPlan = () => {
    const targetServer = (servers.data ?? []).find(
      (s) => String(s.Id) === targetServerId,
    );
    const sourceServer = (servers.data ?? []).find(
      (s) => s.Id === selectedDatabase?.DatabaseServerId,
    );
    const name = targetName.trim() || selectedDatabase?.DatabaseName;

    modals.openConfirmModal({
      title: "Start moving this customer?",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Customer <b>{selectedDatabase?.CrystalPmId}</b> moves from{" "}
            <b>{sourceServer?.Name ?? "their current server"}</b> to{" "}
            <b>{targetServer?.Name}</b>, as <Code>{name}</Code>.
          </Text>
          <Text size="sm">
            New sessions are refused from now on. Once the open ones end, the practice
            cannot use CrystalPM until the copy is verified and cut over. Until copying
            starts, the move can be cancelled.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Start the move", cancel: "Go back" },
      confirmProps: { color: "yellow" },
      onConfirm: () => void planMove(),
    });
  };

  const confirmCancel = (move: CustomerMove) =>
    modals.openConfirmModal({
      title: "Cancel this move?",
      children: (
        <Text size="sm">
          Customer <b>{move.CrystalPmId}</b> is put back online on{" "}
          <b>{move.SourceDatabaseServerName}</b>, exactly as before. Nothing has been
          copied yet, and any name reserved for it on {move.TargetDatabaseServerName} is
          released.
        </Text>
      ),
      labels: { confirm: "Cancel the move", cancel: "Keep going" },
      confirmProps: { color: "orange" },
      onConfirm: async () => {
        try {
          const result = await cancelMove.mutateAsync(move.Id);
          if (result.Success) notifySuccess(result.Message ?? "Move cancelled.");
          else notifyError(new Error(result.Message ?? "Could not cancel the move"));
        } catch (error) {
          notifyError(error);
        }
      },
    });

  const confirmRollBack = (move: CustomerMove) =>
    modals.openConfirmModal({
      title: "Point this customer back at the source?",
      children: (
        <Text size="sm">
          Customer <b>{move.CrystalPmId}</b> will go back to{" "}
          <Code>{move.SourceDatabaseName}</Code> on{" "}
          <b>{move.SourceDatabaseServerName}</b>, which still holds everything it did
          before the move. Anything written on the target since the cutover stays there
          and is not carried back, and the target copy is left in place.
        </Text>
      ),
      labels: { confirm: "Roll back", cancel: "Cancel" },
      confirmProps: { color: "orange" },
      onConfirm: async () => {
        try {
          const result = await rollBack.mutateAsync(move.Id);
          if (result.Success) notifySuccess(result.Message ?? "Rolled back.");
          else notifyError(new Error(result.Message ?? "Could not roll back"));
        } catch (error) {
          notifyError(error);
        }
      },
    });

  const confirmDropSource = (move: CustomerMove) =>
    modals.openConfirmModal({
      title: "Drop the source? This cannot be undone.",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            <Code>{move.SourceDatabaseName}</Code> on{" "}
            <b>{move.SourceDatabaseServerName}</b> will be dropped.
          </Text>
          <Text size="sm" fw={500}>
            Until now this move could be rolled back with a single click. Afterwards the
            only copy of customer {move.CrystalPmId}&apos;s records is the one on{" "}
            {move.TargetDatabaseServerName}.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Drop the source", cancel: "Keep it" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          const result = await dropSource.mutateAsync(move.Id);
          if (result.Success) notifySuccess(result.Message ?? "Source dropped.");
          else notifyError(new Error(result.Message ?? "Could not drop the source"));
        } catch (error) {
          notifyError(error);
        }
      },
    });

  const rows = (moves.data ?? []).map((move) => (
    <Table.Tr key={move.Id}>
      <Table.Td>
        <Group gap="xs">
          <Badge variant="light" color={STATUS_COLOR[move.Status ?? ""] ?? "gray"}>
            {statusLabel(move.Status)}
          </Badge>
          {/*
            The thing worth seeing without opening anything: during these phases
            the practice cannot open CrystalPM.
          */}
          {QUIESCED.has(move.Status ?? "") && (
            <Badge variant="filled" color="orange" size="sm">
              Customer offline
            </Badge>
          )}
        </Group>
      </Table.Td>
      <Table.Td>{move.CrystalPmId}</Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{move.SourceDatabaseServerName}</Text>
          <IconArrowRight size={14} />
          <Text size="sm">{move.TargetDatabaseServerName}</Text>
        </Group>
        <Text size="xs" c="dimmed">
          {move.SourceDatabaseName} to {move.TargetDatabaseName}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c={move.ErrorMessage ? "red" : undefined}>
          {move.ErrorMessage ?? move.PhaseDetail ?? "—"}
        </Text>
      </Table.Td>
      <Table.Td>{formatUtc(move.CreatedDateTimeUtc)}</Table.Td>
      <Table.Td>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <Button
            size="compact-sm"
            variant="subtle"
            aria-label={`Details of the move for customer ${move.CrystalPmId}`}
            onClick={() => setDetailId(move.Id)}
          >
            Details
          </Button>
          <RequireRole role="admin">
            {canCancelMove(move.Status) && (
              <Button
                size="compact-sm"
                variant="subtle"
                color="orange"
                aria-label={`Cancel the move for customer ${move.CrystalPmId}`}
                onClick={() => confirmCancel(move)}
              >
                Cancel
              </Button>
            )}
            {hasRetainedSource(move) && (
              <>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="orange"
                  aria-label={`Roll back the move for customer ${move.CrystalPmId}`}
                  onClick={() => confirmRollBack(move)}
                >
                  Roll back
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="red"
                  aria-label={`Drop the source of the move for customer ${move.CrystalPmId}`}
                  onClick={() => confirmDropSource(move)}
                >
                  Drop source
                </Button>
              </>
            )}
          </RequireRole>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  // Checked here as well as by the service, so an unusable name is caught while
  // the operator is still looking at it.
  const targetNameError =
    targetName.trim() && !isSafeDatabaseName(targetName)
      ? "Use letters, digits and underscores, starting with a letter"
      : null;
  const canPlan =
    databaseId !== "" && targetServerId !== "" && targetNameError === null;

  return (
    <Container size="xl" py="md">
      <PageHeader
        title="Customer moves"
        description="Move a customer's database to another server, verified before anything cuts over."
        actions={
          <RequireRole role="admin">
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setFormOpen(true)}
            >
              Plan a move
            </Button>
          </RequireRole>
        }
      />

      <QueryStatus
        isLoading={moves.isLoading}
        error={moves.error}
        isEmpty={(moves.data ?? []).length === 0}
        emptyMessage="No moves yet"
        emptyDescription="Moving a customer takes them offline for the copy, so it is worth scheduling."
        onRetry={() => void moves.refetch()}
      >
        <Table.ScrollContainer minWidth={980}>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Status</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Move</Table.Th>
                <Table.Th>Phase</Table.Th>
                <Table.Th>Planned</Table.Th>
                <Table.Th>
                  <VisuallyHidden>Actions</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </QueryStatus>

      <Modal
        opened={formOpen}
        onClose={() => setFormOpen(false)}
        title="Plan a customer move"
        size="lg"
      >
        <Stack gap="md">
          <Alert variant="light" color="yellow" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">
              New sessions are refused as soon as the move starts, and open ones are
              left to end on their own. From then until the copy is verified the
              customer cannot use CrystalPM, so this is worth starting when the practice
              is closed.
            </Text>
          </Alert>

          <Select
            label="Customer database"
            placeholder="Pick the database to move"
            required
            searchable
            description="Only an active database with no unsettled move can be moved."
            data={(databases.data ?? []).map((d) => {
              // Disabled with the reason rather than hidden, so a customer who is
              // mid-move or suspended is visibly so. The service refuses these too.
              const unavailable = whyDatabaseNotMovable(d, moves.data ?? []);
              return {
                value: String(d.Id),
                label: `${d.DatabaseName} (CPM #${d.CrystalPmId})${
                  unavailable ? `, unavailable: ${unavailable}` : ""
                }`,
                disabled: unavailable !== null,
              };
            })}
            value={databaseId}
            onChange={(value) => {
              setDatabaseId(value ?? "");
              // The target list depends on where the customer currently is, so a
              // previously chosen server may no longer be a legal destination.
              setTargetServerId("");
            }}
          />

          <Select
            label="Move to server"
            placeholder={databaseId ? "Pick a server" : "Pick a database first"}
            required
            searchable
            disabled={!databaseId}
            data={targetOptions}
            value={targetServerId}
            onChange={(value) => setTargetServerId(value ?? "")}
          />

          <TextInput
            label="Name on the target"
            description="Leave blank to keep the current name. It must be unique on the target server."
            placeholder={selectedDatabase?.DatabaseName ?? ""}
            error={targetNameError}
            value={targetName}
            onChange={(event) => setTargetName(event.currentTarget.value)}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canPlan}
              loading={createMove.isPending}
              onClick={confirmPlan}
            >
              Plan the move
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Move detail"
        size="lg"
      >
        <QueryStatus isLoading={detail.isLoading} error={detail.error}>
          {detail.data?.Move && (
            <Stack gap="md">
              <Group gap="xs">
                <Badge
                  variant="light"
                  color={STATUS_COLOR[detail.data.Move.Status ?? ""] ?? "gray"}
                >
                  {statusLabel(detail.data.Move.Status)}
                </Badge>
                <Text size="sm">{detail.data.Move.PhaseDetail}</Text>
              </Group>

              {detail.data.Move.ErrorMessage && (
                <Alert color="red" variant="light" icon={<IconX size={16} />}>
                  <Text size="sm">{detail.data.Move.ErrorMessage}</Text>
                </Alert>
              )}

              {detail.data.Move.Status === "flipped" && (
                <Alert color="teal" variant="light" icon={<IconCheck size={16} />}>
                  <Text size="sm">
                    Cut over. The source is still there, so this can be rolled back with
                    a single click until it is dropped.
                  </Text>
                </Alert>
              )}

              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  Quiesced {formatUtc(detail.data.Move.QuiescedDateTimeUtc)}
                </Text>
                <Text size="xs" c="dimmed">
                  Copy {formatUtc(detail.data.Move.CopyStartedDateTimeUtc)} to{" "}
                  {formatUtc(detail.data.Move.CopyCompletedDateTimeUtc)}
                </Text>
                <Text size="xs" c="dimmed">
                  Verified {formatUtc(detail.data.Move.VerifiedDateTimeUtc)} · cut over{" "}
                  {formatUtc(detail.data.Move.FlippedDateTimeUtc)}
                </Text>
              </Stack>

              {detail.data.Verification.length > 0 && (
                <>
                  <Text size="sm" fw={500}>
                    Verification
                    {/*
                      Which check ran is worth stating. Matching row counts say
                      nothing about the values in them, so a table verified by
                      count was checked less thoroughly than one by checksum.
                    */}
                    <Text span size="xs" c="dimmed">
                      {" "}
                      {describeVerification(detail.data.Verification)}
                    </Text>
                  </Text>
                  <Table.ScrollContainer minWidth={420} mah={320}>
                    <Table striped verticalSpacing={4} fz="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Table</Table.Th>
                          <Table.Th>Source</Table.Th>
                          <Table.Th>Target</Table.Th>
                          <Table.Th>Check</Table.Th>
                          <Table.Th>
                            <VisuallyHidden>Matched</VisuallyHidden>
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {detail.data.Verification.map((row) => (
                          <Table.Tr key={row.Id}>
                            <Table.Td>{row.TableName}</Table.Td>
                            <Table.Td>
                              {row.SourceRowCount?.toLocaleString() ?? "—"}
                            </Table.Td>
                            <Table.Td>
                              {row.TargetRowCount?.toLocaleString() ?? "—"}
                            </Table.Td>
                            <Table.Td>
                              {row.VerificationMethod === "checksum"
                                ? "checksum"
                                : "row count"}
                            </Table.Td>
                            <Table.Td>
                              {row.Matched ? (
                                <IconCheck
                                  size={14}
                                  color="var(--mantine-color-teal-6)"
                                  role="img"
                                  aria-label="Matched"
                                />
                              ) : (
                                <IconX
                                  size={14}
                                  color="var(--mantine-color-red-6)"
                                  role="img"
                                  aria-label="Did not match"
                                />
                              )}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </>
              )}
            </Stack>
          )}
        </QueryStatus>
      </Modal>
    </Container>
  );
}

export default MovesPage;
