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

interface PrivilegesEditorProps {
  servers: DatabaseServerInfoItem[];
  databases: DatabaseInfoItem[];
  value: DatabaseServerPrivilegeInfo[];
  onChange: (next: DatabaseServerPrivilegeInfo[]) => void;
}

const PRIV_FIELDS: ReadonlyArray<{
  key: keyof DatabasePrivileges;
  label: string;
}> = [
  { key: "AllPrivileges", label: "ALL" },
  { key: "SelectPrivilege", label: "SELECT" },
  { key: "InsertPrivilege", label: "INSERT" },
  { key: "UpdatePrivilege", label: "UPDATE" },
  { key: "DeletePrivilege", label: "DELETE" },
  { key: "CreatePrivilege", label: "CREATE" },
  { key: "DropPrivilege", label: "DROP" },
  { key: "GrantPrivilege", label: "GRANT" },
];

export function PrivilegesEditor({
  servers,
  databases,
  value,
  onChange,
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

        return (
          <Paper key={entry.ServerId} withBorder p="sm" radius="md">
            <Group justify="space-between" mb="xs">
              <Title order={6}>{server?.Name ?? `Server #${entry.ServerId}`}</Title>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => removeServer(entry.ServerId)}
                aria-label="Remove server"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>

            {allDbs.length === 0 ? (
              <Text size="xs" c="dimmed">
                No databases registered on this server.
              </Text>
            ) : (
              <Stack gap="xs">
                <Group gap="xs" wrap="wrap">
                  {allDbs.map((db) => (
                    <Checkbox
                      key={db.Id}
                      label={
                        <Text span ff="monospace" size="sm">
                          {db.DatabaseName}
                        </Text>
                      }
                      checked={selectedDbIds.has(db.Id)}
                      onChange={(e) =>
                        toggleDatabase(entry.ServerId, db.Id, e.currentTarget.checked)
                      }
                    />
                  ))}
                </Group>

                {entry.Databases.length > 0 && (
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
                        {entry.Databases.map((d) => {
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

      {availableServers.length > 0 && (
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
