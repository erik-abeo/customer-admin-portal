import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Container,
  Group,
  Modal,
  Progress,
  Stack,
  Table,
  Text,
  Timeline,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconKey,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";

import type {
  CreateMigrationSessionRequest,
  CreateMigrationSessionResponse,
  MigrationSessionItem,
} from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { useDatabases } from "@/features/databases/queries";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { serverStatuses } from "@/features/databaseServers/status";
import { MigrationTargetForm } from "@/features/migrations/MigrationTargetForm";
import {
  useCreateMigrationSession,
  useDiscardMigrationTarget,
  useMigrationSession,
  useMigrationSessions,
  useRevokeMigrationSession,
} from "@/features/migrations/queries";
import {
  canDiscardTarget,
  canRevoke,
  revokeEndsAStream,
} from "@/features/migrations/sessionActions";
import { notifyError, notifySuccess } from "@/lib/notify";

const STATUS_COLOR: Record<string, string> = {
  pending: "blue",
  redeemed: "cyan",
  streaming: "indigo",
  completed: "teal",
  failed: "red",
  expired: "gray",
  revoked: "gray",
};

const formatUtc = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "—";

/** What a session is aiming at, whether or not the database exists yet. */
const describeDestination = (session: MigrationSessionItem) => {
  const database =
    session.DatabaseName ?? session.ProvisionDatabaseName ?? "(not yet created)";
  const server = session.DatabaseServerName ?? `server ${session.DatabaseServerId}`;
  return `${database} on ${server}`;
};

/**
 * Minting and watching the keys that move a customer onto a remote database.
 *
 * The flow is deliberately three steps rather than one. Choosing a destination,
 * confirming it in words, and only then being shown a key. A key authorises an
 * installer to stream one customer's database over another's, which cannot be
 * undone, so the friction is the feature.
 */
