import type {
  CustomerMove,
  DatabaseInfoItem,
  DatabasePrivileges,
  DatabaseServerInfoItem,
  DatabaseServerPrivilegeInfo,
} from "@/api/types";
import { whyDatabaseUnavailable } from "@/features/databases/status";
import { isUnsettledMove } from "@/features/moves/queries";
import { type ListInput, toKnownList, whyListUnknown } from "@/lib/knownList";

/**
 * The privileges the service turns into a GRANT, in the order the editor shows
 * them. `GrantPrivilege` is not among them: the service never grants WITH GRANT
 * OPTION, so offering it would promise something that does not happen.
 */
export const GRANTABLE_PRIVILEGES: ReadonlyArray<{
  key: Exclude<keyof DatabasePrivileges, "GrantPrivilege">;
  label: string;
}> = [
  { key: "AllPrivileges", label: "ALL" },
  { key: "SelectPrivilege", label: "SELECT" },
  { key: "InsertPrivilege", label: "INSERT" },
  { key: "UpdatePrivilege", label: "UPDATE" },
  { key: "DeletePrivilege", label: "DELETE" },
  { key: "CreatePrivilege", label: "CREATE" },
  { key: "DropPrivilege", label: "DROP" },
];

export const hasGrantablePrivilege = (privileges: DatabasePrivileges | null): boolean =>
  privileges !== null && GRANTABLE_PRIVILEGES.some((p) => privileges[p.key]);

/**
 * Why a database's recorded status rules out granting it, or null when it does
 * not. A status the portal does not have (the list still loading) is not held
 * against it: the service checks again and stays the backstop.
 */
export const whyNotGrantableStatus = (
  status: string | null | undefined,
): string | null => (status ? whyDatabaseUnavailable(status) : null);

/**
 * Why a database cannot be granted to a static user now, or null: its status,
 * or a move of it that is unsettled (in progress, cut over and still able to
 * roll back, or settled with the source drop unfinished). The service refuses
 * both, since a grant made on the target would be left behind by a rollback.
 */
export const whyNotGrantable = (
  database: DatabaseInfoItem | undefined,
  movesInput: ListInput<CustomerMove> = [],
): string | null => {
  if (!database) return null;
  const status = whyNotGrantableStatus(database.Status);
  if (status) return status;
  const moves = toKnownList(movesInput);
  const unknown = whyListUnknown(moves, "customer moves");
  if (unknown) return unknown;
  return moves.items.some((m) => m.DatabaseId === database.Id && isUnsettledMove(m))
    ? "a customer move of it is still in progress or can still be rolled back"
    : null;
};

/**
 * Why the grids cannot be saved, or null when they can. The service refuses the
 * whole request if any ticked database has no privilege, which would be a GRANT
 * of nothing, or is not active, which includes one the user already holds that
 * has since gone moving, suspended or retired. Every such database is named,
 * with its server, so all of them can be fixed in one pass.
 */
export const whyPrivilegesIncomplete = (
  grids: DatabaseServerPrivilegeInfo[],
  servers: DatabaseServerInfoItem[],
  databases: DatabaseInfoItem[],
  moves: ListInput<CustomerMove> = [],
): string | null => {
  const where = (serverId: number, databaseId: number) => {
    const database =
      databases.find((x) => x.Id === databaseId)?.DatabaseName ??
      `database ${databaseId}`;
    const server = servers.find((s) => s.Id === serverId)?.Name ?? `server ${serverId}`;
    return `${database} on ${server}`;
  };
  // Held on a server it is no longer on (a move repointed it), or gone: the
  // service refuses both, in these words, so they are said the same way here.
  // Skipped while the database list has not loaded.
  const misplaced =
    databases.length === 0
      ? []
      : grids.flatMap((grid) =>
          grid.Databases.flatMap((d) => {
            const database = databases.find((x) => x.Id === d.DatabaseId);
            if (!database) return [`Database ID ${d.DatabaseId} does not exist.`];
            return database.DatabaseServerId !== grid.ServerId
              ? [
                  `'${database.DatabaseName}' is not on server ${grid.ServerId}. Re-pick it under the server it is on.`,
                ]
              : [];
          }),
        );
  const unavailable = grids.flatMap((grid) =>
    grid.Databases.flatMap((d) => {
      const reason = whyNotGrantable(
        databases.find((x) => x.Id === d.DatabaseId),
        moves,
      );
      return reason ? [`${where(grid.ServerId, d.DatabaseId)} (${reason})`] : [];
    }),
  );
  const missing = grids.flatMap((grid) =>
    grid.Databases.filter((d) => !hasGrantablePrivilege(d.Privileges)).map((d) =>
      where(grid.ServerId, d.DatabaseId),
    ),
  );
  const problems = [
    misplaced.length > 0 ? `${misplaced.join(" ")} Remove it from this server.` : null,
    unavailable.length > 0
      ? `Untick ${unavailable.join(", ")}: static users can only be granted an active database with no unsettled move, and the service refuses the whole change otherwise.`
      : null,
    missing.length > 0
      ? `Pick at least one privilege for ${missing.join(", ")}, or untick it.`
      : null,
  ].filter((p): p is string => p !== null);
  return problems.length === 0 ? null : problems.join(" ");
};

/**
 * The grids as they go on the wire, with `GrantPrivilege` always false. A
 * record loaded with it set, from before the editor stopped offering it, would
 * otherwise send it back unseen.
 */
export const withoutGrantOption = (
  grids: DatabaseServerPrivilegeInfo[],
): DatabaseServerPrivilegeInfo[] =>
  grids.map((grid) => ({
    ...grid,
    Databases: grid.Databases.map((d) => ({
      ...d,
      Privileges: d.Privileges
        ? { ...d.Privileges, GrantPrivilege: false }
        : d.Privileges,
    })),
  }));
