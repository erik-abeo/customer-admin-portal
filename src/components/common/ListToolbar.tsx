/**
 * `ListToolbar` — the standard search / filters / actions bar that sits
 * above every list page's table. Pages compose it with their own filter
 * widgets via `extraFilters`, an action button row via `actions`, and an
 * optional CSV export via `onExport`.
 *
 * The component is intentionally presentational — it owns no state.
 * Search input, filter widgets, and the showing-X-of-Y readout are
 * driven by `useListTable` at the page level so the toolbar can be
 * dropped wherever it's useful.
 */
import { Button, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import type { ReactNode } from "react";

interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Set to false to hide the search input. */
  searchEnabled?: boolean;

  /** Slot for SegmentedControls / Selects / etc. */
  extraFilters?: ReactNode;
  /** Slot for action buttons (e.g. Add, Refresh). */
  actions?: ReactNode;

  /**
   * When provided, renders a "Export CSV" button. Disabled when
   * `exportDisabled` is true (e.g. zero filtered rows).
   */
  onExport?: () => void;
  exportDisabled?: boolean;

  /** Filtered total — typically `state.filteredCount`. */
  filteredCount: number;
  /** Source total — typically `state.totalCount`. */
  totalCount: number;
}

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchEnabled = true,
  extraFilters,
  actions,
  onExport,
  exportDisabled,
  filteredCount,
  totalCount,
}: ListToolbarProps) {
  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group gap="md" align="flex-end" wrap="wrap">
          {searchEnabled && (
            <TextInput
              label="Search"
              placeholder={searchPlaceholder}
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => onSearchChange(e.currentTarget.value)}
              w={280}
              aria-label="Search"
            />
          )}
          {extraFilters}
          <Group ml="auto" gap="xs" align="flex-end">
            <Text size="xs" c="dimmed" fw={500}>
              Showing {filteredCount} of {totalCount}
            </Text>
            {onExport && (
              <Button
                variant="default"
                size="xs"
                leftSection={<IconDownload size={14} />}
                onClick={onExport}
                disabled={exportDisabled}
              >
                Export CSV
              </Button>
            )}
            {actions}
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}
