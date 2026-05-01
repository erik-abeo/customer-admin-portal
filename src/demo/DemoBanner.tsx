/**
 * Persistent visual reminder that the portal is running on the
 * in-memory demo adapter and is not talking to a real backend.
 *
 * The banner sits above all content and stays visible on every route.
 * It is fully ARIA-labelled and keyboard-friendly — the dismiss button
 * is reachable via Tab and is announced as "Hide demo banner".
 */
import { Button, CloseButton, Group, Paper, Text } from "@mantine/core";
import { IconFlask2 } from "@tabler/icons-react";
import { useState } from "react";

interface DemoBannerProps {
  /** Optional callback fired when the user dismisses the banner. */
  onDismiss?: () => void;
}

export function DemoBanner({ onDismiss }: DemoBannerProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    onDismiss?.();
  };

  const reset = () => {
    // Reload the tab to re-seed the in-memory demo store. Cheaper than
    // rebuilding the store mid-flight and matches the user's mental
    // model ("start over").
    window.location.reload();
  };

  return (
    <Paper
      role="status"
      aria-label="Demo mode banner"
      withBorder
      radius={0}
      p="xs"
      className="demo-banner"
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap">
          <IconFlask2 size={18} stroke={1.6} aria-hidden />
          <Text size="sm" fw={600}>
            Demo mode
          </Text>
          <Text size="sm" c="dimmed" visibleFrom="sm">
            All data is in-memory and resets on reload. No real backend is being
            contacted.
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="compact-xs"
            variant="default"
            onClick={reset}
            aria-label="Reset demo data and reload"
          >
            Reset data
          </Button>
          <CloseButton onClick={dismiss} aria-label="Hide demo banner" size="sm" />
        </Group>
      </Group>
    </Paper>
  );
}
