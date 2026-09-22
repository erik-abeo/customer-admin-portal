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
import { MigrationTargetForm } from "@/features/migrations/MigrationTargetForm";
import {
  useCreateMigrationSession,
  useMigrationSession,
  useMigrationSessions,
  useRevokeMigrationSession,
} from "@/features/migrations/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

/** Statuses a session can still move out of, and therefore still be revoked from. */
const REVOCABLE = new Set(["pending", "redeemed", "streaming"]);

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

  const [formOpen, setFormOpen] = useState(false);
  const [pending, setPending] = useState<{
    request: CreateMigrationSessionRequest;
    description: string;
  } | null>(null);
  const [mintedKey, setMintedKey] = useState<CreateMigrationSessionResponse | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const detail = useMigrationSession(detailId ?? undefined);

  const confirmAndMint = async () => {
    if (!pending) return;
    try {
      const response = await createSession.mutateAsync(pending.request);
      if (!response.Success) {
        notifyError(new Error(response.Message ?? "Could not create the migration key"));
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
        <Text size="sm">
          The key ending <Code>{session.MigrationKeyPrefix}</Code> for customer{" "}
          <b>{session.CrystalPmId}</b> will stop working immediately. Any migration
          already running under it will fail at its next call.
        </Text>
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

  const rows = (sessions.data ?? []).map((session) => (
    <Table.Tr key={session.Id}>
      <Table.Td>
        <Badge variant="light" color={STATUS_COLOR[session.Status] ?? "gray"}>
          {session.Status}
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
          <Button size="compact-sm" variant="subtle" onClick={() => setDetailId(session.Id)}>
            Details
          </Button>
          <RequireRole role="admin">
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              disabled={!REVOCABLE.has(session.Status)}
              onClick={() => confirmRevoke(session)}
            >
              Revoke
            </Button>
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
            <Button leftSection={<IconPlus size={16} />} onClick={() => setFormOpen(true)}>
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
        title="New migration"
        size="lg"
      >
        <MigrationTargetForm
          servers={servers.data ?? []}
          databases={databases.data ?? []}
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
            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
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
      <Modal
        opened={mintedKey !== null}
        onClose={() => setMintedKey(null)}
        title="Migration key"
        size="md"
        closeOnClickOutside={false}
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
                      leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
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
              <Button onClick={() => setMintedKey(null)}>Done</Button>
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
                  color={STATUS_COLOR[detail.data.Session.Status] ?? "gray"}
                >
                  {detail.data.Session.Status}
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
                <Timeline active={detail.data.Progress.length} bulletSize={16} lineWidth={2}>
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
