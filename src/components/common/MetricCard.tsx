import { Badge, Card, Group, Loader, Skeleton, Text } from "@mantine/core";
import { IconArrowUpRight, type Icon } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/httpClient";

export type MetricTone = "primary" | "violet" | "teal" | "amber" | "gray";

interface BaseProps {
  icon: Icon;
  label: string;
  description?: ReactNode;
  tone?: MetricTone;
}

interface ActiveMetricProps extends BaseProps {
  to: string;
  value: number | null;
  isLoading: boolean;
  error?: unknown;
}

export function MetricCard({
  to,
  icon: Icon,
  label,
  value,
  isLoading,
  error,
  description,
  tone = "primary",
}: ActiveMetricProps) {
  return (
    <Card
      component={Link}
      to={to}
      className="metric-card"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Group justify="space-between" align="flex-start" mb="md">
        <span
          className="metric-icon"
          data-tone={tone === "primary" ? undefined : tone}
          aria-hidden="true"
        >
          <Icon size={20} stroke={1.7} />
        </span>
        <IconArrowUpRight size={16} stroke={1.6} color="var(--mantine-color-dimmed)" />
      </Group>

      <Text size="sm" c="dimmed" fw={500}>
        {label}
      </Text>

      {isLoading ? (
        <Skeleton height={32} mt={6} width={80} radius="sm" />
      ) : error ? (
        <Text fw={700} size="xl" c="red" mt={2}>
          {error instanceof ApiError ? `× ${error.status || "err"}` : "×"}
        </Text>
      ) : (
        <Text
          fw={700}
          mt={2}
          style={{ fontSize: 28, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}
        >
          {value ?? "—"}
        </Text>
      )}

      {description && (
        <Text size="xs" c="dimmed" mt="xs">
          {description}
        </Text>
      )}
    </Card>
  );
}

interface PlaceholderMetricProps extends BaseProps {
  reason: string;
}

export function PlaceholderMetricCard({
  icon: Icon,
  label,
  reason,
  tone = "gray",
}: PlaceholderMetricProps) {
  return (
    <Card>
      <Group justify="space-between" align="flex-start" mb="md">
        <span
          className="metric-icon"
          data-tone={tone === "primary" ? undefined : tone}
          aria-hidden="true"
        >
          <Icon size={20} stroke={1.7} />
        </span>
        <Badge color="gray" variant="light" size="sm">
          Pending backend
        </Badge>
      </Group>
      <Text size="sm" c="dimmed" fw={500}>
        {label}
      </Text>
      <Text fw={700} mt={2} c="dimmed" style={{ fontSize: 28, lineHeight: 1.1 }}>
        —
      </Text>
      <Text size="xs" c="dimmed" mt="xs">
        {reason}
      </Text>
    </Card>
  );
}

/** Inline live-data indicator: a tiny pulsing dot + label. */
export function LiveBadge({ label = "Live" }: { label?: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Loader size={6} type="dots" color="green" />
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
    </Group>
  );
}
