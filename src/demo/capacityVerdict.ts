import type { CapacityVerdict, ServerCapacity } from "@/api/types";

/** Mirrors ServerCapacityService.NearCapacityFraction. */
const NEAR_CAPACITY_FRACTION = 0.8;

type VerdictInputs = Pick<
  ServerCapacity,
  | "Status"
  | "MaxCustomerDatabases"
  | "CustomerDatabaseCount"
  | "MaxConnections"
  | "ThreadsConnected"
  | "Databases"
>;

/**
 * The verdict and its reasons, worked out as ServerCapacityService.ApplyVerdict
 * works them out, in the same order and words, so demo mode shows what the
 * service would. A server not marked `available` (or with no status at all) is
 * Full whatever its counts, since it is not taking customers.
 */
export function applyVerdict(capacity: VerdictInputs): {
  Verdict: CapacityVerdict;
  VerdictReasons: string[];
} {
  const reasons: string[] = [];
  let full = false;
  let near = false;

  if (!capacity.Status?.trim()) {
    full = true;
    reasons.push(
      "The server has no recorded status, so it is not offered for new customers.",
    );
  } else if (capacity.Status.toLowerCase() !== "available") {
    full = true;
    reasons.push(
      `The server is marked '${capacity.Status}', so it is not accepting customers.`,
    );
  }

  const maxDatabases = capacity.MaxCustomerDatabases;
  if (maxDatabases !== null && maxDatabases > 0) {
    if (capacity.CustomerDatabaseCount >= maxDatabases) {
      full = true;
      reasons.push(`At its stated limit of ${maxDatabases} customer databases.`);
    } else {
      if (capacity.CustomerDatabaseCount >= maxDatabases * NEAR_CAPACITY_FRACTION)
        near = true;
      reasons.push(
        `${capacity.CustomerDatabaseCount} of ${maxDatabases} customer databases used.`,
      );
    }
  } else {
    reasons.push(
      `${capacity.CustomerDatabaseCount} customer databases, with no stated limit to compare against.`,
    );
  }

  const maxConnections = capacity.MaxConnections;
  if (
    maxConnections !== null &&
    maxConnections > 0 &&
    capacity.ThreadsConnected !== null
  ) {
    if (capacity.ThreadsConnected >= maxConnections * NEAR_CAPACITY_FRACTION)
      near = true;
    reasons.push(
      `${capacity.ThreadsConnected} of ${maxConnections} connections in use.`,
    );
  }

  const orphaned = capacity.Databases.filter((d) => d.IsOrphaned).length;
  if (orphaned > 0)
    reasons.push(
      `${orphaned} registered database(s) are not present on the server. Worth resolving before adding another.`,
    );

  return {
    Verdict: full ? "Full" : near ? "NearCapacity" : "Headroom",
    VerdictReasons: reasons,
  };
}
