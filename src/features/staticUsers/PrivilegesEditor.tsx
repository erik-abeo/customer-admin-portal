import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useMemo } from "react";

import {
  type DatabaseInfoItem,
  type DatabasePrivilegeInfo,
  type DatabasePrivileges,
  type DatabaseServerInfoItem,
  type DatabaseServerPrivilegeInfo,
  emptyPrivileges,
} from "@/api/types";

import { GRANTABLE_PRIVILEGES, whyNotGrantableStatus } from "./privileges";

interface PrivilegesEditorProps {
  servers: DatabaseServerInfoItem[];
  databases: DatabaseInfoItem[];
  value: DatabaseServerPrivilegeInfo[];
  onChange: (next: DatabaseServerPrivilegeInfo[]) => void;
  /**
   * On edit the set of servers is fixed. The update endpoint only changes a user
   * on servers it already exists on: a server added here would update no rows,
   * and one removed would keep its grants, while the page reported success.
   */
  lockServers?: boolean;
}

// No GRANT column: the service never grants WITH GRANT OPTION.
const PRIV_FIELDS = GRANTABLE_PRIVILEGES;

export function PrivilegesEditor({
  servers,
  databases,
  value,
  onChange,
  lockServers = false,
}: PrivilegesEditorProps) {
  const dbsByServer = useMemo(() => {
    const map = new Map<number, DatabaseInfoItem[]>();
    for (const d of databases) {
      const list = map.get(d.DatabaseServerId) ?? [];
      list.push(d);
      map.set(d.DatabaseServerId, list);
    }
    return map;
  }, [databases]);

  const usedServerIds = new Set(value.map((s) => s.ServerId));
  const availableServers = servers.filter((s) => !usedServerIds.has(s.Id));

  const addServer = (serverIdStr: string | null) => {
    if (!serverIdStr) return;
    const serverId = Number(serverIdStr);
    if (usedServerIds.has(serverId)) return;
    onChange([...value, { ServerId: serverId, Databases: [] }]);
  };

  const removeServer = (serverId: number) => {
    onChange(value.filter((s) => s.ServerId !== serverId));
  };

  const updateServer = (serverId: number, next: DatabaseServerPrivilegeInfo) => {
    onChange(value.map((s) => (s.ServerId === serverId ? next : s)));
  };

  const toggleDatabase = (serverId: number, databaseId: number, checked: boolean) => {
    const entry = value.find((s) => s.ServerId === serverId);
    if (!entry) return;
    let nextDatabases: DatabasePrivilegeInfo[];
    if (checked) {
      if (entry.Databases.some((d) => d.DatabaseId === databaseId)) return;
      nextDatabases = [
        ...entry.Databases,
        { DatabaseId: databaseId, Privileges: emptyPrivileges() },
      ];
    } else {
      nextDatabases = entry.Databases.filter((d) => d.DatabaseId !== databaseId);
    }
    updateServer(serverId, { ...entry, Databases: nextDatabases });
  };

  const togglePrivilege = (
    serverId: number,
    databaseId: number,
    field: keyof DatabasePrivileges,
    checked: boolean,
  ) => {
    const entry = value.find((s) => s.ServerId === serverId);
    if (!entry) return;
    const nextDatabases = entry.Databases.map((d) => {
      if (d.DatabaseId !== databaseId) return d;
      const nextPrivs: DatabasePrivileges = { ...d.Privileges, [field]: checked };
      // If ALL is enabled, keep individual flags as-is on the wire — the
      // server collapses to ALL on its end. We don't auto-uncheck so that
      // toggling ALL off restores the explicit selections.
      return { ...d, Privileges: nextPrivs };
    });
    updateServer(serverId, { ...entry, Databases: nextDatabases });
  };

  if (servers.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Register a database server before granting privileges.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      {value.map((entry) => {
        const server = servers.find((s) => s.Id === entry.ServerId);
        const allDbs = dbsByServer.get(entry.ServerId) ?? [];
        const selectedDbIds = new Set(entry.Databases.map((d) => d.DatabaseId));
        // Held here, but the database is now on another server (a move
        // repointed it) or no longer registered. It has no checkbox under this
        // server, so it gets its own row with a way to remove it; the service
        // refuses every save while it stays.
        const offServer = entry.Databases.filter(
          (d) => !allDbs.some((x) => x.Id === d.DatabaseId),
        );
        const onServer = entry.Databases.filter((d) =>
          allDbs.some((x) => x.Id === d.DatabaseId),
        );

        return (
          <Paper key={entry.ServerId} withBorder p="sm" radius="md">
            <Group justify="space-between" mb="xs">
              <Title order={3} fz="sm" fw={600}>
                {server?.Name ?? `Server #${entry.ServerId}`}
              </Title>
              {!lockServers && (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => removeServer(entry.ServerId)}
                  aria-label={`Remove server ${server?.Name ?? entry.ServerId}`}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>

            {offServer.length > 0 && (
              <Stack gap={4} mb="xs">
                {offServer.map((d) => {
                  const database = databases.find((x) => x.Id === d.DatabaseId);
                  const elsewhere = database
                    ? (servers.find((s) => s.Id === database.DatabaseServerId)?.Name ??
                      `server ${database.DatabaseServerId}`)
                    : null;
                  const name = database?.DatabaseName ?? `database ${d.DatabaseId}`;
                  return (
                    <Group key={d.DatabaseId} gap="xs" wrap="nowrap">
                      <Text size="sm" c="red">
                        <Text span ff="monospace">
                          {name}
                        </Text>
                        {elsewhere
                          ? ` is held here but is now on ${elsewhere}.`
                          : " is held here but no longer exists."}
                      </Text>
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="red"
                        onClick={() =>
                          toggleDatabase(entry.ServerId, d.DatabaseId, false)
                        }
                        aria-label={`Remove ${name} from ${server?.Name ?? `server ${entry.ServerId}`}`}
                      >
                        Remove
                      </Button>
                    </Group>
                  );
                })}
              </Stack>
            )}

            {allDbs.length === 0 ? (
              <Text size="xs" c="dimmed">
                No databases registered on this server.
              </Text>
            ) : (
              <Stack gap="xs">
                <Group gap="xs" wrap="wrap">
                  {allDbs.map((db) => {
                    // The service refuses a database that is not active, and one
                    // refusal refuses the whole request. An unticked one cannot be
                    // picked; a ticked one stays untickable, since it has to be
                    // removed before anything else here can be saved.
                    const unavailable = whyNotGrantableStatus(db.Status);
                    const selected = selectedDbIds.has(db.Id);
                    return (
                      <Checkbox
                        key={db.Id}
                        label={
                          <Text span ff="monospace" size="sm">
                            {db.DatabaseName}
                            {unavailable && (
                              <Text span c="dimmed" size="xs" ff="text">
                                {` (unavailable: ${unavailable})`}
                              </Text>
                            )}
                          </Text>
                        }
                        checked={selected}
                        disabled={unavailable !== null && !selected}
                        onChange={(e) =>
                          toggleDatabase(entry.ServerId, db.Id, e.currentTarget.checked)
                        }
                      />
                    );
                  })}
                </Group>

                {onServer.length > 0 && (
                  <Table.ScrollContainer minWidth={600}>
                    <Table withTableBorder verticalSpacing={4} fz="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Database</Table.Th>
                          {PRIV_FIELDS.map((p) => (
                            <Table.Th key={p.key} ta="center">
                              {p.label}
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {onServer.map((d) => {
                          const db = allDbs.find((x) => x.Id === d.DatabaseId);
                          return (
                            <Table.Tr key={d.DatabaseId}>
                              <Table.Td>
                                <Text ff="monospace" size="xs">
                                  {db?.DatabaseName ?? `#${d.DatabaseId}`}
                                </Text>
                              </Table.Td>
                              {PRIV_FIELDS.map((p) => (
                                <Table.Td key={p.key} ta="center">
                                  <Checkbox
                                    aria-label={`${p.label} on ${db?.DatabaseName ?? `database ${d.DatabaseId}`}`}
                                    checked={d.Privileges[p.key]}
                                    onChange={(e) =>
                                      togglePrivilege(
                                        entry.ServerId,
                                        d.DatabaseId,
                                        p.key,
                                        e.currentTarget.checked,
                                      )
                                    }
                                  />
                                </Table.Td>
                              ))}
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}
              </Stack>
            )}
          </Paper>
        );
      })}

      {!lockServers && availableServers.length > 0 && (
        <Group gap="xs" align="flex-end">
          <Select
            label="Add server"
            placeholder="Pick a server…"
            data={availableServers.map((s) => ({
              value: String(s.Id),
              label: s.Name,
            }))}
            onChange={addServer}
            value={null}
            searchable
            w={280}
          />
          <Text size="xs" c="dimmed">
            Add a server to start granting database privileges to this user.
          </Text>
        </Group>
      )}

      {availableServers.length === 0 && value.length === 0 && (
        <Button variant="default" disabled>
          No servers available
        </Button>
      )}
    </Stack>
  );
}
