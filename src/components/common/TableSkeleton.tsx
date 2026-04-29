import { Card, Skeleton, Stack, Table, VisuallyHidden } from "@mantine/core";

interface TableSkeletonProps {
  /** Number of body rows to render. Defaults to 6. */
  rows?: number;
  /** Number of columns to render. Defaults to 5. */
  columns?: number;
  /** When true, wraps the skeleton table in the same Card surface used by list pages. */
  withCard?: boolean;
}

/**
 * Shimmer placeholder used by list pages while their data is loading.
 * Visually matches the real table layout so the page doesn't shift when
 * data arrives.
 */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  withCard = true,
}: TableSkeletonProps) {
  const headers = Array.from({ length: columns });
  const bodyRows = Array.from({ length: rows });

  const inner = (
    <Table.ScrollContainer minWidth={720}>
      <Table aria-busy="true" aria-label="Loading data">
        <Table.Thead>
          <Table.Tr>
            {headers.map((_, i) => (
              <Table.Th key={i}>
                <VisuallyHidden>Loading column {i + 1}</VisuallyHidden>
                <Skeleton height={10} width={`${50 + ((i * 11) % 35)}%`} radius="sm" />
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
                    width={`${40 + ((r * 17 + c * 23) % 50)}%`}
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
