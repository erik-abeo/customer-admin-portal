/**
 * RequireRole tests.
 *
 * The role store short-circuits to "admin" when `features.rbac` is false,
 * so we mock @/config/env to flip the flag on for these tests. That way
 * setCurrentRole("viewer") actually takes effect and RequireRole has
 * something to gate against.
 */
import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  features: {
    rbac: true,
    dumps: false,
    eventLog: false,
    deletes: false,
    auditSink: false,
  },
  env: {
    apiBaseUrl: "http://api.test",
    apiControllerPrefix: "/My",
    appName: "Customer Admin Portal (test)",
    sentryDsn: undefined,
    environment: "test",
    auditSinkUrl: undefined,
    features: {
      rbac: true,
      dumps: false,
      eventLog: false,
      deletes: false,
      auditSink: false,
    },
  },
}));

import { setCurrentRole } from "./roles";
import { RequireRole } from "./RequireRole";

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * The role store is an external React state source (subscribed to via
 * `useSyncExternalStore`). Any mutation, including the cross-test
 * cleanup in beforeEach/afterEach, can trigger a re-render of any
 * mounted RequireRole component. Wrapping every mutation in act() keeps
 * React's reconciler happy and silences stderr `act` warnings.
 */
function setRoleAct(role: Parameters<typeof setCurrentRole>[0]) {
  act(() => {
    setCurrentRole(role);
  });
}

describe("<RequireRole>", () => {
  beforeEach(() => {
    setRoleAct(null);
  });

  afterEach(() => {
    setRoleAct(null);
  });

  it("renders children when the caller is an admin", () => {
    setRoleAct("admin");
    renderWithMantine(
      <RequireRole role="admin">
        <button data-testid="b">Edit</button>
      </RequireRole>,
    );
    expect(screen.getByTestId("b")).toBeInTheDocument();
  });

  it("hides children for a viewer when fallback='hide' (default)", () => {
    setRoleAct("viewer");
    renderWithMantine(
      <RequireRole role="admin">
        <button data-testid="b">Delete</button>
      </RequireRole>,
    );
    expect(screen.queryByTestId("b")).toBeNull();
  });

  it("disables children for a viewer when fallback='disable'", () => {
    setRoleAct("viewer");
    renderWithMantine(
      <RequireRole role="admin" fallback="disable">
        <button data-testid="b">Delete</button>
      </RequireRole>,
    );
    const btn = screen.getByTestId("b") as HTMLButtonElement;
    expect(btn).toBeInTheDocument();
    expect(btn.disabled).toBe(true);
  });

  it("normalizes 'readonly' / 'read-only' to viewer", () => {
    setRoleAct("readonly");
    renderWithMantine(
      <RequireRole role="admin">
        <button data-testid="hidden">Delete</button>
      </RequireRole>,
    );
    expect(screen.queryByTestId("hidden")).toBeNull();

    setRoleAct("read-only");
    renderWithMantine(
      <RequireRole role="admin">
        <button data-testid="hidden-2">Delete</button>
      </RequireRole>,
    );
    expect(screen.queryByTestId("hidden-2")).toBeNull();
  });

  it("re-renders when the role changes (subscriber wiring)", () => {
    setRoleAct("viewer");
    renderWithMantine(
      <RequireRole role="admin">
        <button data-testid="b">Edit</button>
      </RequireRole>,
    );
    expect(screen.queryByTestId("b")).toBeNull();

    setRoleAct("admin");
    expect(screen.getByTestId("b")).toBeInTheDocument();
  });
});
