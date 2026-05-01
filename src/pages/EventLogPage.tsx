import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Group,
  NumberInput,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconDownload,
  IconFilter,
  IconLock,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { eventLogApi } from "@/api/eventLog";
import type { EventLogEntry, EventLogQueryParams } from "@/api/types";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { features } from "@/config/env";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { useDatabases } from "@/features/databases/queries";
import { useEventLog } from "@/features/eventLog/queries";
import { downloadCsv, toCsv } from "@/lib/csv";
import { notifyError, notifySuccess } from "@/lib/notify";

export function EventLogPage() {
  if (!features.eventLog) {
    return <EventLogPlaceholder />;
  }
  return <EventLogLive />;
}

function EventLogLive() {
  const servers = useDatabaseServers();
  const databases = useDatabases();

  const [userEmail, setUserEmail] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [databaseServerId, setDatabaseServerId] = useState<string | null>(null);
  const [databaseId, setDatabaseId] = useState<string | null>(null);
  const [fromUtc, setFromUtc] = useState("");
  const [toUtc, setToUtc] = useState("");
  const [eventType, setEventType] = useState("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);

  const [debouncedUser] = useDebouncedValue(userEmail, 250);
  const [debouncedIp] = useDebouncedValue(ipAddress, 250);
  const [debouncedEvent] = useDebouncedValue(eventType, 250);

  const params: EventLogQueryParams = useMemo(
    () => ({
      userEmail: debouncedUser.trim() || undefined,
      ipAddress: debouncedIp.trim() || undefined,
      databaseServerId: databaseServerId ? Number(databaseServerId) : undefined,
      databaseId: databaseId ? Number(databaseId) : undefined,
      fromUtc: fromUtc.trim() || undefined,
      toUtc: toUtc.trim() || undefined,
      eventType: debouncedEvent.trim() || undefined,
      page,
      pageSize,
    }),
    [
      debouncedUser,
      debouncedIp,
      databaseServerId,
      databaseId,
      fromUtc,
      toUtc,
      debouncedEvent,
      page,
      pageSize,
    ],
  );

  const query = useEventLog(params);

  const serverNameById = useMemo(
    () =>
      Object.fromEntries(
        (servers.data ?? []).map((s) => [s.Id, s.Name] as const),
      ) as Record<number, string>,
    [servers.data],
  );
  const databaseNameById = useMemo(
    () =>
      Object.fromEntries(
        (databases.data ?? []).map((d) => [d.Id, d.DatabaseName] as const),
      ) as Record<number, string>,
    [databases.data],
  );

  const items = query.data?.Items ?? [];
  const totalCount = query.data?.TotalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  const clearFilters = () => {
    setUserEmail("");
    setIpAddress("");
    setDatabaseServerId(null);
    setDatabaseId(null);
    setFromUtc("");
    setToUtc("");
    setEventType("");
    setPage(1);
  };

  const handleExport = async () => {
    // Try the backend's CSV endpoint first; if it 404s, fall back to a
    // client-side CSV from the currently loaded page.
    try {
      const blob = await eventLogApi.exportCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event-log-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      notifySuccess("Export downloaded");
    } catch (e) {
      if (items.length === 0) {
        notifyError(e, "Export failed and no rows are loaded to fall back to");
        return;
      }
      const csv = toCsv(
        [
          "Timestamp (UTC)",
          "Event type",
          "User",
          "IP",
          "Server",
          "Database",
          "Message",
          "Details",
        ],
        items.map((row) => [
          row.TimestampUtc,
          row.EventType,
          row.UserEmail ?? "",
          row.IpAddress ?? "",
          row.DatabaseServerId
            ? (serverNameById[row.DatabaseServerId] ?? `srv#${row.DatabaseServerId}`)
            : "",
          row.DatabaseId
            ? (databaseNameById[row.DatabaseId] ?? `db#${row.DatabaseId}`)
            : "",
          row.Message ?? "",
          row.Details ?? "",
        ]),
      );
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadCsv(`event-log-page-${stamp}.csv`, csv);
      notifySuccess("Export of current page downloaded (server export unavailable)");
    }
  };

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Audit"
        title="Event log"
        description="Investigate authorization events, IP activity, and per-database access."
        actions={
          <>
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => void query.refetch()}
                loading={query.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={handleExport}
              disabled={totalCount === 0}
            >
              Export CSV
            </Button>
          </>
        }
      />

      <Stack gap="md">
        <Paper p="md" withBorder>
          <Group gap="xs" mb="xs">
            <IconFilter size={16} />
            <Text size="sm" fw={600}>
              Filters
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              leftSection={<IconX size={12} />}
              onClick={clearFilters}
              ml="auto"
            >
              Clear all
            </Button>
          </Group>
          <Group gap="md" align="flex-end" wrap="wrap">
            <TextInput
              label="User email"
              placeholder="user@example.com"
              leftSection={<IconSearch size={14} />}
              value={userEmail}
              onChange={(e) => {
                setUserEmail(e.currentTarget.value);
                setPage(1);
              }}
              w={240}
            />
            <TextInput
              label="IP address"
              placeholder="203.0.113.10"
              value={ipAddress}
              onChange={(e) => {
                setIpAddress(e.currentTarget.value);
                setPage(1);
              }}
              w={180}
            />
            <Select
              label="Database server"
              placeholder="Any"
              data={(servers.data ?? []).map((s) => ({
                value: String(s.Id),
                label: s.Name,
              }))}
              value={databaseServerId}
              onChange={(v) => {
                setDatabaseServerId(v);
                setDatabaseId(null);
                setPage(1);
              }}
              clearable
              searchable
              w={200}
            />
            <Select
              label="Database"
              placeholder="Any"
              data={(databases.data ?? [])
                .filter(
                  (d) =>
                    !databaseServerId ||
                    String(d.DatabaseServerId) === databaseServerId,
                )
                .map((d) => ({ value: String(d.Id), label: d.DatabaseName }))}
              value={databaseId}
              onChange={(v) => {
                setDatabaseId(v);
                setPage(1);
              }}
              clearable
              searchable
              w={200}
            />
            <TextInput
              label="From (UTC)"
              placeholder="2026-04-01T00:00:00Z"
              value={fromUtc}
              onChange={(e) => {
                setFromUtc(e.currentTarget.value);
                setPage(1);
              }}
              w={200}
            />
            <TextInput
              label="To (UTC)"
              placeholder="2026-04-30T23:59:59Z"
              value={toUtc}
              onChange={(e) => {
                setToUtc(e.currentTarget.value);
                setPage(1);
              }}
              w={200}
            />
            <TextInput
              label="Event type"
              placeholder="login_failed"
              value={eventType}
              onChange={(e) => {
                setEventType(e.currentTarget.value);
                setPage(1);
              }}
              w={180}
            />
            <NumberInput
              label="Page size"
              value={pageSize}
              min={10}
              max={500}
              step={10}
              onChange={(v) => {
                const n = typeof v === "number" ? v : Number(v);
                if (!Number.isNaN(n)) {
                  setPageSize(n);
                  setPage(1);
                }
              }}
              w={120}
            />
          </Group>
        </Paper>

        <QueryStatus
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          loadingSkeleton={{
            rows: 10,
            columnWidths: ["18%", "20%", "18%", "12%", "16%", "16%", "32%"],
            minWidth: 960,
          }}
          isEmpty={items.length === 0}
          emptyMessage={
            totalCount === 0 && !query.isFetching
              ? "No events match the current filters"
              : "No events on this page"
          }
          emptyDescription={
            totalCount === 0
              ? "Try widening the date range, clearing user/IP, or selecting a different server."
              : undefined
          }
        >
          <Card padding={0}>
            <Table.ScrollContainer minWidth={960}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Timestamp (UTC)</Table.Th>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>User</Table.Th>
                    <Table.Th>IP</Table.Th>
                    <Table.Th>Server</Table.Th>
                    <Table.Th>Database</Table.Th>
                    <Table.Th>Message</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {items.map((row) => (
                    <EventRow
                      key={row.Id}
                      row={row}
                      serverNameById={serverNameById}
                      databaseNameById={databaseNameById}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </QueryStatus>

        {totalCount > pageSize && (
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {`Showing ${(page - 1) * pageSize + 1}–${Math.min(
                page * pageSize,
                totalCount,
              )} of ${totalCount}`}
            </Text>
            <Pagination value={page} onChange={setPage} total={pageCount} />
          </Group>
        )}
      </Stack>
    </Container>
  );
}

function EventRow({
  row,
  serverNameById,
  databaseNameById,
}: {
  row: EventLogEntry;
  serverNameById: Record<number, string>;
  databaseNameById: Record<number, string>;
}) {
  const isError =
    row.EventType.toLowerCase().includes("fail") ||
    row.EventType.toLowerCase().includes("denied") ||
    row.EventType.toLowerCase().includes("error");
  return (
    <Table.Tr>
      <Table.Td>
        <Text size="xs" ff="monospace">
          {row.TimestampUtc.replace("T", " ").slice(0, 19)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge variant="light" color={isError ? "red" : "crystal"} radius="sm">
          {row.EventType}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c={row.UserEmail ? undefined : "dimmed"}>
          {row.UserEmail ?? "—"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" ff="monospace" c={row.IpAddress ? undefined : "dimmed"}>
          {row.IpAddress ?? "—"}
        </Text>
      </Table.Td>
      <Table.Td>
        {row.DatabaseServerId
          ? (serverNameById[row.DatabaseServerId] ?? `srv#${row.DatabaseServerId}`)
          : "—"}
      </Table.Td>
      <Table.Td>
        {row.DatabaseId
          ? (databaseNameById[row.DatabaseId] ?? `db#${row.DatabaseId}`)
          : "—"}
      </Table.Td>
      <Table.Td>
        <Text size="sm" lineClamp={2} c={row.Message ? undefined : "dimmed"}>
          {row.Message ?? "—"}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

function EventLogPlaceholder() {
  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Audit"
        title={
          <Group gap="xs" align="center">
            <span>Event log</span>
            <Badge color="yellow" variant="light" leftSection={<IconLock size={12} />}>
              Disabled
            </Badge>
          </Group>
        }
        description="Investigate authorization events, IP activity, and per-database access."
      />
      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Alert color="yellow" variant="light" title="Feature disabled">
            <Text size="sm">
              The Event Log viewer is implemented in the UI but disabled by default
              until the backend endpoints land. To enable, set{" "}
              <Code>VITE_FEATURE_EVENT_LOG=true</Code> and ship the endpoints documented
              in <Anchor href="#">BACKEND-CONTRACT.md</Anchor> under <b>Event Log</b>.
            </Text>
          </Alert>
          <Text size="sm" c="dimmed">
            Required endpoints: <Code>GET /My/event-log</Code> (filtered &amp;
            paginated), <Code>GET /My/event-log/export.csv</Code> (CSV export with the
            same filters). The UI also supports a client-side CSV fallback of the
            currently loaded page if the export endpoint is unavailable.
          </Text>
        </Stack>
      </Paper>
    </Container>
  );
}
