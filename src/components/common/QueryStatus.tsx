import { Alert, Button, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconInbox, IconRefresh } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { ApiError } from "@/api/httpClient";

import { TableSkeleton } from "./TableSkeleton";

interface QueryStatusProps {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  /** Optional CTA shown beneath the empty-state message. */
  emptyAction?: ReactNode;
  /** Optional retry handler — when provided, error state shows a Try-again button. */
  onRetry?: () => void;
  /**
   * When provided, the loading state renders a TableSkeleton with this many
   * rows/columns instead of a plain spinner. Use on list pages for a far
   * more refined first-paint.
   */
  loadingSkeleton?: { rows?: number; columns?: number };
  children?: ReactNode;
}

export function QueryStatus({
  isLoading,
  error,
  isEmpty,
  emptyMessage = "Nothing to show yet",
  emptyDescription,
  emptyAction,
  onRetry,
  loadingSkeleton,
  children,
}: QueryStatusProps) {
  if (isLoading) {
    if (loadingSkeleton) {
      return (
        <TableSkeleton
          rows={loadingSkeleton.rows ?? 6}
          columns={loadingSkeleton.columns ?? 5}
        />
      );
    }
    return (
      <Center py="xl" mih={120} role="status" aria-live="polite">
        <Stack align="center" gap="xs">
          <Loader size="sm" color="crystal" />
          <Text size="xs" c="dimmed">
            Loading…
          </Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    const message =
      error instanceof ApiError
        ? `${error.message} (status ${error.status || "n/a"})`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return (
      <Alert
        icon={<IconAlertTriangle size={18} />}
        color="red"
        variant="light"
        title="Failed to load"
      >
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{message}</Text>
          {onRetry && (
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconRefresh size={14} />}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </Stack>
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <Center py="xl" mih={160}>
        <Stack align="center" gap="xs" maw={460} ta="center">
          <IconInbox size={36} stroke={1.4} color="var(--mantine-color-dimmed)" />
          <Text fw={600}>{emptyMessage}</Text>
          {emptyDescription && (
            <Text size="sm" c="dimmed">
              {emptyDescription}
            </Text>
          )}
          {emptyAction && (
            <Group justify="center" mt="sm">
              {emptyAction}
            </Group>
          )}
        </Stack>
      </Center>
    );
  }

  return <>{children}</>;
}
