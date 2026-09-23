/** The page sizes the event log accepts, matching the field's min and max. */
export const PAGE_SIZE_MIN = 10;
export const PAGE_SIZE_MAX = 500;

/**
 * A page size from the field's value, or null to ignore it. Clearing the field
 * gives "", which Number() reads as 0, and the service caps a page at 500, so
 * only whole numbers from 10 to 500 are taken.
 */
export const parsePageSize = (value: number | string): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < PAGE_SIZE_MIN || n > PAGE_SIZE_MAX) return null;
  return n;
};
