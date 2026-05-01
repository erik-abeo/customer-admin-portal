import { Card, Skeleton, Stack, Table, VisuallyHidden } from "@mantine/core";

/**
 * `TableSkeleton` — shimmer placeholder used by list pages while data
 * loads. Visually matches the real table layout so the page doesn't
 * shift when the data arrives.
 *
 * Per-column width hints:
 *   Pass `columnWidths` (CSS lengths or %) so each column's shimmer
 *   matches the real cell width. When omitted we fall back to a
 *   deterministic-but-varied pattern so the placeholder doesn't look
 *   like a sterile grid.
 */
interface TableSkeletonProps {
  /** Number of body rows to render. Defaults to 6. */
  rows?: number;
  /** Number of columns to render. Defaults to 5. Ignored when `columnWidths` is set. */
  columns?: number;
  /**
   * Per-column hint width for body cells (e.g. `["35%", "20%", "20%", "120px"]`).
   * Length determines column count when provided.
   */
  columnWidths?: ReadonlyArray<string>;
  /** Per-column hint width for header cells. Defaults to ~70% of body widths. */
  headerWidths?: ReadonlyArray<string>;
  /** When true, wraps the skeleton table in the same Card surface used by list pages. */
  withCard?: boolean;
  /** Minimum width before horizontal scroll. Mirrors the real table. */
  minWidth?: number;
}

/** Deterministic-but-varied width fallback so plain skeletons still look organic. */
function defaultBodyWidth(rowIndex: number, colIndex: number): string {
  return `${40 + ((rowIndex * 17 + colIndex * 23) % 50)}%`;
}

function defaultHeaderWidth(colIndex: number): string {
  return `${50 + ((colIndex * 11) % 35)}%`;
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
  columnWidths,
  headerWidths,
  withCard = true,
  minWidth = 720,
}: TableSkeletonProps) {
  const colCount = columnWidths?.length ?? columns;
  const headers = Array.from({ length: colCount });
  const bodyRows = Array.from({ length: rows });

  const inner = (
    <Table.ScrollContainer minWidth={minWidth}>
      <Table aria-busy="true" aria-label="Loading data">
        <Table.Thead>
          <Table.Tr>
            {headers.map((_, i) => (
              <Table.Th key={i}>
                <VisuallyHidden>Loading column {i + 1}</VisuallyHidden>
                <Skeleton
                  height={10}
                  width={headerWidths?.[i] ?? defaultHeaderWidth(i)}
                  radius="sm"
                />
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {bodyRows.map((_, r) => (
            <Table.Tr key={r}>
              {headers.map((_, c) => (
                <Table.Td key={c}>
                  <Skeleton
                    height={12}
                    width={columnWidths?.[c] ?? defaultBodyWidth(r, c)}
                    radius="sm"
                  />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  if (!withCard) {
    return <Stack>{inner}</Stack>;
  }
  return <Card padding={0}>{inner}</Card>;
}
