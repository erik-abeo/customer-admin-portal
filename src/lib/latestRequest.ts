/**
 * Tells whether an async result still belongs to the most recent request.
 *
 * Each `begin()` returns a ticket and makes every earlier ticket stale, so when
 * two loads overlap, the slower first one is dropped rather than overwriting
 * what the operator asked for last.
 */
export function createLatestRequest() {
  let latest = 0;
  return {
    begin: (): number => ++latest,
    isLatest: (ticket: number): boolean => ticket === latest,
  };
}
