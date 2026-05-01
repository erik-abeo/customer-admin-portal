/**
 * `SortableHeader` — the small clickable `<Table.Th>` used by every list
 * page that has sortable columns. Wires into `useListTable`'s `sort` /
 * `setSort` so toggling direction is one line per column.
 *
 * A11y: renders the underlying `<button>` with `aria-sort` set to one of
 * `"ascending"`, `"descending"`, or `"none"` (per WAI-ARIA grid pattern)
 * so screen readers announce the current sort. The arrow indicator is
 * decorative (`aria-hidden`).
 */
import { Group, Table, UnstyledButton } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconArrowsSort } from "@tabler/icons-react";
import type { ReactNode } from "react";

import type { SortState } from "@/lib/listTable";

interface SortableHeaderProps<K extends string> {
  /** Sort key associated with this column. */
  sortKey: K;
  /** Current sort state from `useListTable`. */
  sort: SortState<K> | null;
  /** Setter from `useListTable`. */
  onSortChange: (key: K) => void;
  /** Column-width style that mirrors the data cells. */
  style?: React.CSSProperties;
  children: ReactNode;
}

export function SortableHeader<K extends string>({
  sortKey,
  sort,
  onSortChange,
  style,
  children,
}: SortableHeaderProps<K>) {
  const active = sort?.key === sortKey;
  const dir = active ? sort.dir : null;
  const ariaSort: "ascending" | "descending" | "none" =
    dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";

  return (
    <Table.Th style={style} aria-sort={ariaSort}>
      <UnstyledButton
        onClick={() => onSortChange(sortKey)}
        aria-label={`Sort by ${typeof children === "string" ? children : sortKey}, currently ${ariaSort}`}
        style={{ width: "100%", display: "block" }}
      >
        <Group gap={4} wrap="nowrap">
          <span>{children}</span>
          {dir === "asc" ? (
            <IconArrowUp size={12} stroke={2} aria-hidden />
          ) : dir === "desc" ? (
            <IconArrowDown size={12} stroke={2} aria-hidden />
          ) : (
            <IconArrowsSort
              size={12}
              stroke={1.5}
              aria-hidden
              style={{ opacity: 0.5 }}
            />
          )}
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}
