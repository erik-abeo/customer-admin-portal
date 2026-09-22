import type { CapacityVerdict, ServerCapacity } from "@/api/types";

/**
 * Preference order for placing a customer. Lower sorts first.
 *
 * `Unreachable` ranks below `Full` on purpose. A full server is a known
 * quantity that simply has no room; a server nobody can reach is one whose
 * contents are unknown, and putting a customer's records somewhere unknown is
 * worse than not placing them yet.
 */
const VERDICT_RANK: Record<CapacityVerdict, number> = {
  Headroom: 0,
  NearCapacity: 1,
  Full: 2,
  Unreachable: 3,
  Unknown: 4,
};

/** Bytes as something a person reads, with enough precision to compare servers. */
export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // Whole bytes never need a decimal; above that one place is enough to tell
  // 4.2 GB from 4.9 GB without implying precision the estimate does not have.
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
};

/** Total size a server is carrying. */
export const totalBytes = (server: ServerCapacity): number =>
  server.DataBytes + server.IndexBytes;

/**
 * How much room is left against a stated cap, as a fraction from 0 to 1.
 *
 * Null when the server has no cap: an unbounded server is not "100% free", and
 * saying so would let it win a comparison it was never entered into.
 */
export const freeCapacityFraction = (server: ServerCapacity): number | null => {
  if (!server.MaxCustomerDatabases || server.MaxCustomerDatabases <= 0) return null;
  const free = server.MaxCustomerDatabases - server.CustomerDatabaseCount;
  return Math.max(0, free) / server.MaxCustomerDatabases;
};

/**
 * Orders servers by how suitable they are for the next customer.
 *
 * Verdict first, because it already folds in the caps, the connection load and
 * whether the server is even accepting customers. Within a verdict, more free
 * capacity first, then the smaller server, then by name so the order is stable
 * rather than dependent on however the fleet came back.
 */
export const compareForPlacement = (a: ServerCapacity, b: ServerCapacity): number => {
  const byVerdict = (VERDICT_RANK[a.Verdict] ?? 4) - (VERDICT_RANK[b.Verdict] ?? 4);
  if (byVerdict !== 0) return byVerdict;

  const freeA = freeCapacityFraction(a);
  const freeB = freeCapacityFraction(b);
  if (freeA !== null && freeB !== null && freeA !== freeB) return freeB - freeA;

  // A server with a stated cap is preferred over one without, because it is the
  // one somebody has actually thought about the limits of.
  if (freeA !== null && freeB === null) return -1;
  if (freeA === null && freeB !== null) return 1;

  const bySize = totalBytes(a) - totalBytes(b);
  if (bySize !== 0) return bySize;

  return (a.Name ?? "").localeCompare(b.Name ?? "");
};

/** A ranked recommendation, and the reasoning behind it. */
export interface PlacementRecommendation {
  /** The server to use, or null when none is suitable. */
  recommended: ServerCapacity | null;
  /** Every server, best first. */
  ranked: ServerCapacity[];
  /** One line stating the outcome, suitable to show above the table. */
  summary: string;
}

/**
 * Recommends where the next customer should go.
 *
 * Only a server with headroom is ever recommended. "Near capacity" is offered
 * for an operator to choose deliberately, never suggested: the point of the
 * warning is that somebody should be deciding, and a recommendation would take
 * that decision back off them.
 */
export const recommendPlacement = (
  servers: ServerCapacity[],
): PlacementRecommendation => {
  const ranked = [...servers].sort(compareForPlacement);
  const recommended = ranked.find((s) => s.Verdict === "Headroom") ?? null;

  if (recommended) {
    return {
      recommended,
      ranked,
      summary: `${recommended.Name ?? `Server ${recommended.DatabaseServerId}`} has the most room: ${recommended.VerdictReasons.join(" ")}`,
    };
  }

  const near = ranked.filter((s) => s.Verdict === "NearCapacity").length;
  const unreachable = ranked.filter((s) => s.Verdict === "Unreachable").length;

  if (servers.length === 0) {
    return { recommended: null, ranked, summary: "No database servers are registered yet." };
  }

  const parts = ["No server has clear headroom."];
  if (near > 0) {
    parts.push(
      `${near} ${near === 1 ? "is" : "are"} near capacity and can be chosen deliberately.`,
    );
  }
  if (unreachable > 0) {
    parts.push(
      `${unreachable} could not be measured, so ${unreachable === 1 ? "its" : "their"} real state is unknown.`,
    );
  }
  parts.push("Consider adding a server before placing another customer.");

  return { recommended: null, ranked, summary: parts.join(" ") };
};
