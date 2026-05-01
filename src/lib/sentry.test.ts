import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubEvent } from "./sentry";

const buildEvent = (overrides: Partial<ErrorEvent>): ErrorEvent =>
  ({ type: undefined, ...overrides }) as unknown as ErrorEvent;

describe("scrubBreadcrumb", () => {
  it("removes api-key from xhr breadcrumb data", () => {
    const breadcrumb: Breadcrumb = {
      category: "xhr",
      data: { method: "GET", url: "/foo", "api-key": "secret-key" },
    };
    const result = scrubBreadcrumb(breadcrumb);
    expect(result.data).toEqual({ method: "GET", url: "/foo" });
    expect(result.data?.["api-key"]).toBeUndefined();
  });

  it("removes api-key from fetch breadcrumb data", () => {
    const breadcrumb: Breadcrumb = {
      category: "fetch",
      data: { "api-key": "secret-key" },
    };
    const result = scrubBreadcrumb(breadcrumb);
    expect(result.data?.["api-key"]).toBeUndefined();
  });

  it("leaves other breadcrumb categories untouched (no-op)", () => {
    const breadcrumb: Breadcrumb = {
      category: "ui.click",
      data: { "api-key": "should-not-be-here-but-leave-alone" },
    };
    const result = scrubBreadcrumb(breadcrumb);
    expect(result.data?.["api-key"]).toBe("should-not-be-here-but-leave-alone");
  });

  it("handles breadcrumbs with no data field", () => {
    const breadcrumb: Breadcrumb = { category: "xhr" };
    expect(() => scrubBreadcrumb(breadcrumb)).not.toThrow();
  });
});

describe("scrubEvent", () => {
  it("strips api-key from request headers regardless of casing", () => {
    const event = buildEvent({
      request: {
        headers: {
          "api-key": "lower",
          "Api-Key": "title",
          "API-KEY": "upper",
          "Content-Type": "application/json",
        },
      },
    });
    const result = scrubEvent(event);
    const headers = result.request!.headers as Record<string, string>;
    expect(headers["api-key"]).toBeUndefined();
    expect(headers["Api-Key"]).toBeUndefined();
    expect(headers["API-KEY"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("returns the event untouched when there are no request headers", () => {
    const event = buildEvent({ message: "boom" });
    expect(() => scrubEvent(event)).not.toThrow();
    expect(scrubEvent(event)).toBe(event);
  });
});
