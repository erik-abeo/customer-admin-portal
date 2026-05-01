import { describe, expect, it } from "vitest";

import {
  composeValidators,
  email,
  hostname,
  identifier,
  maxLength,
  minLength,
  port,
  required,
  strongPassword,
} from "./validators";

describe("validators", () => {
  describe("required", () => {
    const v = required("Name");
    it("rejects null, undefined, empty, whitespace", () => {
      expect(v(null)).toBe("Name is required");
      expect(v(undefined)).toBe("Name is required");
      expect(v("")).toBe("Name is required");
      expect(v("   ")).toBe("Name is required");
    });
    it("accepts non-empty values", () => {
      expect(v("hello")).toBeNull();
      expect(v(" hello ")).toBeNull();
    });
  });

  describe("maxLength / minLength", () => {
    it("flags too-long values", () => {
      expect(maxLength(3, "Name")("abcd")).toBe("Name must be 3 characters or fewer");
    });
    it("flags too-short values", () => {
      expect(minLength(3, "Name")("ab")).toBe("Name must be at least 3 characters");
    });
    it("ignores null/undefined", () => {
      expect(maxLength(3)(null)).toBeNull();
      expect(minLength(3)(undefined)).toBeNull();
    });
  });

  describe("hostname", () => {
    const v = hostname("Address");
    it("accepts valid hostnames, IPv4, IPv6", () => {
      expect(v("db-east-1.internal")).toBeNull();
      expect(v("crystalpm.com")).toBeNull();
      expect(v("10.0.0.1")).toBeNull();
      expect(v("::1")).toBeNull();
      expect(v("2001:db8::1")).toBeNull();
    });
    it("rejects malformed values", () => {
      expect(v("http://example.com")).not.toBeNull();
      expect(v("space here.com")).not.toBeNull();
      expect(v("999.999.999.999")).not.toBeNull();
    });
    it("ignores empty values (use required for that)", () => {
      expect(v(null)).toBeNull();
      expect(v("")).toBeNull();
    });
  });

  describe("email", () => {
    const v = email();
    it("accepts plausible emails", () => {
      expect(v("user@example.com")).toBeNull();
      expect(v("first.last+tag@sub.example.co")).toBeNull();
    });
    it("rejects malformed", () => {
      expect(v("not-an-email")).not.toBeNull();
      expect(v("user@.com")).not.toBeNull();
      expect(v("user@host")).not.toBeNull();
    });
  });

  describe("identifier", () => {
    const v = identifier("Database");
    it("accepts MySQL-style identifiers", () => {
      expect(v("tenant_acme")).toBeNull();
      expect(v("_internal")).toBeNull();
      expect(v("Customer123")).toBeNull();
    });
    it("rejects invalid identifiers", () => {
      expect(v("1tenant")).not.toBeNull();
      expect(v("tenant-acme")).not.toBeNull();
      expect(v("a".repeat(65))).not.toBeNull();
    });
  });

  describe("port", () => {
    const v = port();
    it("accepts integers in range", () => {
      expect(v(80)).toBeNull();
      expect(v(65535)).toBeNull();
      expect(v(1)).toBeNull();
    });
    it("rejects out of range", () => {
      expect(v(0)).not.toBeNull();
      expect(v(70_000)).not.toBeNull();
      expect(v(-1)).not.toBeNull();
    });
    it("rejects non-integers", () => {
      expect(v(80.5)).not.toBeNull();
    });
    it("ignores empty", () => {
      expect(v(null)).toBeNull();
      expect(v(undefined)).toBeNull();
      expect(v("")).toBeNull();
    });
  });

  describe("strongPassword", () => {
    const v = strongPassword();
    it("accepts a strong password", () => {
      expect(v("Aa1!aaaa")).toBeNull();
    });
    it("requires length and class diversity", () => {
      expect(v("short1A")).not.toBeNull();
      expect(v("alllowercase")).not.toBeNull();
      expect(v("12345678")).not.toBeNull();
    });
    it("ignores empty", () => {
      expect(v(null)).toBeNull();
      expect(v(undefined)).toBeNull();
    });
  });

  describe("composeValidators", () => {
    it("returns the first error found", () => {
      const v = composeValidators(required("Name"), maxLength(3, "Name"));
      expect(v(undefined)).toBe("Name is required");
      expect(v("abcd")).toBe("Name must be 3 characters or fewer");
      expect(v("abc")).toBeNull();
    });
  });
});
