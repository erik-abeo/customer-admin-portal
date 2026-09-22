import type { MigrationSessionItem } from "@/api/types";

/** Statuses a session can still move out of, and therefore still be revoked from. */
const REVOCABLE = new Set(["pending", "redeemed", "streaming"]);

/**
 * Statuses a target can be discarded from: the migration is over and it did not
 * work. The backend enforces this too.
 */
const DISCARDABLE = new Set(["failed", "revoked", "expired"]);

export const canRevoke = (session: MigrationSessionItem): boolean =>
  REVOCABLE.has(session.Status ?? "");

/**
 * Whether revoking would also cut off a running installer, as opposed to only
 * stopping a key nobody has used yet.
 */
export const revokeEndsAStream = (session: MigrationSessionItem): boolean =>
  session.Status === "redeemed" || session.Status === "streaming";

/**
 * Whether a session has a target it may drop: finished without success, and
 * holding a database it created itself that is still there.
 *
 * A key minted against an existing database never qualifies, because that
 * database is not this migration's to drop, and neither does one whose target
 * has already been discarded. The backend refuses both; the portal does not
 * offer them.
 */
export const canDiscardTarget = (session: MigrationSessionItem): boolean =>
  DISCARDABLE.has(session.Status ?? "") &&
  session.DatabaseCreated &&
  session.DatabaseId !== null;
