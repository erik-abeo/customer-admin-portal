import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Container,
  CopyButton,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { staticUsersApi } from "@/api/staticUsers";
import type {
  CreateStaticDatabaseUserResponse,
  DatabasePrivilegeInfo,
  DatabaseServerPrivilegeInfo,
  GetStaticDatabaseUserDetailResponse,
  GetStaticDatabaseUserResponse,
  UpdateStaticDatabaseUserResponse,
} from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { features } from "@/config/env";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { useDatabases } from "@/features/databases/queries";
import { StaticUserForm } from "@/features/staticUsers/StaticUserForm";
import {
  useCreateStaticUser,
  useDeleteStaticUser,
  useStaticUsers,
  useUpdateStaticUser,
} from "@/features/staticUsers/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

interface SecretReveal {
  title: string;
  userName: string;
  password?: string | null;
  servers?: { ServerId: number; Message?: string | null }[];
}

/**
 * The list endpoint returns one row per (server, user). Group by username so
 * the UI shows one row per logical user with all servers on the right.
 */
function groupByUserName(rows: GetStaticDatabaseUserResponse[]) {
  const map = new Map<
    string,
    {
      userName: string;
      description: string | null;
      serverIds: number[];
      ids: number[];
      latestModifiedUtc: string;
    }
  >();
  for (const r of rows) {
    const existing = map.get(r.UserName);
    if (existing) {
      if (!existing.serverIds.includes(r.DatabaseServerId)) {
        existing.serverIds.push(r.DatabaseServerId);
      }
      existing.ids.push(r.Id);
      if (r.LastModifiedDateTimeUtc > existing.latestModifiedUtc) {
        existing.latestModifiedUtc = r.LastModifiedDateTimeUtc;
      }
    } else {
      map.set(r.UserName, {
        userName: r.UserName,
        description: r.Description,
        serverIds: [r.DatabaseServerId],
        ids: [r.Id],
        latestModifiedUtc: r.LastModifiedDateTimeUtc,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.userName.localeCompare(b.userName));
}

export function StaticUsersPage() {
  const list = useStaticUsers();
  const servers = useDatabaseServers();
  const databases = useDatabases();
  const create = useCreateStaticUser();
  const update = useUpdateStaticUser();
  const remove = useDeleteStaticUser();

  const confirmDelete = (g: { userName: string; ids: number[] }) => {
    modals.openConfirmModal({
      title: `Delete ${g.userName}?`,
      centered: true,
      children: (
        <Text size="sm">
          This permanently revokes the static user from <b>{g.ids.length}</b> server
          registration{g.ids.length === 1 ? "" : "s"} and drops the underlying MariaDB
          account on each. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete user", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(g.ids);
          notifySuccess(`Deleted ${g.userName}`);
        } catch (e) {
          notifyError(e, "Failed to delete static user");
        }
      },
    });
  };

  const [createOpened, createCtl] = useDisclosure(false);
  const [editTarget, setEditTarget] =
    useState<GetStaticDatabaseUserDetailResponse | null>(null);
  const [editInitialServers, setEditInitialServers] = useState<
    DatabaseServerPrivilegeInfo[] | null
  >(null);
  const [secret, setSecret] = useState<SecretReveal | null>(null);

  const grouped = useMemo(() => groupByUserName(list.data ?? []), [list.data]);
  const serverNameById = useMemo(
    () =>
      Object.fromEntries(
        (servers.data ?? []).map((s) => [s.Id, s.Name] as const),
      ) as Record<number, string>,
    [servers.data],
  );

  const beginEdit = async (anyRowId: number) => {
    try {
      const detail = await staticUsersApi.get(anyRowId);
      // The detail endpoint returns one server's privileges; to edit across
      // every server the user exists on we need to fetch each.
      const allRowsForUser = (list.data ?? []).filter(
        (r) => r.UserName === detail.UserName,
      );
      const serverDetails = await Promise.all(
        allRowsForUser.map((r) => staticUsersApi.get(r.Id)),
      );
      const initialServers: DatabaseServerPrivilegeInfo[] = serverDetails.map((sd) => ({
        ServerId: sd.DatabaseServerId,
        Databases: (sd.DatabasePrivileges ?? []) as DatabasePrivilegeInfo[],
      }));
      setEditTarget(detail);
      setEditInitialServers(initialServers);
    } catch (e) {
      notifyError(e, "Failed to load user details");
    }
  };

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Service accounts"
        title="Static database users"
        description="Long-lived MariaDB users with explicit per-database privileges. Used by service integrations and tooling, not customer logins."
        actions={
          <>
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => void list.refetch()}
                loading={list.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <RequireRole role="admin">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={createCtl.open}
                disabled={(servers.data ?? []).length === 0}
              >
                Create static user
              </Button>
            </RequireRole>
          </>
        }
      />

      <Stack gap="md">
        <QueryStatus
          isLoading={list.isLoading || servers.isLoading || databases.isLoading}
          error={list.error ?? servers.error ?? databases.error}
          onRetry={() => {
            void list.refetch();
            void servers.refetch();
            void databases.refetch();
          }}
          loadingSkeleton={{ rows: 6, columns: 5 }}
          isEmpty={grouped.length === 0}
          emptyMessage="No static database users yet"
          emptyDescription="Provision the first long-lived service user with explicit per-database privileges."
          emptyAction={
            (servers.data ?? []).length > 0 ? (
              <RequireRole role="admin">
                <Button leftSection={<IconPlus size={16} />} onClick={createCtl.open}>
                  Create your first static user
                </Button>
              </RequireRole>
            ) : undefined
          }
        >
          <Card padding={0}>
            <Table.ScrollContainer minWidth={720}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Username</Table.Th>
                    <Table.Th>Servers</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Last modified (UTC)</Table.Th>
                    <Table.Th style={{ width: 110 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {grouped.map((g) => (
                    <Table.Tr key={g.userName}>
                      <Table.Td>
                        <Text ff="monospace" size="sm">
                          {g.userName}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="wrap">
                          {g.serverIds.map((sid) => (
                            <Badge key={sid} variant="light" color="crystal">
                              {serverNameById[sid] ?? `#${sid}`}
                            </Badge>
                          ))}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          size="sm"
                          c={g.description ? undefined : "dimmed"}
                          lineClamp={2}
                        >
                          {g.description ?? "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" ff="monospace">
                          {g.latestModifiedUtc.replace("T", " ").slice(0, 19)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Edit user">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => beginEdit(g.ids[0]!)}
                                aria-label="Edit"
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </RequireRole>
                          {features.deletes && (
                            <RequireRole role="admin" fallback="disable">
                              <Tooltip label="Delete user">
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  onClick={() => confirmDelete(g)}
                                  aria-label="Delete"
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </RequireRole>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </QueryStatus>
      </Stack>

      <Modal
        opened={createOpened}
        onClose={createCtl.close}
        title="Create static database user"
        size="xl"
      >
        <StaticUserForm
          servers={servers.data ?? []}
          databases={databases.data ?? []}
          submitLabel="Create user"
          onCancel={createCtl.close}
          submitting={create.isPending}
          onSubmit={async (payload) => {
            try {
              const res = (await create.mutateAsync(
                payload as Parameters<typeof create.mutateAsync>[0],
              )) as CreateStaticDatabaseUserResponse;
              notifySuccess(`Created ${res.UserName}`);
              createCtl.close();
              setSecret({
                title: "Static user created",
                userName: res.UserName,
                password: res.Servers?.[0]?.Password ?? null,
                servers: res.Servers?.map((s) => ({
                  ServerId: s.ServerId,
                  Message: s.Message,
                })),
              });
            } catch (e) {
              notifyError(e, "Failed to create static user");
            }
          }}
        />
      </Modal>

      <Modal
        opened={editTarget !== null}
        onClose={() => {
          setEditTarget(null);
          setEditInitialServers(null);
        }}
        title={editTarget ? `Edit ${editTarget.UserName}` : "Edit"}
        size="xl"
      >
        {editTarget && (
          <StaticUserForm
            servers={servers.data ?? []}
            databases={databases.data ?? []}
            initial={editTarget}
            initialServers={editInitialServers ?? []}
            submitLabel="Save changes"
            onCancel={() => {
              setEditTarget(null);
              setEditInitialServers(null);
            }}
            submitting={update.isPending}
            onSubmit={async (payload) => {
              try {
                const res = (await update.mutateAsync(
                  payload as Parameters<typeof update.mutateAsync>[0],
                )) as UpdateStaticDatabaseUserResponse;
                notifySuccess(`Updated ${res.UserName}`);
                setEditTarget(null);
                setEditInitialServers(null);
                if (res.NewPassword) {
                  setSecret({
                    title: "Password rotated",
                    userName: res.UserName,
                    password: res.NewPassword,
                    servers: res.Servers,
                  });
                }
              } catch (e) {
                notifyError(e, "Failed to update static user");
              }
            }}
          />
        )}
      </Modal>

      <Modal
        opened={secret !== null}
        onClose={() => setSecret(null)}
        title={secret?.title ?? ""}
        size="md"
        centered
      >
        {secret && (
          <Stack gap="md">
            <Alert color="yellow" variant="light">
              These credentials are shown only once. Copy and store them securely now —
              they cannot be retrieved later.
            </Alert>
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Username
              </Text>
              <Group gap="xs">
                <Code>{secret.userName}</Code>
                <CopyButton value={secret.userName}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? "Copied" : "Copy"}>
                      <ActionIcon variant="subtle" onClick={copy} aria-label="Copy">
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            </Stack>
            {secret.password && (
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Password
                </Text>
                <Group gap="xs">
                  <Code>{secret.password}</Code>
                  <CopyButton value={secret.password}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? "Copied" : "Copy"}>
                        <ActionIcon variant="subtle" onClick={copy} aria-label="Copy">
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Stack>
            )}
            {secret.servers && secret.servers.length > 0 && (
              <Stack gap={2}>
                <Text size="sm" fw={500}>
                  Per-server status
                </Text>
                {secret.servers.map((s) => (
                  <Text key={s.ServerId} size="xs" c="dimmed">
                    {serverNameById[s.ServerId] ?? `Server #${s.ServerId}`}:{" "}
                    {s.Message ?? "OK"}
                  </Text>
                ))}
              </Stack>
            )}
            <Group justify="flex-end">
              <Button onClick={() => setSecret(null)}>Done</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
