import type { AuthorizedUserInfoItem } from "@/api/types";

/**
 * How many databases other than `databaseId` a user can reach, from the full
 * user list, or null while that list has not loaded.
 *
 * Not from `get-users/{server}/{db}`: that answers with only the mapping that
 * was asked about, so counting its mappings always gives none.
 */
export const otherDatabaseCount = (
  userId: number,
  databaseId: number,
  allUsers: AuthorizedUserInfoItem[] | undefined,
): number | null => {
  if (!allUsers) return null;
  const user = allUsers.find((u) => u.Id === userId);
  if (!user) return null;
  return (user.DatabaseMappings ?? []).filter((m) => m.DatabaseId !== databaseId)
    .length;
};
