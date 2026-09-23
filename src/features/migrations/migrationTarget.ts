import type {
  CreateMigrationSessionRequest,
  DatabaseInfoItem,
  DatabaseServerInfoItem,
} from "@/api/types";
import { whyDatabaseUnavailable } from "@/features/databases/status";

/**
 * Whether the migration streams into a database that already exists, or one
 * created for it.
 *
 * An explicit choice rather than something inferred from whether a database
 * happens to be selected. The backend refuses a request that says both or
 * neither, and an operator should be making that decision rather than
 * discovering it from a validation error.
 */
export type TargetMode = "existing" | "provision";

/** The operator's in-progress choice of destination. */
export interface MigrationTargetSelection {
  Mode: TargetMode;
  /** Empty string when nothing is chosen, matching Mantine's Select value. */
  DatabaseServerId: string;
  DatabaseId: string;
  DatabaseName: string;
  CrystalPmId: number | string;
  ExpiresInMinutes: number | string;
}

export const DEFAULT_EXPIRY_MINUTES = 120;

/**
 * Mirrors the backend's identifier rule, so an unusable name is refused while
 * the operator is still looking at the form rather than hours later when an
 * installer tries to redeem the key.
 */
export const DATABASE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export const isSafeDatabaseName = (name: string): boolean =>
  DATABASE_NAME_PATTERN.test(name.trim());

/**
 * Applies a change of server to the current selection.
 *
 * **The database selection is always cleared.** This is the safety rule carried
 * over from the upload modal removed in `4a24044`, recoverable at
 * `git show c9a9ed1:src/pages/DumpsPage.tsx`. It lives here as a named function
 * rather than inside an onChange handler because it has no visible symptom when
 * it breaks: the form still submits, and it submits a (server, database) pair
 * that does not map to anything, which is how one customer's records end up
 * streamed over another's.
 */
export const selectServer = (
  selection: MigrationTargetSelection,
  databaseServerId: string | null,
): MigrationTargetSelection => ({
  ...selection,
  DatabaseServerId: databaseServerId ?? "",
  DatabaseId: "",
});

/**
 * The databases that may be chosen, given the server that is chosen.
 *
 * Empty until a server is picked, which is what makes the server the first
 * decision rather than one of two independent ones.
 */
export const visibleDatabases = (
  databases: DatabaseInfoItem[],
  databaseServerId: string,
): DatabaseInfoItem[] =>
  databaseServerId
    ? databases.filter((d) => String(d.DatabaseServerId) === databaseServerId)
    : [];

/**
 * Why an existing database cannot be the target for this customer, or null when
 * it can.
 *
 * Two reasons: it is not active, or it belongs to a different customer than the
 * one entered. The second is the misroute this form exists to prevent, so it is
 * stated in the option rather than left to the service's 400. Until a customer
 * id is entered only status counts, and the form's own validation catches a
 * mismatch made afterwards.
 */
export const whyDatabaseNotSelectable = (
  database: DatabaseInfoItem,
  crystalPmId: number | string,
): string | null => {
  const unavailable = whyDatabaseUnavailable(database.Status);
  if (unavailable) return unavailable;
  const customer = Number(crystalPmId);
  if (
    crystalPmId !== "" &&
    Number.isInteger(customer) &&
    database.CrystalPmId !== customer
  )
    return `belongs to customer ${database.CrystalPmId}`;
  return null;
};

/**
 * States the destination in plain words for the confirmation step, before any
 * key exists.
 */
export const describeTarget = (
  selection: MigrationTargetSelection,
  servers: DatabaseServerInfoItem[],
  databases: DatabaseInfoItem[],
): string => {
  const server = servers.find((s) => String(s.Id) === selection.DatabaseServerId);
  const serverName = server?.Name ?? `server ${selection.DatabaseServerId}`;

  const databaseName =
    selection.Mode === "existing"
      ? (visibleDatabases(databases, selection.DatabaseServerId).find(
          (d) => String(d.Id) === selection.DatabaseId,
        )?.DatabaseName ?? "the selected database")
      : selection.DatabaseName.trim();

  return `customer ${selection.CrystalPmId} into "${databaseName}" on ${serverName}`;
};

/**
 * Converts a completed selection into the request the backend expects.
 *
 * Exactly one of `DatabaseId` and `DatabaseName` is ever set, because the
 * backend rejects a request carrying both or neither. `createdByAdmin` is the
 * signed-in operator, recorded against the key so a key minted for the wrong
 * customer can be traced to whoever minted it.
 */
export const toCreateRequest = (
  selection: MigrationTargetSelection,
  createdByAdmin: string | null,
): CreateMigrationSessionRequest => ({
  DatabaseServerId: Number(selection.DatabaseServerId),
  DatabaseId: selection.Mode === "existing" ? Number(selection.DatabaseId) : null,
  DatabaseName: selection.Mode === "provision" ? selection.DatabaseName.trim() : null,
  CrystalPmId: Number(selection.CrystalPmId),
  CreatedByAdmin: createdByAdmin,
  ExpiresInMinutes: Number(selection.ExpiresInMinutes) || DEFAULT_EXPIRY_MINUTES,
});
