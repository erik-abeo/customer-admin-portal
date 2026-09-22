import type { ServerMetricsPoint } from "@/api/types";

/** How one figure moved across the window, from the first recorded value to the last. */
export interface MetricChange {
  first: number;
  last: number;
  change: number;
}

export interface HistorySummary {
  /** When the first and last recorded points were taken, or null with no points. */
  from: string | null;
  to: string | null;
  customers: MetricChange | null;
  users: MetricChange | null;
  bytes: MetricChange | null;
  connections: MetricChange | null;
}

/**
 * First and last values present, skipping points that did not record the
 * figure. A column added after a snapshot was taken is null in it, and reading
 * that as zero would put a cliff at the start of every trend.
 */
const changeOf = (
  points: ServerMetricsPoint[],
  read: (point: ServerMetricsPoint) => number | null,
): MetricChange | null => {
  const values = points.map(read).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const first = values[0];
  const last = values[values.length - 1];
  return { first, last, change: last - first };
};

const bytesOf = (point: ServerMetricsPoint): number | null =>
  point.DataBytes === null && point.IndexBytes === null
    ? null
    : (point.DataBytes ?? 0) + (point.IndexBytes ?? 0);

/**
 * What a server's history says in a sentence's worth of figures: how many
 * customers, users and bytes it had at the start of the window and at the end.
 *
 * Expects points oldest first, which is how the service returns them.
 */
export const summarizeHistory = (points: ServerMetricsPoint[]): HistorySummary => ({
  from: points.length > 0 ? points[0].UtcTimestamp : null,
  to: points.length > 0 ? points[points.length - 1].UtcTimestamp : null,
  customers: changeOf(points, (p) => p.CustomerDatabaseCount),
  users: changeOf(points, (p) => p.AuthorizedUserCount),
  bytes: changeOf(points, bytesOf),
  connections: changeOf(points, (p) => p.DatabaseConnections),
});

/** Points as they are shown, newest first, with the combined size precomputed. */
export const historyRows = (points: ServerMetricsPoint[]) =>
  [...points].reverse().map((point) => ({ ...point, TotalBytes: bytesOf(point) }));
