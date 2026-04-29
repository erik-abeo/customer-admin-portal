import { Badge, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconActivity, IconCheck, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import {
  type AuditEntry,
  getAuditEntries,
  subscribeAuditEntries,
} from "@/lib/auditLog";
import { formatRelativeTime } from "@/lib/relativeTime";

const METHOD_COLORS: Record<string, string> = {
  POST: "teal",
  PUT: "yellow",
  PATCH: "yellow",
  DELETE: "red",
};

interface RecentActivityProps {
  /** Maximum number of entries to display. Defaults to 5. */
  limit?: number;
  /** Optional title; defaults to "Recent activity". */
  title?: string;
}

/**
 * Live feed of administrative writes captured by the audit-log shim.
 * Subscribes on mount and re-renders as new entries arrive.
 */
export function RecentActivity({
  limit = 5,
  title = "Recent activity",
}: RecentActivityProps) {
  const [entries, setEntries] = useState<ReadonlyArray<AuditEntry>>(() =>
    getAuditEntries(),
  );

  useEffect(() => {
    return subscribeAuditEntries((next) => setEntries(next));
  }, []);

  // Re-render every 30s so relative times stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const recent = entries.slice(-limit).reverse();

  return (
    <Card padding="lg">
      <Group gap="xs" mb="md">
        <ThemeIcon variant="light" color="crystal" radius="md" size="md">
          <IconActivity size={16} stroke={1.7} />
        </ThemeIcon>
        <Text fw={600}>{title}</Text>
        <Text size="xs" c="dimmed" ml="auto">
          Your session
        </Text>
      </Group>

      {recent.length === 0 ? (
        <Stack gap={4} py="md" align="center" ta="center">
          <Text size="sm" c="dimmed">
            No actions yet
          </Text>
          <Text size="xs" c="dimmed" maw={280}>
            Administrative writes (create, update, rotate, delete) made from this tab
            will appear here.
          </Text>
        </Stack>
      ) : (
        <Stack gap="sm">
          {recent.map((entry, i) => {
            const path =
              entry.url.split(/[?#]/)[0]?.split("/").slice(-1)[0] ?? entry.url;
            return (
              <Group
                key={`${entry.timestamp}-${i}`}
                gap="sm"
                wrap="nowrap"
                align="flex-start"
              >
                <ThemeIcon
                  variant="light"
                  radius="xl"
                  size="sm"
                  color={entry.ok ? "teal" : "red"}
                  aria-hidden="true"
                >
                  {entry.ok ? <IconCheck size={12} /> : <IconX size={12} />}
                </ThemeIcon>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap">
                    <Badge
                      size="xs"
                      variant="light"
                      color={METHOD_COLORS[entry.method] ?? "gray"}
                    >
                      {entry.method}
                    </Badge>
                    <Text
                      size="sm"
                      ff="monospace"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                      title={entry.url}
                    >
                      {path}
                    </Text>
                  </Group>
                  <Group gap={6} wrap="nowrap">
                    <Text size="xs" c="dimmed">
                      {entry.status} · {entry.durationMs}ms
                    </Text>
                    <Text size="xs" c="dimmed">
                      ·
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatRelativeTime(entry.timestamp)}
                    </Text>
                  </Group>
                </Stack>
              </Group>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}
