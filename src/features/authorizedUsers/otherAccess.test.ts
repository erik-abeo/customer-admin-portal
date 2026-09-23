import { describe, expect, it } from "vitest";

import type { AuthorizedUserInfoItem } from "@/api/types";

import { otherDatabaseCount } from "./otherAccess";

const user = {
  Id: 5,
  DatabaseMappings: [
    { DatabaseServerId: 1, DatabaseId: 100 },
    { DatabaseServerId: 1, DatabaseId: 101 },
    { DatabaseServerId: 2, DatabaseId: 103 },
  ],
} as AuthorizedUserInfoItem;

describe("otherDatabaseCount", () => {
  it("counts the user's other databases from the full list", () => {
    expect(otherDatabaseCount(5, 100, [user])).toBe(2);
  });

  it("is unknown until the full list has loaded, or for a user not in it", () => {
    expect(otherDatabaseCount(5, 100, undefined)).toBeNull();
    expect(otherDatabaseCount(9, 100, [user])).toBeNull();
  });
});
