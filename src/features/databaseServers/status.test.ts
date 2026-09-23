import { describe, expect, it } from "vitest";

import type { DatabaseServerInfoItem } from "@/api/types";

import { serverStatuses, whyServerNotTakingCustomers } from "./status";

describe("whyServerNotTakingCustomers", () => {
  it("lets an available server through, in any case", () => {
    expect(whyServerNotTakingCustomers("available")).toBeNull();
    expect(whyServerNotTakingCustomers("Available")).toBeNull();
  });

  it("names the status of a server that is not available", () => {
    expect(whyServerNotTakingCustomers("retiring")).toBe(
      "marked 'retiring', not taking new customers",
    );
  });

  it("does not refuse a server whose status is not known yet", () => {
    expect(whyServerNotTakingCustomers(undefined)).toBeNull();
    expect(whyServerNotTakingCustomers(null)).toBeNull();
  });
});

describe("serverStatuses", () => {
  it("maps each listed server to its status", () => {
    const servers = [
      { Id: 1, Status: "available" },
      { Id: 4, Status: "retiring" },
      { Id: 5 },
    ] as DatabaseServerInfoItem[];
    const statuses = serverStatuses(servers);
    expect(statuses.get(1)).toBe("available");
    expect(statuses.get(4)).toBe("retiring");
    expect(statuses.get(5)).toBeNull();
    expect(statuses.get(2)).toBeUndefined();
    expect(serverStatuses(undefined).size).toBe(0);
  });
});
