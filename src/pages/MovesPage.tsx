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

import type { CustomerMove } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { useDatabases } from "@/features/databases/queries";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import {
  useCreateCustomerMove,
  useCustomerMove,
  useCustomerMoves,
  useDropCustomerMoveSource,
  useRollBackCustomerMove,
} from "@/features/moves/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

const STATUS_COLOR: Record<string, string> = {
  planned: "blue",
  quiescing: "cyan",
  draining: "cyan",
  copying: "indigo",
  verifying: "violet",
  flipped: "teal",
  settled: "green",
  failed: "red",
  rolled_back: "orange",
};

/** Phases during which the customer cannot start new sessions. */
const QUIESCED: Set<string> = new Set(["quiescing", "draining", "copying", "verifying"]);

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
        RequestedByAdmin: null,
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

  const confirmRollBack = (move: CustomerMove) =>
    modals.openConfirmModal({
      title: "Point this customer back at the source?",
      children: (
        <Text size="sm">
          Customer <b>{move.CrystalPmId}</b> will go back to{" "}
          <Code>{move.SourceDatabaseName}</Code> on{" "}
          <b>{move.SourceDatabaseServerName}</b>, which still holds everything it did
          before the move. The copy on the target is left in place.
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
            Until now this move could be rolled back with a single click. Afterwards
            the only copy of customer {move.CrystalPmId}&apos;s records is the one on{" "}
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
          <Badge variant="light" color={STATUS_COLOR[move.Status] ?? "gray"}>
            {move.Status.replace("_", " ")}
          </Badge>
          {/*
            The thing worth seeing without opening anything: during these phases
            the practice cannot open CrystalPM.
          */}
          {QUIESCED.has(move.Status) && (
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
          <Button size="compact-sm" variant="subtle" onClick={() => setDetailId(move.Id)}>
            Details
          </Button>
          <RequireRole role="admin">
            {move.Status === "flipped" && !move.SourceDroppedDateTimeUtc && (
              <>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="orange"
                  onClick={() => confirmRollBack(move)}
                >
                  Roll back
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="red"
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

  const canPlan = databaseId !== "" && targetServerId !== "";

  return (
    <Container size="xl" py="md">
      <PageHeader
        title="Customer moves"
        description="Move a customer's database to another server, verified before anything cuts over."
        actions={
          <RequireRole role="admin">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setFormOpen(true)}>
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
                <Table.Th />
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
              The customer stays online until their open sessions end on their own. From
              then until the copy is verified they cannot use CrystalPM, so this is worth
              starting when the practice is closed.
            </Text>
          </Alert>

          <Select
            label="Customer database"
            placeholder="Pick the database to move"
            required
            searchable
            data={(databases.data ?? []).map((d) => ({
              value: String(d.Id),
              label: `${d.DatabaseName} (CPM #${d.CrystalPmId})`,
            }))}
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
              onClick={() => void planMove()}
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
                <Badge variant="light" color={STATUS_COLOR[detail.data.Move.Status] ?? "gray"}>
                  {detail.data.Move.Status.replace("_", " ")}
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
                    Cut over. The source is still there, so this can be rolled back with a
                    single click until it is dropped.
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
                      nothing about the values in them, so a move verified by
                      count was checked less thoroughly than one by checksum.
                    */}
                    <Text span size="xs" c="dimmed">
                      {" "}
                      by {detail.data.Verification[0].VerificationMethod === "checksum"
                        ? "table checksum"
                        : "row count only, so the values themselves were not compared"}
                    </Text>
                  </Text>
                  <Table.ScrollContainer minWidth={420} mah={320}>
                    <Table striped verticalSpacing={4} fz="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Table</Table.Th>
                          <Table.Th>Source</Table.Th>
                          <Table.Th>Target</Table.Th>
                          <Table.Th />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {detail.data.Verification.map((row) => (
                          <Table.Tr key={row.Id}>
                            <Table.Td>{row.TableName}</Table.Td>
                            <Table.Td>{row.SourceRowCount?.toLocaleString() ?? "—"}</Table.Td>
                            <Table.Td>{row.TargetRowCount?.toLocaleString() ?? "—"}</Table.Td>
                            <Table.Td>
                              {row.Matched ? (
                                <IconCheck size={14} color="var(--mantine-color-teal-6)" />
                              ) : (
                                <IconX size={14} color="var(--mantine-color-red-6)" />
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