export function MigrationsPage() {
  const sessions = useMigrationSessions();
  const servers = useDatabaseServers();
  const databases = useDatabases();

  const createSession = useCreateMigrationSession();
  const revokeSession = useRevokeMigrationSession();
  const discardTarget = useDiscardMigrationTarget();

  const [formOpen, setFormOpen] = useState(false);
  // Each server's recorded status comes with the server list already loaded.
  const statuses = serverStatuses(servers.data);
  const [pending, setPending] = useState<{
    request: CreateMigrationSessionRequest;
    description: string;
  } | null>(null);
  const [mintedKey, setMintedKey] = useState<CreateMigrationSessionResponse | null>(
    null,
  );

  // The mutation's cached result holds the key too, so it is cleared along with
  // the modal rather than left in memory after the operator has copied it.
  const closeMintedKey = () => {
    setMintedKey(null);
    createSession.reset();
  };
  const [detailId, setDetailId] = useState<number | null>(null);

  const detail = useMigrationSession(detailId ?? undefined);

  const confirmAndMint = async () => {
    if (!pending) return;
    try {
      const response = await createSession.mutateAsync(pending.request);
      if (!response.Success) {
        notifyError(
          new Error(response.Message ?? "Could not create the migration key"),
        );
        return;
      }
      setPending(null);
      setFormOpen(false);
      // Shown before anything else, because this is the only moment the key
      // exists outside the operator's hands.
      setMintedKey(response);
    } catch (error) {
      notifyError(error);
    }
  };

  const confirmRevoke = (session: MigrationSessionItem) =>
    modals.openConfirmModal({
      title: "Revoke this migration key?",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            The key starting <Code>{session.MigrationKeyPrefix}</Code> for customer{" "}
            <b>{session.CrystalPmId}</b> will stop working immediately.
          </Text>
          {revokeEndsAStream(session) && (
            <Text size="sm">
              It has already been redeemed, so the installer&apos;s database login is
              dropped and its connections ended: the stream stops mid-copy. Whatever it
              had written stays in the target until that is discarded.
            </Text>
          )}
        </Stack>
      ),
      labels: { confirm: "Revoke key", cancel: "Keep it" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          const result = await revokeSession.mutateAsync(session.Id);
          if (result.Success) notifySuccess(result.Message ?? "Migration key revoked.");
          else notifyError(new Error(result.Message ?? "Could not revoke the key"));
        } catch (error) {
          notifyError(error);
        }
      },
    });

  const confirmDiscard = (session: MigrationSessionItem) =>
    modals.openConfirmModal({
      title: "Discard this migration's target?",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            <Code>{session.DatabaseName ?? session.ProvisionDatabaseName}</Code> on{" "}
            <b>{session.DatabaseServerName ?? `server ${session.DatabaseServerId}`}</b>{" "}
            will be dropped, along with its registration. Whatever the failed migration
            managed to copy goes with it.
          </Text>
          <Text size="sm" c="dimmed">
            Only offered for a database this migration created. One that already existed
            is refused, because it is not this migration&apos;s to drop.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Drop the database", cancel: "Keep it" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          const result = await discardTarget.mutateAsync(session.Id);
          if (result.Success) notifySuccess(result.Message ?? "Target discarded.");
          else notifyError(new Error(result.Message ?? "Could not discard the target"));
        } catch (error) {
          notifyError(error);
        }
      },
    });

  const rows = (sessions.data ?? []).map((session) => (
    <Table.Tr key={session.Id}>
      <Table.Td>
        <Badge variant="light" color={STATUS_COLOR[session.Status ?? ""] ?? "gray"}>
          {session.Status ?? "unknown"}
        </Badge>
      </Table.Td>
      <Table.Td>{session.CrystalPmId}</Table.Td>
      <Table.Td>
        <Text size="sm">{describeDestination(session)}</Text>
      </Table.Td>
      <Table.Td>
        <Code>{session.MigrationKeyPrefix ?? "—"}</Code>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c={session.ErrorMessage ? "red" : undefined}>
          {session.ErrorMessage ?? session.Phase ?? "—"}
        </Text>
      </Table.Td>
      <Table.Td>{formatUtc(session.CreatedDateTimeUtc)}</Table.Td>
      <Table.Td>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <Button
            size="compact-sm"
            variant="subtle"
            aria-label={`Details of migration ${session.Id} for customer ${session.CrystalPmId}`}
            onClick={() => setDetailId(session.Id)}
          >
            Details
          </Button>
          <RequireRole role="admin">
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              aria-label={`Revoke the key for customer ${session.CrystalPmId}`}
              disabled={!canRevoke(session)}
              onClick={() => confirmRevoke(session)}
            >
              Revoke
            </Button>
            {/*
              Only shown for a target this migration created and that is still
              there. A session that streamed into a pre-existing database never
              offers it, so the destructive action is absent rather than present
              and refused.
            */}
            {canDiscardTarget(session) && (
              <Button
                size="compact-sm"
                variant="subtle"
                color="red"
                aria-label={`Discard target of migration ${session.Id}`}
                onClick={() => confirmDiscard(session)}
              >
                Discard target
              </Button>
            )}
          </RequireRole>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl" py="md">
      <PageHeader
        title="Migrations"
        description="Mint a key that moves one customer onto a remote database, and watch it run."
        actions={
          <RequireRole role="admin">
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setFormOpen(true)}
            >
              New migration
            </Button>
          </RequireRole>
        }
      />

      <QueryStatus
        isLoading={sessions.isLoading}
        error={sessions.error}
        isEmpty={(sessions.data ?? []).length === 0}
        emptyMessage="No migrations yet"
        emptyDescription="Minting a key is the first step in moving a customer onto a remote database."
        onRetry={() => void sessions.refetch()}
      >
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Status</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Destination</Table.Th>
                <Table.Th>Key</Table.Th>
                <Table.Th>Phase</Table.Th>
                <Table.Th>Created</Table.Th>
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
        title="New migration"
        size="lg"
      >
        <MigrationTargetForm
          servers={servers.data ?? []}
          databases={databases.data ?? []}
          serverStatuses={statuses}
          submitting={createSession.isPending}
          onCancel={() => setFormOpen(false)}
          onSubmit={(request, description) => setPending({ request, description })}
        />
      </Modal>

      {/*
        The destination is stated back in words before a key exists. Carried over
        from the upload modal removed in 4a24044, where the same confirmation
        guarded the same mistake.
      */}
      <Modal
        opened={pending !== null}
        onClose={() => setPending(null)}
        title="Confirm the destination"
        size="md"
      >
        {pending && (
          <Stack gap="md">
            <Alert
              color="yellow"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
            >
              <Text size="sm">
                A key will be minted that lets an installer stream{" "}
                <b>{pending.description}</b>. Streaming one customer&apos;s records over
                another&apos;s is irreversible.
              </Text>
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setPending(null)}>
                Go back
              </Button>
              <Button
                color="yellow"
                loading={createSession.isPending}
                onClick={() => void confirmAndMint()}
              >
                Mint the key
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/*
        Reveal-once, matching the static-user password modal. The key is stored
        only as a hash, so closing this without copying means revoking the
        session and minting another.
      */}
      {/*
        Neither Escape nor a close button dismisses it: both are one keystroke
        from losing a key that cannot be shown again. The button is the only way
        out.
      */}
      <Modal
        opened={mintedKey !== null}
        onClose={closeMintedKey}
        title="Migration key"
        size="md"
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
      >
        {mintedKey && (
          <Stack gap="md">
            <Alert color="teal" variant="light" icon={<IconKey size={16} />}>
              <Text size="sm">
                Copy this now. It is stored only as a hash and cannot be shown again.
              </Text>
            </Alert>
            <Group gap="xs">
              <Code fz="lg" px="sm" py={6}>
                {mintedKey.MigrationKey}
              </Code>
              <CopyButton value={mintedKey.MigrationKey ?? ""}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy key"} withArrow>
                    <Button
                      variant="light"
                      color={copied ? "teal" : "gray"}
                      onClick={copy}
                      leftSection={
                        copied ? <IconCheck size={16} /> : <IconCopy size={16} />
                      }
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            {/*
              The server's own summary, which appends a warning when this customer
              already has a database on another server.
            */}
            <Text size="sm">{mintedKey.TargetSummary}</Text>
            <Text size="xs" c="dimmed">
              Expires {formatUtc(mintedKey.ExpiresUtc)}.
            </Text>
            <Group justify="flex-end">
              <Button onClick={closeMintedKey}>I have copied the key</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Migration detail"
        size="lg"
      >
        <QueryStatus isLoading={detail.isLoading} error={detail.error}>
          {detail.data?.Session && (
            <Stack gap="md">
              <Group gap="xs">
                <Badge
                  variant="light"
                  color={STATUS_COLOR[detail.data.Session.Status ?? ""] ?? "gray"}
                >
                  {detail.data.Session.Status ?? "unknown"}
                </Badge>
                <Text size="sm">{describeDestination(detail.data.Session)}</Text>
              </Group>

              {detail.data.Session.ErrorMessage && (
                <Alert color="red" variant="light" icon={<IconX size={16} />}>
                  <Text size="sm">{detail.data.Session.ErrorMessage}</Text>
                </Alert>
              )}

              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  Redeemed {formatUtc(detail.data.Session.RedeemedDateTimeUtc)}
                  {detail.data.Session.ClientPublicIp
                    ? ` from ${detail.data.Session.ClientPublicIp}`
                    : ""}
                </Text>
                <Text size="xs" c="dimmed">
                  Last heartbeat {formatUtc(detail.data.Session.LastHeartbeatUtc)}
                </Text>
              </Stack>

              {/*
                Oldest first, so the timeline reads forwards. A migration that died
                partway leaves its last phase and table here, which is the whole
                point of recording progress rather than only an outcome.
              */}
              {detail.data.Progress.length > 0 ? (
                <Timeline
                  active={detail.data.Progress.length}
                  bulletSize={16}
                  lineWidth={2}
                >
                  {detail.data.Progress.map((entry) => (
                    <Timeline.Item
                      key={entry.Id}
                      color={entry.IsError ? "red" : "teal"}
                      title={
                        <Text size="sm" fw={500}>
                          {entry.Phase ?? "Progress"}
                          {entry.TableName ? ` · ${entry.TableName}` : ""}
                        </Text>
                      }
                    >
                      {entry.RowsTotal ? (
                        <Progress
                          my={6}
                          aria-label={`${entry.TableName ?? entry.Phase ?? "Progress"}: ${(
                            entry.RowsDone ?? 0
                          ).toLocaleString()} of ${entry.RowsTotal.toLocaleString()} rows`}
                          value={((entry.RowsDone ?? 0) / entry.RowsTotal) * 100}
                          size="sm"
                        />
                      ) : null}
                      {entry.Message && <Text size="xs">{entry.Message}</Text>}
                      <Text size="xs" c="dimmed">
                        {formatUtc(entry.UtcTimestamp)}
                      </Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              ) : (
                <Text size="sm" c="dimmed">
                  No progress reported yet. The installer sends its first update when it
                  redeems the key.
                </Text>
              )}
            </Stack>
          )}
        </QueryStatus>
      </Modal>
    </Container>
  );
}

export default MigrationsPage;
