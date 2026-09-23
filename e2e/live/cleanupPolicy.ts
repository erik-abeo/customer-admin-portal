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

/**
 * Whether a process's command line is this suite's API: dotnet running
 * ClientRemoteDatabaseAccessAPI.dll. A stale lock names the API's PID, and a
 * PID can be reused once its process ends, so this is checked before killing
 * it.
 */
export const isApiCommandLine = (commandLine: string): boolean =>
  /\bdotnet(\.exe)?\b/i.test(commandLine) &&
  /ClientRemoteDatabaseAccessAPI\.dll/i.test(commandLine);
