import { Button, Checkbox, Group, Stack, Text, Title } from "@mantine/core";
import { useMemo } from "react";

import type {
  DatabaseInfoItem,
  DatabaseMapping,
  DatabaseServerInfoItem,
} from "@/api/types";

interface DatabaseMappingsEditorProps {
  servers: DatabaseServerInfoItem[];
  databases: DatabaseInfoItem[];
  value: DatabaseMapping[];
  onChange: (next: DatabaseMapping[]) => void;
}

const mappingKey = (m: { DatabaseServerId: number; DatabaseId: number }) =>
  `${m.DatabaseServerId}:${m.DatabaseId}`;

export function DatabaseMappingsEditor({
  servers,
  databases,
  value,
  onChange,
}: DatabaseMappingsEditorProps) {
  const selected = useMemo(() => new Set(value.map(mappingKey)), [value]);

  const dbsByServer = useMemo(() => {
    const map = new Map<number, DatabaseInfoItem[]>();
    for (const d of databases) {
      const list = map.get(d.DatabaseServerId) ?? [];
      list.push(d);
      map.set(d.DatabaseServerId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.DatabaseName.localeCompare(b.DatabaseName));
    }
    return map;
  }, [databases]);

  const toggle = (serverId: number, databaseId: number, checked: boolean) => {
    const k = mappingKey({ DatabaseServerId: serverId, DatabaseId: databaseId });
    if (checked) {
      if (!selected.has(k)) {
        onChange([...value, { DatabaseServerId: serverId, DatabaseId: databaseId }]);
      }
    } else {
      onChange(
        value.filter(
          (m) => !(m.DatabaseServerId === serverId && m.DatabaseId === databaseId),
        ),
      );
    }
  };

  // Held pairs that match no checkbox: the database has moved to another server
  // since the mapping was saved, or no longer exists. Without a row of their
  // own they would be sent back unseen, and the service refuses a pair that
  // names the wrong server.
  const unmatched = value.filter(
    (m) =>
      !databases.some(
        (d) => d.Id === m.DatabaseId && d.DatabaseServerId === m.DatabaseServerId,
      ),
  );
  const remove = (pair: DatabaseMapping) =>
    onChange(
      value.filter(
        (m) =>
          !(
            m.DatabaseServerId === pair.DatabaseServerId &&
            m.DatabaseId === pair.DatabaseId
          ),
      ),
    );

  const unmatchedRows =
    unmatched.length === 0 ? null : (
      <Stack gap={4}>
        {unmatched.map((m) => {
          const database = databases.find((d) => d.Id === m.DatabaseId);
          const serverName = (id: number) =>
            servers.find((s) => s.Id === id)?.Name ?? `server ${id}`;
          const name = database?.DatabaseName ?? `database ${m.DatabaseId}`;
          return (
            <Group key={mappingKey(m)} gap="xs" wrap="nowrap">
              <Text size="sm" c="red">
                <Text span ff="monospace">
                  {name}
                </Text>
                {database
                  ? ` is mapped under ${serverName(m.DatabaseServerId)} but is now on ${serverName(database.DatabaseServerId)}. Remove it, then tick it under its server.`
                  : ` is mapped under ${serverName(m.DatabaseServerId)} but no longer exists. Remove it.`}
              </Text>
              <Button
                size="compact-xs"
                variant="light"
                color="red"
                onClick={() => remove(m)}
                aria-label={`Remove mapping to ${name}`}
              >
                Remove
              </Button>
            </Group>
          );
        })}
      </Stack>
    );

  if (servers.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No database servers registered yet.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      {unmatchedRows}
      {servers.map((server) => {
        const dbs = dbsByServer.get(server.Id) ?? [];
        return (
          <Stack key={server.Id} gap="xs">
            <Title order={3} fz="sm" fw={600}>
              {server.Name}{" "}
              <Text span size="xs" c="dimmed" fw={400}>
                ({server.LocalServerAddress}:{server.ServerPort})
              </Text>
            </Title>
            {dbs.length === 0 ? (
              <Text size="xs" c="dimmed">
                No databases registered on this server.
              </Text>
            ) : (
              <Stack gap={4} pl="sm">
                {dbs.map((db) => {
                  const k = mappingKey({
                    DatabaseServerId: server.Id,
                    DatabaseId: db.Id,
                  });
                  return (
                    <Checkbox
                      key={db.Id}
                      label={
                        <Text size="sm">
                          <Text span ff="monospace">
                            {db.DatabaseName}
                          </Text>{" "}
                          <Text span c="dimmed" size="xs">
                            (CrystalPM #{db.CrystalPmId})
                          </Text>
                        </Text>
                      }
                      checked={selected.has(k)}
                      onChange={(e) =>
                        toggle(server.Id, db.Id, e.currentTarget.checked)
                      }
                    />
                  );
                })}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
