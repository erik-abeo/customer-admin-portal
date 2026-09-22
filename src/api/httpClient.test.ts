import { afterEach, describe, expect, it } from "vitest";

import {
  ApiError,
  StaticApiKeyAuthStrategy,
  getAdminName,
  getAuthStrategy,
  messageFromBody,
  setAdminName,
  setAuthStrategy,
} from "./httpClient";

describe("ApiError", () => {
  it("captures message, status, and details", () => {
    const e = new ApiError("boom", 500, { trace: "abc" });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe("boom");
    expect(e.status).toBe(500);
    expect(e.details).toEqual({ trace: "abc" });
    expect(e.name).toBe("ApiError");
  });
});

describe("messageFromBody", () => {
  it("reads the service's PascalCase Message", () => {
    // What a 409 from redeem or a 400 from create-customer-move looks like.
    expect(
      messageFromBody({
        Success: false,
        Message: "The customer is already on that server.",
      }),
    ).toBe("The customer is already on that server.");
  });

  it("falls back to camelCase and to ASP.NET's problem-details title", () => {
    expect(messageFromBody({ message: "from a proxy" })).toBe("from a proxy");
    expect(messageFromBody({ title: "One or more validation errors occurred." })).toBe(
      "One or more validation errors occurred.",
    );
  });

  it("prefers Message when a body carries more than one", () => {
    expect(messageFromBody({ Message: "the reason", title: "Conflict" })).toBe(
      "the reason",
    );
  });

  it("has nothing to offer for an empty or missing explanation", () => {
    expect(messageFromBody({ Success: false, Message: null })).toBeUndefined();
    expect(messageFromBody({ Message: "  " })).toBeUndefined();
    expect(messageFromBody(null)).toBeUndefined();
    expect(messageFromBody("text")).toBeUndefined();
  });
});

describe("StaticApiKeyAuthStrategy", () => {
  it("sets the api-key header without dropping existing headers", () => {
    const strategy = new StaticApiKeyAuthStrategy("secret-key");
    const headers = strategy.applyAuthHeaders({ Accept: "application/json" });
    expect(headers).toEqual({
      Accept: "application/json",
      "api-key": "secret-key",
    });
  });

  it("does not mutate the input object", () => {
    const strategy = new StaticApiKeyAuthStrategy("k");
    const input = { Accept: "x" };
    strategy.applyAuthHeaders(input);
    expect(input).toEqual({ Accept: "x" });
  });
});

describe("auth strategy and admin name globals", () => {
  afterEach(() => {
    setAuthStrategy(null);
    setAdminName(null);
  });

  it("setAuthStrategy round-trips", () => {
    expect(getAuthStrategy()).toBeNull();
    const s = new StaticApiKeyAuthStrategy("k");
    setAuthStrategy(s);
    expect(getAuthStrategy()).toBe(s);
    setAuthStrategy(null);
    expect(getAuthStrategy()).toBeNull();
  });

  it("setAdminName trims whitespace and clears empty values", () => {
    setAdminName("  erik  ");
    expect(getAdminName()).toBe("erik");
    setAdminName("");
    expect(getAdminName()).toBeNull();
    setAdminName(null);
    expect(getAdminName()).toBeNull();
  });
});
