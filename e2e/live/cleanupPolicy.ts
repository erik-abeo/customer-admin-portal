/**
 * Whether a failed start of the live stack may sweep the test servers.
 *
 * Sweeping drops every schema and login the suite names, on whatever answers as
 * the test containers. That is only safe once both have been checked to be the
 * test containers carrying the sentinel schema: a start that failed at, or
 * before, that check has proved nothing about what it would be dropping from.
 * A run that asked to keep its leftovers (CPM_LIVE_KEEP=1) is never swept.
 */
export const shouldSweepAfterFailedStart = (
  serversVerified: boolean,
  keep: string | undefined,
): boolean => serversVerified && keep !== "1";
