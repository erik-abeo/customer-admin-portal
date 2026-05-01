/**
 * `useListTable` tests.
 *
 * Covers:
 *   - search filtering across multiple accessor fields
 *   - custom predicate filter
 *   - sort: stable, direction toggle, multi-key, null-last semantics
 *   - pagination: page slicing, page-size change resets to a clamped page
 *   - filteredRows ignores pagination (CSV export)
 *   - reset() restores defaults
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useListTable } from "./listTable";

interface Row {
  Id: number;
  Name: string;
  CrystalPmId: number;
  Description: string | null;
}

const rows: Row[] = [
  { Id: 1, Name: "alpha", CrystalPmId: 10, Description: "A description" },
  { Id: 2, Name: "Bravo", CrystalPmId: 30, Description: null },
  { Id: 3, Name: "charlie", CrystalPmId: 20, Description: "C description" },
  { Id: 4, Name: "delta", CrystalPmId: 40, Description: "delta desc" },
  { Id: 5, Name: "echo", CrystalPmId: 50, Description: "EeE" },
];

const SEARCHABLE = [(r: Row) => r.Name, (r: Row) => r.Description] as const;
const SORT_KEYS = {
  name: (r: Row) => r.Name,
  cpmId: (r: Row) => r.CrystalPmId,
} as const;

describe("useListTable", () => {
  it("returns all rows unfiltered with default state", () => {
    const { result } = renderHook(() => useListTable<Row>({ data: rows }));
    expect(result.current.totalCount).toBe(5);
    expect(result.current.filteredCount).toBe(5);
    expect(result.current.rows).toHaveLength(5);
    expect(result.current.isFiltered).toBe(false);
  });

  it("applies free-text search across configured fields (debounced)", async () => {
    const { result } = renderHook(() =>
      useListTable<Row>({
        data: rows,
        searchableFields: SEARCHABLE,
        searchDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.setSearch("desc");
    });
    await waitFor(() => {
      expect(result.current.filteredCount).toBe(3);
    });
    const names = result.current.rows.map((r) => r.Name);
    expect(names).toEqual(["alpha", "charlie", "delta"]);
  });

  it("search is case-insensitive", async () => {
    const { result } = renderHook(() =>
      useListTable<Row>({
        data: rows,
        searchableFields: SEARCHABLE,
        searchDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.setSearch("BRAVO");
    });
    await waitFor(() => {
      expect(result.current.filteredCount).toBe(1);
    });
    expect(result.current.rows[0]?.Name).toBe("Bravo");
  });

  it("applies a custom predicate after search", async () => {
    const { result, rerender } = renderHook(
      ({ filter }: { filter?: (r: Row) => boolean }) =>
        useListTable<Row>({
          data: rows,
          searchableFields: SEARCHABLE,
          filter,
          searchDebounceMs: 0,
        }),
      { initialProps: {} },
    );

    rerender({ filter: (r: Row) => r.CrystalPmId >= 30 });
    await waitFor(() => {
      expect(result.current.filteredCount).toBe(3);
    });
    expect(result.current.isFiltered).toBe(true);
  });

  it("sorts by a numeric key ascending and toggles to descending", () => {
    const { result } = renderHook(() =>
      useListTable<Row, "name" | "cpmId">({
        data: rows,
        sortKeys: SORT_KEYS,
      }),
    );

    act(() => {
      result.current.setSort("cpmId");
    });
    expect(result.current.rows.map((r) => r.CrystalPmId)).toEqual([10, 20, 30, 40, 50]);

    act(() => {
      result.current.setSort("cpmId");
    });
    expect(result.current.rows.map((r) => r.CrystalPmId)).toEqual([50, 40, 30, 20, 10]);
  });

  it("sorts strings with localeCompare, case-insensitive (Bravo before charlie)", () => {
    const { result } = renderHook(() =>
      useListTable<Row, "name" | "cpmId">({
        data: rows,
        sortKeys: SORT_KEYS,
      }),
    );

    act(() => {
      result.current.setSort("name");
    });
    expect(result.current.rows.map((r) => r.Name)).toEqual([
      "alpha",
      "Bravo",
      "charlie",
      "delta",
      "echo",
    ]);
  });

  it("sorts null/undefined cells last regardless of direction", () => {
    const data: Row[] = [
      { Id: 1, Name: "z", CrystalPmId: 1, Description: null },
      { Id: 2, Name: "a", CrystalPmId: 2, Description: "real" },
      { Id: 3, Name: "m", CrystalPmId: 3, Description: null },
    ];
    const { result } = renderHook(() =>
      useListTable<Row, "desc">({
        data,
        sortKeys: { desc: (r) => r.Description },
        defaultSort: { key: "desc", dir: "asc" },
      }),
    );
    expect(result.current.rows.map((r) => r.Id)).toEqual([2, 1, 3]);

    act(() => {
      result.current.setSort("desc");
    });
    expect(result.current.rows.map((r) => r.Id)).toEqual([2, 1, 3]);
  });

  it("paginates and clamps page when filtered total shrinks", async () => {
    const { result } = renderHook(() =>
      useListTable<Row>({
        data: rows,
        searchableFields: SEARCHABLE,
        defaultPageSize: 2,
        searchDebounceMs: 0,
      }),
    );

    expect(result.current.pageCount).toBe(3);
    expect(result.current.rows).toHaveLength(2);

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.rows).toHaveLength(1);

    act(() => {
      result.current.setSearch("desc");
    });
    await waitFor(() => {
      expect(result.current.filteredCount).toBe(3);
    });
    expect(result.current.pageCount).toBe(2);
    await waitFor(() => {
      expect(result.current.page).toBe(2);
    });
  });

  it("filteredRows includes every match (ignores pagination) for CSV export", async () => {
    const { result } = renderHook(() =>
      useListTable<Row>({
        data: rows,
        defaultPageSize: 2,
      }),
    );

    expect(result.current.rows).toHaveLength(2);
    expect(result.current.filteredRows).toHaveLength(5);
  });

  it("disables pagination when defaultPageSize is 0", () => {
    const { result } = renderHook(() =>
      useListTable<Row>({
        data: rows,
        defaultPageSize: 0,
      }),
    );
    expect(result.current.rows).toHaveLength(5);
    expect(result.current.pageCount).toBe(1);
  });

  it("reset() restores defaults", async () => {
    const { result } = renderHook(() =>
      useListTable<Row, "name">({
        data: rows,
        searchableFields: SEARCHABLE,
        sortKeys: { name: (r) => r.Name },
        defaultPageSize: 2,
        searchDebounceMs: 0,
      }),
    );

    act(() => {
      result.current.setSearch("x");
      result.current.setSort("name");
      result.current.setPage(2);
      result.current.setPageSize(50);
    });
    await waitFor(() => {
      expect(result.current.debouncedSearch).toBe("x");
    });

    act(() => {
      result.current.reset();
    });
    expect(result.current.search).toBe("");
    expect(result.current.sort).toBeNull();
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(2);
  });
});
