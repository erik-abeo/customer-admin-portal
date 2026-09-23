import type {
  DatabaseInfoItem,
  DatabasePrivileges,
  DatabaseServerInfoItem,
  DatabaseServerPrivilegeInfo,
} from "@/api/types";

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
 * Why the grids cannot be saved, or null when they can: a ticked database
 * with no privilege would become a GRANT of nothing, which the service refuses.
 * Every such database is named, with its server, so all of them can be fixed
 * in one pass.
 */
export const whyPrivilegesIncomplete = (
  grids: DatabaseServerPrivilegeInfo[],
  servers: DatabaseServerInfoItem[],
  databases: DatabaseInfoItem[],
): string | null => {
  const missing = grids.flatMap((grid) =>
    grid.Databases.filter((d) => !hasGrantablePrivilege(d.Privileges)).map((d) => {
      const database =
        databases.find((x) => x.Id === d.DatabaseId)?.DatabaseName ??
        `database ${d.DatabaseId}`;
      const server =
        servers.find((s) => s.Id === grid.ServerId)?.Name ?? `server ${grid.ServerId}`;
      return `${database} on ${server}`;
    }),
  );
  return missing.length === 0
    ? null
    : `Pick at least one privilege for ${missing.join(", ")}, or untick it.`;
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
