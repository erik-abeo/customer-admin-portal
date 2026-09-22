import { Group, SegmentedControl, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { useState } from "react";

import { QueryStatus } from "@/components/common/QueryStatus";

import { historyRows, summarizeHistory, type MetricChange } from "./history";
import { formatBytes } from "./placement";
import { useServerCapacityHistory } from "./queries";

const WINDOWS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "400", label: "All kept" },
];

/**
 * Snapshots are hourly, so a long window holds thousands. The summary covers
 * all of them; the table lists the most recent, which is what anyone reads.
 */
const MAX_ROWS = 200;

const formatUtc = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "—";

const signed = (value: number, format: (n: number) => string) =>
  value === 0 ? "no change" : `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`;

function Figure({
  label,
  change,
  format = (n) => n.toLocaleString(),
}: {
  label: string;
  change: MetricChange | null;
  format?: (n: number) => string;
}) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {change ? (
        <>
          <Text size="lg" fw={600}>
            {format(change.last)}
          </Text>
          <Text size="xs" c="dimmed">
            {signed(change.change, format)} from {format(change.first)}
          </Text>
        </>
      ) : (
        <Text size="lg" c="dimmed">
          —
        </Text>
      )}
    </Stack>
  );
}

/**
 * A server's recorded trend: where it started the window, where it is now, and
 * every snapshot in between.
 *
 * A single measurement says how full a server is. Whether to put the next
 * customer on it or stand up another depends on how fast it is filling, which
 * only the history can say.
 */
export function ServerCapacityHistory({
  databaseServerId,
}: {
  databaseServerId: number;
}) {
  const [days, setDays] = useState("90");
  const history = useServerCapacityHistory(databaseServerId, Number(days));

  const points = history.data?.Points ?? [];
  const summary = summarizeHistory(points);
  const rows = historyRows(points).slice(0, MAX_ROWS);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {summary.from
            ? `${points.length} snapshots, ${formatUtc(summary.from)} to ${formatUtc(summary.to)}`
            : "Recorded by the service every hour."}
        </Text>
        <SegmentedControl
          size="xs"
          aria-label="History window"
          data={WINDOWS}
          value={days}
          onChange={setDays}
        />
      </Group>

      <QueryStatus
        isLoading={history.isLoading}
        error={history.error}
        isEmpty={points.length === 0}
        emptyMessage="No history in this window"
        emptyDescription="Snapshots are only recorded while the server is reachable, so a new or unreachable server has none yet."
        onRetry={() => void history.refetch()}
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Figure label="Customers" change={summary.customers} />
            <Figure label="Users" change={summary.users} />
            <Figure label="Size" change={summary.bytes} format={formatBytes} />
            <Figure label="Connections" change={summary.connections} />
          </SimpleGrid>

          <Table.ScrollContainer minWidth={480} mah={320}>
            <Table striped verticalSpacing={4} fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Taken</Table.Th>
                  <Table.Th>Customers</Table.Th>
                  <Table.Th>Users</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Connections</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.UtcTimestamp}>
                    <Table.Td>{formatUtc(row.UtcTimestamp)}</Table.Td>
                    <Table.Td>{row.CustomerDatabaseCount ?? "—"}</Table.Td>
                    <Table.Td>{row.AuthorizedUserCount ?? "—"}</Table.Td>
                    <Table.Td>
                      {row.TotalBytes === null ? "—" : formatBytes(row.TotalBytes)}
                    </Table.Td>
                    <Table.Td>{row.DatabaseConnections ?? "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {points.length > rows.length && (
            <Text size="xs" c="dimmed">
              Showing the latest {rows.length} of {points.length} snapshots. The figures
              above cover all of them.
            </Text>
          )}
        </Stack>
      </QueryStatus>
    </Stack>
  );
}
