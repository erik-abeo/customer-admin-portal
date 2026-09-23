/**
 * A list a check depends on, with whether it can be relied on yet.
 *
 * A picker that treated a list still loading, or one that failed to load, as
 * empty would offer a database the service then refuses: nothing blocking
 * would look the same as nothing known. So checks take the status along and
 * say "checking" or "could not be read" until the list is in.
 */
export interface KnownList<T> {
  items: ReadonlyArray<T>;
  status: "loading" | "error" | "ready";
}

/** A plain array is a list that is already in. */
export type ListInput<T> = ReadonlyArray<T> | KnownList<T>;

export const toKnownList = <T>(input: ListInput<T> | undefined): KnownList<T> => {
  if (!input) return { items: [], status: "ready" };
  if (Array.isArray(input))
    return { items: input as ReadonlyArray<T>, status: "ready" };
  return input as KnownList<T>;
};

/**
 * A list from a query's result. A failed read is an error even if an older
 * copy is cached, since what it would block may have changed since.
 */
export const fromQuery = <T>(query: {
  data?: ReadonlyArray<T>;
  isError: boolean;
}): KnownList<T> => {
  if (query.isError) return { items: query.data ?? [], status: "error" };
  if (!query.data) return { items: [], status: "loading" };
  return { items: query.data, status: "ready" };
};

/**
 * Why a check cannot be made yet, or null once the list is in. `what` names
 * the list for the reason, for example "customer moves".
 */
export const whyListUnknown = <T>(list: KnownList<T>, what: string): string | null => {
  if (list.status === "loading") return `checking ${what}`;
  if (list.status === "error")
    return `${what} could not be read, so it cannot be checked`;
  return null;
};
