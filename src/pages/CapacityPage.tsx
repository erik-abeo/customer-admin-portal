import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  List,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconRefresh,
  IconServer2,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type { CapacityVerdict, ServerCapacity } from "@/api/types";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { ServerCapacityHistory } from "@/features/capacity/ServerCapacityHistory";
import { useFleetCapacity } from "@/features/capacity/queries";
import {
  formatBytes,
  recommendPlacement,
  totalBytes,
} from "@/features/capacity/placement";

const VERDICT_COLOR: Record<CapacityVerdict, string> = {
  Headroom: "teal",
  NearCapacity: "yellow",
  Full: "red",
  Unreachable: "gray",
  Unknown: "gray",
};

const VERDICT_LABEL: Record<CapacityVerdict, string> = {
  Headroom: "Room",
  NearCapacity: "Near capacity",
  Full: "Full",
  Unreachable: "Unreachable",
  Unknown: "Unknown",
};

/**
 * Where the next customer should go, and why.
 *
 * The verdict is the headline but the reasons are the point. An operator
 * deciding where a customer's records live should be able to see what the
 * recommendation rests on and disagree with it, so every server shows its own
 * reasoning whether or not it was the one recommended.
 */
export function CapacityPage() {
  const fleet = useFleetCapacity();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [trendFor, setTrendFor] = useState<ServerCapacity | null>(null);

  const placement = useMemo(() => recommendPlacement(fleet.data ?? []), [fleet.data]);

  /** Always an array, so the caller can spread it without narrowing first. */
  const renderCustomerRows = (server: ServerCapacity): JSX.Element[] => {
    if (server.Databases.length === 0) {
      return [
        <Table.Tr key={`${server.DatabaseServerId}-empty`}>
          <Table.Td colSpan={7}>
            <Text size="sm" c="dimmed" pl="md">
              No customers on this server yet.
            </Text>
          </Table.Td>
        </Table.Tr>,
      ];
    }

    return server.Databases.map((database) => (
      <Table.Tr key={`${server.DatabaseServerId}-${database.DatabaseId}`}>
        <Table.Td />
        <Table.Td colSpan={2}>
          <Group gap="xs" pl="md">
            <Text size="sm">{database.DatabaseName}</Text>
            <Text size="xs" c="dimmed">
              CPM #{database.CrystalPmId}
            </Text>
            {database.IsOrphaned && (
              <Tooltip
                label="Registered here but not present on the server. A customer the system believes it can reach and cannot."
                withArrow
                multiline
                w={260}
              >
                <Badge color="orange" variant="light" size="sm">
                  Missing
                </Badge>
              </Tooltip>
            )}
          </Group>
        </Table.Td>
        <Table.Td>{database.AuthorizedUserCount}</Table.Td>
        <Table.Td>{formatBytes(database.DataBytes + database.IndexBytes)}</Table.Td>
        {/* A customer row has no connection count of its own, so this column
            carries its sign-ins instead, said in the cell rather than only in a
            tooltip. */}
        <Table.Td>
          <Text size="sm">
            {database.AuthorizationsLast30Days.toLocaleString()} sign-ins in 30 days
          </Text>
        </Table.Td>
        <Table.Td />
      </Table.Tr>
    ));
  };

  const rows = placement.ranked.flatMap((server) => {
    const isExpanded = expanded === server.DatabaseServerId;
    const isRecommended =
      placement.recommended?.DatabaseServerId === server.DatabaseServerId;

    const serverRow = (
      <Table.Tr key={server.DatabaseServerId}>
        <Table.Td>
          <Badge variant="light" color={VERDICT_COLOR[server.Verdict] ?? "gray"}>
            {VERDICT_LABEL[server.Verdict] ?? server.Verdict}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Group gap="xs">
            <Text size="sm" fw={500}>
              {server.Name}
            </Text>
            {isRecommended && (
              <Badge color="teal" size="sm">
                Recommended
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {server.Engine ?? "engine not detected"}
            {server.EngineVersion ? ` ${server.EngineVersion}` : ""}
          </Text>
        </Table.Td>
        <Table.Td>
          {server.CustomerDatabaseCount}
          {server.MaxCustomerDatabases ? ` / ${server.MaxCustomerDatabases}` : ""}
        </Table.Td>
        <Table.Td>{server.AuthorizedUserCount}</Table.Td>
        <Table.Td>{formatBytes(totalBytes(server))}</Table.Td>
        <Table.Td>
          {server.ThreadsConnected !== null && server.MaxConnections !== null
            ? `${server.ThreadsConnected} / ${server.MaxConnections}`
            : "—"}
        </Table.Td>
        <Table.Td>
          <Group gap="xs" justify="flex-end" wrap="nowrap">
            <Button
              size="compact-sm"
              variant="subtle"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Hide customers" : "Customers"} on ${server.Name ?? "this server"}`}
              onClick={() => setExpanded(isExpanded ? null : server.DatabaseServerId)}
            >
              {isExpanded ? "Hide" : "Customers"}
            </Button>
            <Button
              size="compact-sm"
              variant="subtle"
              aria-label={`Trend for ${server.Name ?? "this server"}`}
              onClick={() => setTrendFor(server)}
            >
              Trend
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    );

    const reasonRow = (
      <Table.Tr key={`${server.DatabaseServerId}-reasons`}>
        <Table.Td />
        <Table.Td colSpan={6}>
          {/*
            Shown for every server, not only the problematic ones. A verdict of
            "room" that cannot be interrogated is as much of a black box as one
            of "full".
          */}
          <List size="xs" spacing={2} c="dimmed">
            {server.VerdictReasons.map((reason) => (
              <List.Item key={reason}>{reason}</List.Item>
            ))}
            {server.UnreachableReason && (
              <List.Item c="red">{server.UnreachableReason}</List.Item>
            )}
          </List>
        </Table.Td>
      </Table.Tr>
    );

    return isExpanded
      ? [serverRow, reasonRow, ...renderCustomerRows(server)]
      : [serverRow, reasonRow];
  });

  return (
    <Container size="xl" py="md">
      <PageHeader
        title="Capacity"
        description="How full each server is, measured rather than remembered, and where the next customer should go."
        actions={
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            loading={fleet.isFetching}
            onClick={() => void fleet.refetch()}
          >
            Re-measure
          </Button>
        }
      />

      <QueryStatus
        isLoading={fleet.isLoading}
        error={fleet.error}
        isEmpty={(fleet.data ?? []).length === 0}
        emptyMessage="No database servers registered"
        emptyDescription="Register a server before placing a customer on one."
        onRetry={() => void fleet.refetch()}
      >
        <Stack gap="md">
          <Alert
            variant="light"
            color={placement.recommended ? "teal" : "yellow"}
            icon={
              placement.recommended ? (
                <IconServer2 size={16} />
              ) : (
                <IconAlertTriangle size={16} />
              )
            }
            title={
              placement.recommended ? "Recommended destination" : "No clear destination"
            }
          >
            <Text size="sm">{placement.summary}</Text>
          </Alert>

          {/*
            Near capacity is deliberately never recommended, only offered. The
            warning exists so somebody decides, and a recommendation would take
            that decision back off them.
          */}
          <Group gap="xs">
            <IconInfoCircle size={14} />
            <Text size="xs" c="dimmed">
              Only a server with clear room is recommended. One near capacity can still
              be chosen, deliberately.
            </Text>
          </Group>

          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Verdict</Table.Th>
                  <Table.Th>Server</Table.Th>
                  <Table.Th>Customers</Table.Th>
                  <Table.Th>Users</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Connections</Table.Th>
                  <Table.Th>
                    <VisuallyHidden>Actions</VisuallyHidden>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </QueryStatus>

      <Modal
        opened={trendFor !== null}
        onClose={() => setTrendFor(null)}
        title={`Trend: ${trendFor?.Name ?? ""}`}
        size="lg"
      >
        {trendFor && (
          <ServerCapacityHistory databaseServerId={trendFor.DatabaseServerId} />
        )}
      </Modal>
    </Container>
  );
}

export default CapacityPage;
