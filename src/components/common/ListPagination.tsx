/**
 * `ListPagination` — page-size picker + paginator + "Showing X–Y of Z"
 * readout. Renders nothing when there's only one page so list pages
 * with small fixed datasets stay clean.
 */
import { Group, Pagination, Select, Text } from "@mantine/core";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"] as const;

interface ListPaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  filteredCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /**
   * When provided, the page-size select offers these values in addition
   * to the defaults. Pass `null` to hide the page-size picker entirely
   * (useful for already-paginated server responses).
   */
  pageSizeOptions?: readonly string[] | null;
}

export function ListPagination({
  page,
  pageCount,
  pageSize,
  filteredCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: ListPaginationProps) {
  if (filteredCount === 0) return null;
  if (pageCount <= 1 && (pageSizeOptions === null || filteredCount <= 10)) {
    // One-page result and the user can't pick a smaller size — no
    // controls needed.
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, filteredCount);

  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Text size="xs" c="dimmed" aria-live="polite">
        {`Showing ${start}–${end} of ${filteredCount}`}
      </Text>
      <Group gap="xs">
        {pageSizeOptions && (
          <Select
            size="xs"
            w={92}
            data={[...pageSizeOptions]}
            value={String(pageSize)}
            onChange={(v) => {
              if (v === null) return;
              const next = Number(v);
              if (Number.isFinite(next) && next > 0) {
                onPageSizeChange(next);
              }
            }}
            aria-label="Rows per page"
          />
        )}
        <Pagination
          value={page}
          onChange={onPageChange}
          total={pageCount}
          size="sm"
          siblings={1}
          boundaries={1}
          aria-label="Pagination"
        />
      </Group>
    </Group>
  );
}
