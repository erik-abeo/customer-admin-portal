/**
 * A database's lifecycle status, as the service records it.
 *
 * `active` is the only one anything may be done to. `moving` is set while a
 * customer move holds it, `suspended` is set by an operator, and `retired` is
 * set by hand once a database is no longer in service.
 */
export type DatabaseStatus = "active" | "moving" | "suspended" | "retired";

/** Same palette as the move and migration badges: cyan for in flight, gray for over. */
export const DATABASE_STATUS_COLOR: Record<string, string> = {
  active: "teal",
  moving: "cyan",
  suspended: "orange",
  retired: "gray",
};

const WHY_UNAVAILABLE: Record<string, string> = {
  moving: "a customer move is in progress",
  suspended: "suspended",
  retired: "retired",
};

export const isActiveDatabase = (status: string | null | undefined): boolean =>
  status === "active";

export const databaseStatusLabel = (status: string | null | undefined): string =>
  status ?? "unknown";

/**
 * Why a database cannot be chosen for a migration or a move, or null when it
 * can. Said in the option itself, so a disabled entry is not a mystery. The
 * service refuses the same databases, and stays the backstop for a status
 * that changed after the list was loaded.
 */
export const whyDatabaseUnavailable = (
  status: string | null | undefined,
): string | null =>
  isActiveDatabase(status) ? null : (WHY_UNAVAILABLE[status ?? ""] ?? "status unknown");
