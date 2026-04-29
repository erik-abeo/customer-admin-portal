import { Center, Loader, Stack, Text } from "@mantine/core";
import { useEffect } from "react";

import { startProgress, stopProgress } from "@/lib/progressBar";

interface PageFallbackProps {
  /** Override the message shown under the spinner. */
  message?: string;
  /** When false, skip driving the global navigation-progress bar. */
  withProgress?: boolean;
}

/**
 * Used as the Suspense fallback for every lazy route. Mounts a centered
 * spinner and (by default) starts the global navigation-progress bar so
 * the user sees instant feedback while the next chunk downloads.
 *
 * Uses the refcounted `progressBar` wrapper so concurrent mutation
 * progress doesn't prematurely hide the bar mid-navigation.
 */
export function PageFallback({
  message = "Loading…",
  withProgress = true,
}: PageFallbackProps) {
  useEffect(() => {
    if (!withProgress) return;
    startProgress();
    return () => {
      stopProgress();
    };
  }, [withProgress]);

  return (
    <Center mih="50vh" role="status" aria-live="polite">
      <Stack align="center" gap="sm">
        <Loader size="md" color="crystal" type="dots" />
        <Text size="sm" c="dimmed">
          {message}
        </Text>
      </Stack>
    </Center>
  );
}
