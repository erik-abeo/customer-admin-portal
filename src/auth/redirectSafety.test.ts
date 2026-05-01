import { describe, expect, it } from "vitest";

import { safeRedirect } from "./redirectSafety";

describe("safeRedirect", () => {
  it("returns / when raw is null, undefined, or empty", () => {
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect("")).toBe("/");
  });

  it("decodes percent-encoded same-origin paths", () => {
    expect(safeRedirect("%2Fdatabases")).toBe("/databases");
    expect(safeRedirect("%2Fauthorized-users%3Femail%3Da%40b.com")).toBe(
      "/authorized-users?email=a@b.com",
    );
  });

  it("returns / for absolute URLs", () => {
    expect(safeRedirect("https://evil.com/path")).toBe("/");
    expect(safeRedirect("http://evil.com")).toBe("/");
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
    expect(safeRedirect("data:text/html,foo")).toBe("/");
  });

  it("returns / for protocol-relative URLs (//host)", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("//evil.com/database-servers")).toBe("/");
    // Even when the user URL-encoded the slashes:
    expect(safeRedirect("%2F%2Fevil.com")).toBe("/");
  });

  it("returns / for backslash-prefixed escapes that some parsers normalize", () => {
    expect(safeRedirect("/\\evil.com")).toBe("/");
    expect(safeRedirect("%2F%5Cevil.com")).toBe("/");
  });

  it("returns / on malformed percent-encoding", () => {
    expect(safeRedirect("%E0%A4%A")).toBe("/");
  });

  it("preserves query string and hash on a same-origin path", () => {
    expect(safeRedirect("/databases?server=1#row-42")).toBe(
      "/databases?server=1#row-42",
    );
  });
});
