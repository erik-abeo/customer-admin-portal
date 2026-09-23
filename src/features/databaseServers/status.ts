import type { DatabaseServerInfoItem } from "@/api/types";

/**
 * Whether a server takes new customers, from its recorded `status`.
 *
 * Only `available` does. The service applies the same rule to a migration key
 * that provisions a new database and to the target of a customer move, and
 * refuses the rest with a 400; this lets a picker say so in the option first.
 * A status the portal does not know (still loading, or a service too old to
 * send it) is not treated as a refusal: the service stays the backstop.
 */
export const whyServerNotTakingCustomers = (
  status: string | null | undefined,
): string | null => {
  if (status === undefined || status === null) return null;
  return status.toLowerCase() === "available"
    ? null
    : `marked '${status}', not taking new customers`;
};

/**
 * Server id to recorded status, from the server list the pickers already load.
 * Read from there rather than from fleet capacity, which measures every server
 * live and would make opening a form wait on the slowest of them.
 */
export const serverStatuses = (
  servers: DatabaseServerInfoItem[] | undefined,
): Map<number, string | null> =>
  new Map((servers ?? []).map((s) => [s.Id, s.Status ?? null]));
