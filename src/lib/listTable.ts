/**
 * `useListTable` — the shared client-side filter / sort / paginate engine
 * used by every list page in the portal.
 *
 * Why a hook (and not a table component): the four list pages render
 * very different cells and actions, but all share the same upstream
 * pipeline: free-text search → custom predicates → multi-key sort →
 * page slicing → CSV export. By centralizing the pipeline as a hook we
 * get one source of truth for sort/page reset semantics, debouncing,
 * empty-state vs filter-empty differentiation, and URL hash safety —
 * while leaving the table cell rendering untouched at the page layer.
 *
 * Behavior contract:
 *   - Free-text search collapses every `searchableFields` accessor to
 *     a lowercase haystack and matches the trimmed needle. Search is
 *     debounced (default 200ms) so very fast typing doesn't thrash.
 *   - Sort is stable (we use `Array.prototype.sort` on a copy and tie
 *     break on `Id` if available).
 *   - Page is automatically clamped to the new page count whenever the
 *     filtered total shrinks (e.g. after typing a filter).
 *   - Page size 0 / `Infinity` disables pagination.
 *   - `filteredRows` returns *all* matched rows for CSV export so users
 *     can export the visible filter, not just the visible page.
 */
import { useDebouncedValue } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string = string> {
  key: K;
  dir: SortDirection;
}

export interface ListTableOptions<T, K extends string = string> {
  /** Source data — typically a TanStack Query `data` field. */
  data: readonly T[] | undefined;
  /**
   * Field accessors used by the free-text search. If empty, the search
   * input is effectively disabled (set to `null` in the toolbar to hide).
   */
  searchableFields?: ReadonlyArray<(item: T) => string | number | null | undefined>;
  /**
   * Custom predicate run after the search filter — use for category
   * pickers, segmented controls, etc. Should be memoized at the call
   * site if it captures non-primitive deps.
   */
  filter?: (item: T) => boolean;
  /**
   * Map of sort keys → comparable accessor. Strings are compared with
   * `localeCompare` (so accented characters sort correctly), numbers
   * and dates are compared numerically.
   */
  sortKeys?: Record<K, (item: T) => string | number | Date | null | undefined>;
  /** Default sort key + direction. */
  defaultSort?: SortState<K>;
  /** Default page size. Pass 0 / Infinity to disable pagination. */
  defaultPageSize?: number;
  /** Debounce window for search input (ms). Defaults to 200. */
  searchDebounceMs?: number;
  /** Initial value for the search box (typically from a URL param). */
  initialSearch?: string;
}

export interface ListTableState<T, K extends string = string> {
  /** Raw search input value — drives the input element. */
  search: string;
  setSearch: (value: string) => void;
  /** Debounced search value used for filtering. */
  debouncedSearch: string;

  sort: SortState<K> | null;
  /**
   * Toggle sort direction if `key` matches the current sort, otherwise
   * switch to `key` ascending. Pass `null` to clear sort.
   */
  setSort: (key: K | null) => void;

  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;

  /** Total rows in the source `data` (pre-filter). */
  totalCount: number;
  /** Rows that survived search + custom filter (pre-page). */
  filteredCount: number;
  /** Total page count given current `pageSize`. */
  pageCount: number;

  /** Filtered + sorted + page-sliced rows (what the table renders). */
  rows: T[];
  /** Filtered + sorted rows ignoring pagination (used for CSV export). */
  filteredRows: T[];

  /** Whether any filter (search or custom predicate) is currently active. */
  isFiltered: boolean;

  /** Reset every controlled field to its initial value. */
  reset: () => void;
}

/**
 * Compare two cells using the most appropriate primitive ordering and
 * apply the requested direction *only to real values*.
 *
 * `null` / `undefined` always sort *last*, regardless of direction —
 * this matches the convention used by every spreadsheet app and avoids
 * "empty rows float to the top when sorting descending" surprises.
 * That means we cannot simply multiply the result by `dir`: we have to
 * fold direction into the real-value branch only.
 */
function compareCellsWithDir(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
  dir: 1 | -1,
): number {
  const aIsNull = a === null || a === undefined;
  const bIsNull = b === null || b === undefined;
  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;

  let cmp: number;
  if (a instanceof Date && b instanceof Date) {
    cmp = a.getTime() - b.getTime();
  } else if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  return cmp * dir;
}

export function useListTable<T, K extends string = string>(
  options: ListTableOptions<T, K>,
): ListTableState<T, K> {
  const {
    data,
    searchableFields = [],
    filter,
    sortKeys,
    defaultSort = null,
    defaultPageSize = 25,
    searchDebounceMs = 200,
    initialSearch = "",
  } = options;

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch] = useDebouncedValue(search, searchDebounceMs);
  const [sort, setSortState] = useState<SortState<K> | null>(defaultSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const setSort = useCallback((key: K | null) => {
    if (key === null) {
      setSortState(null);
      return;
    }
    setSortState((current) => {
      if (current?.key === key) {
        return { key, dir: current.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }, []);

  // 1. Filter ---------------------------------------------------------
  const filteredRows = useMemo<T[]>(() => {
    const all = data ?? [];
    const needle = debouncedSearch.trim().toLowerCase();
    if (!needle && !filter) return [...all];

    return all.filter((item) => {
      if (needle && searchableFields.length > 0) {
        let matched = false;
        for (const accessor of searchableFields) {
          const raw = accessor(item);
          if (raw === null || raw === undefined) continue;
          if (String(raw).toLowerCase().includes(needle)) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      }
      if (filter && !filter(item)) return false;
      return true;
    });
  }, [data, debouncedSearch, filter, searchableFields]);

  // 2. Sort -----------------------------------------------------------
  const sortedRows = useMemo<T[]>(() => {
    if (!sort || !sortKeys) return filteredRows;
    const accessor = sortKeys[sort.key];
    if (!accessor) return filteredRows;

    const direction: 1 | -1 = sort.dir === "asc" ? 1 : -1;
    // Decorate-sort-undecorate keeps the accessor cost O(n) instead of
    // O(n log n), important when the accessor does field formatting.
    const decorated = filteredRows.map((item, index) => ({
      key: accessor(item),
      index,
      item,
    }));
    decorated.sort((a, b) => {
      const cmp = compareCellsWithDir(a.key, b.key, direction);
      // Stable tie-break — preserves the source order for equal keys.
      return cmp !== 0 ? cmp : a.index - b.index;
    });
    return decorated.map((d) => d.item);
  }, [filteredRows, sort, sortKeys]);

  // 3. Clamp page to current totals ----------------------------------
  const filteredCount = sortedRows.length;
  const pageCount = useMemo(() => {
    if (!Number.isFinite(pageSize) || pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(filteredCount / pageSize));
  }, [filteredCount, pageSize]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  // 4. Page slice -----------------------------------------------------
  const rows = useMemo<T[]>(() => {
    if (!Number.isFinite(pageSize) || pageSize <= 0) return sortedRows;
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const reset = useCallback(() => {
    setSearch(initialSearch);
    setSortState(defaultSort);
    setPage(1);
    setPageSize(defaultPageSize);
  }, [defaultPageSize, defaultSort, initialSearch]);

  const totalCount = data?.length ?? 0;
  const isFiltered =
    debouncedSearch.trim().length > 0 ||
    (filter !== undefined && filteredCount !== totalCount);

  return {
    search,
    setSearch,
    debouncedSearch,
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalCount,
    filteredCount,
    pageCount,
    rows,
    filteredRows: sortedRows,
    isFiltered,
    reset,
  };
}
