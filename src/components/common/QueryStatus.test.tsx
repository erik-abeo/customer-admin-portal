/**
 * `QueryStatus` tests — verify each error class renders the right copy
 * and CTA, and that loading / empty / success branches still work.
 */
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/httpClient";

import { QueryStatus } from "./QueryStatus";

function renderStatus(props: React.ComponentProps<typeof QueryStatus>) {
  return render(
    <MantineProvider defaultColorScheme="light">
      <QueryStatus {...props} />
    </MantineProvider>,
  );
}

describe("<QueryStatus>", () => {
  it("renders children when not loading / not error / not empty", () => {
    renderStatus({
      isLoading: false,
      error: null,
      isEmpty: false,
      children: <div>actual content</div>,
    });
    expect(screen.getByText("actual content")).toBeInTheDocument();
  });

  it("renders the loading state when isLoading is true", () => {
    renderStatus({
      isLoading: true,
      error: null,
      children: <div>nope</div>,
    });
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the empty state when isEmpty is true", () => {
    renderStatus({
      isLoading: false,
      error: null,
      isEmpty: true,
      emptyMessage: "Nothing here",
      emptyDescription: "Try adding one",
      children: <div>nope</div>,
    });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Try adding one")).toBeInTheDocument();
  });

  it("renders a 401 error with the session-expired copy and a sign-in link (no retry)", () => {
    const onRetry = vi.fn();
    renderStatus({
      isLoading: false,
      error: new ApiError("Unauthorized", 401),
      onRetry,
    });
    expect(screen.getByText("Your session expired")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a 403 error with permission-denied copy", () => {
    renderStatus({
      isLoading: false,
      error: new ApiError("Forbidden", 403),
      onRetry: () => {},
    });
    expect(screen.getByText("You don't have access to this")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a 404 error with not-found copy and a retry button", () => {
    const onRetry = vi.fn();
    renderStatus({
      isLoading: false,
      error: new ApiError("server says missing", 404),
      onRetry,
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Not found");
    expect(alert).toHaveTextContent("server says missing");
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders a 409 error with conflict copy", () => {
    renderStatus({
      isLoading: false,
      error: new ApiError("Conflict", 409),
      onRetry: () => {},
    });
    expect(screen.getByText("This record changed somewhere else")).toBeInTheDocument();
  });

  it("renders a 422 / 400 validation-failed error", () => {
    renderStatus({
      isLoading: false,
      error: new ApiError("Bad request", 400),
      onRetry: () => {},
    });
    expect(screen.getByText("Validation failed")).toBeInTheDocument();
  });

  it("renders a 5xx error with server-error copy and includes the status in the detail", () => {
    renderStatus({
      isLoading: false,
      error: new ApiError("Boom", 503),
      onRetry: () => {},
    });
    expect(screen.getByText("The server hit a problem")).toBeInTheDocument();
    expect(screen.getByText(/Boom/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
  });

  it("treats a status-0 ApiError as a network failure", () => {
    renderStatus({
      isLoading: false,
      error: new ApiError("Network Error", 0),
      onRetry: () => {},
    });
    expect(screen.getByText("Cannot reach the API")).toBeInTheDocument();
  });

  it("falls back to a generic message for non-ApiError errors", () => {
    renderStatus({
      isLoading: false,
      error: new Error("Something exploded"),
      onRetry: () => {},
    });
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    expect(screen.getByText(/Something exploded/)).toBeInTheDocument();
  });
});
