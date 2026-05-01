import {
  Alert,
  Anchor,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCloudOff,
  IconInbox,
  IconLockOpen,
  IconRefresh,
  IconSearchOff,
  IconShieldX,
  IconWand,
} from "@tabler/icons-react";
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
   * When provided, the loading state renders a TableSkeleton with these
   * dimensions instead of a plain spinner. Pass `columnWidths` to make
   * the placeholder match the real columns precisely (recommended).
   */
  loadingSkeleton?: {
    rows?: number;
    columns?: number;
    columnWidths?: ReadonlyArray<string>;
    headerWidths?: ReadonlyArray<string>;
    minWidth?: number;
  };
  children?: ReactNode;
}

/**
 * Status-code-aware error decomposition. Returns the title, body copy,
 * icon, color, and whether a retry button makes sense for this class of
 * failure. Centralizing this makes the user-visible error UX consistent
 * across every page and gives us a single place to wire in observability
 * later (e.g. flag 5xx spikes).
 */
interface ErrorPresentation {
  title: string;
  description: string;
  icon: ReactNode;
  color: "red" | "orange" | "yellow" | "blue" | "gray";
  showRetry: boolean;
  detail?: string;
}

function presentError(error: unknown): ErrorPresentation {
  const apiError = error instanceof ApiError ? error : null;
  const status = apiError?.status ?? -1;
  const rawMessage =
    apiError?.message ?? (error instanceof Error ? error.message : "Unknown error");

  // Network / CORS — Axios sets status 0 when no response was received.
  // Only treat status === 0 as a network failure when the error is an
  // ApiError; a generic Error has no status and shouldn't be claimed
  // as a network failure.
  if (apiError && status === 0) {
    return {
      title: "Cannot reach the API",
      description:
        "We didn't get a response from the server. Check your network connection or VPN, then try again.",
      icon: <IconCloudOff size={18} />,
      color: "orange",
      showRetry: true,
      detail: rawMessage,
    };
  }

  if (status === 401) {
    return {
      title: "Your session expired",
      description:
        "Sign in again to continue. The portal will remember the page you were on.",
      icon: <IconLockOpen size={18} />,
      color: "yellow",
      showRetry: false,
      detail: rawMessage,
    };
  }

  if (status === 403) {
    return {
      title: "You don't have access to this",
      description:
        "Your account isn't authorized to view this resource. Contact a portal administrator if you believe this is wrong.",
      icon: <IconShieldX size={18} />,
      color: "red",
      showRetry: false,
      detail: rawMessage,
    };
  }

  if (status === 404) {
    return {
      title: "Not found",
      description:
        "We couldn't find what you were looking for. It may have been deleted, or the link may be wrong.",
      icon: <IconSearchOff size={18} />,
      color: "gray",
      showRetry: true,
      detail: rawMessage,
    };
  }

  if (status === 409) {
    return {
      title: "This record changed somewhere else",
      description:
        "Another admin updated this record while you were viewing it. Refresh to see the latest version, then re-apply your changes if needed.",
      icon: <IconAlertTriangle size={18} />,
      color: "orange",
      showRetry: true,
      detail: rawMessage,
    };
  }

  if (status === 422 || status === 400) {
    return {
      title: "Validation failed",
      description:
        "The server rejected the request because one or more values were invalid. The details below should help you correct the input.",
      icon: <IconWand size={18} />,
      color: "yellow",
      showRetry: false,
      detail: rawMessage,
    };
  }

  if (status === 429) {
    return {
      title: "Too many requests",
      description:
        "We're sending too many requests too quickly. Wait a moment and try again.",
      icon: <IconAlertTriangle size={18} />,
      color: "yellow",
      showRetry: true,
      detail: rawMessage,
    };
  }

  if (status >= 500 && status < 600) {
    return {
      title: "The server hit a problem",
      description:
        "This isn't your fault — the API returned an error. If it keeps happening, share the request URL with the on-call engineer.",
      icon: <IconAlertTriangle size={18} />,
      color: "red",
      showRetry: true,
      detail: `${rawMessage} (HTTP ${status})`,
    };
  }

  // Unknown / fallthrough — preserve previous behavior so no error is
  // ever swallowed silently.
  return {
    title: "Failed to load",
    description: status > 0 ? `${rawMessage} (HTTP ${status})` : rawMessage,
    icon: <IconAlertTriangle size={18} />,
    color: "red",
    showRetry: true,
  };
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
          columnWidths={loadingSkeleton.columnWidths}
          headerWidths={loadingSkeleton.headerWidths}
          minWidth={loadingSkeleton.minWidth}
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
    const presentation = presentError(error);
    return (
      <Alert
        icon={presentation.icon}
        color={presentation.color}
        variant="light"
        title={presentation.title}
        role="alert"
      >
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{presentation.description}</Text>
          {presentation.detail && (
            <Code block style={{ maxWidth: "100%" }}>
              {presentation.detail}
            </Code>
          )}
          <Group gap="xs">
            {presentation.showRetry && onRetry && (
              <Button
                size="xs"
                variant="light"
                color={presentation.color}
                leftSection={<IconRefresh size={14} />}
                onClick={onRetry}
              >
                Try again
              </Button>
            )}
            {error instanceof ApiError && error.status === 401 && (
              <Anchor href="/login" size="sm">
                Go to sign in
              </Anchor>
            )}
          </Group>
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
