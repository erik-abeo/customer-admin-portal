import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAdminName, getAuthStrategy } from "@/api/httpClient";
import { features } from "@/config/env";

import { AuthProvider } from "./AuthContext";
import { getCurrentRole, setCurrentRole } from "./roles";
import { useAuth } from "./authContextValue";

const STORAGE_KEY = "cap.auth.v1";

// AuthProvider reads the QueryClient from context, as it does inside App.
let queryClient: QueryClient;
const render = (ui: ReactElement) =>
  rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

function Probe() {
  const { adminName, isAuthenticated, signIn, signOut } = useAuth();
  return (
    <div>
      <div data-testid="state">{isAuthenticated ? `auth:${adminName}` : "anon"}</div>
      <button onClick={() => signIn("erik", "k1")}>in</button>
      <button onClick={() => signOut()}>out</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
    queryClient = new QueryClient();
  });

  it("signOut empties the query cache, so no secret survives into the next session", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    act(() => {
      screen.getByText("in").click();
    });
    queryClient.setQueryData(["database-servers"], [{ RootUserPassword: "secret" }]);

    act(() => {
      screen.getByText("out").click();
    });

    expect(queryClient.getQueryData(["database-servers"])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("drops the RBAC role at sign-in and sign-out, so it cannot outlive its session", () => {
    // With RBAC off every caller reads as admin, which would hide a kept role.
    const rbac = features as { rbac: boolean };
    const wasOn = rbac.rbac;
    rbac.rbac = true;
    try {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      act(() => setCurrentRole("admin"));
      act(() => {
        screen.getByText("in").click();
      });
      expect(getCurrentRole()).toBe("viewer");

      act(() => setCurrentRole("admin"));
      act(() => {
        screen.getByText("out").click();
      });
      expect(getCurrentRole()).toBe("viewer");
    } finally {
      rbac.rbac = wasOn;
      act(() => setCurrentRole(null));
    }
  });

  it("starts unauthenticated when sessionStorage is empty", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("anon");
    expect(getAuthStrategy()).toBeNull();
    expect(getAdminName()).toBeNull();
  });

  it("signIn persists to sessionStorage and configures the http client", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    act(() => {
      screen.getByText("in").click();
    });

    expect(screen.getByTestId("state").textContent).toBe("auth:erik");
    const stored = JSON.parse(sessionStorage.getItem("cap.auth.v1") ?? "null");
    expect(stored).toEqual({ adminName: "erik", apiKey: "k1" });
    expect(getAdminName()).toBe("erik");
    expect(getAuthStrategy()).not.toBeNull();
  });

  it("signOut clears sessionStorage and the http client", () => {
    sessionStorage.setItem(
      "cap.auth.v1",
      JSON.stringify({ adminName: "preset", apiKey: "k0" }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("auth:preset");

    act(() => {
      screen.getByText("out").click();
    });

    expect(screen.getByTestId("state").textContent).toBe("anon");
    expect(sessionStorage.getItem("cap.auth.v1")).toBeNull();
    expect(getAuthStrategy()).toBeNull();
    expect(getAdminName()).toBeNull();
  });

  it("hydrates admin/api-key state from sessionStorage on first mount", () => {
    sessionStorage.setItem(
      "cap.auth.v1",
      JSON.stringify({ adminName: "preset", apiKey: "preset-key" }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("auth:preset");
    expect(getAdminName()).toBe("preset");
    const strategy = getAuthStrategy();
    expect(strategy).not.toBeNull();
    expect(strategy!.applyAuthHeaders({})).toEqual({ "api-key": "preset-key" });
  });

  it("syncs sign-in from another tab via the storage event", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("anon");

    act(() => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ adminName: "from-tab-2", apiKey: "k" }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: sessionStorage.getItem(STORAGE_KEY),
        }),
      );
    });

    expect(screen.getByTestId("state").textContent).toBe("auth:from-tab-2");
    expect(getAdminName()).toBe("from-tab-2");
  });

  it("syncs sign-out from another tab via the storage event", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ adminName: "before", apiKey: "k" }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("auth:before");

    act(() => {
      sessionStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, newValue: null }),
      );
    });

    expect(screen.getByTestId("state").textContent).toBe("anon");
    expect(getAuthStrategy()).toBeNull();
  });

  it("clears the cache when another tab signs in as a different admin", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ adminName: "first", apiKey: "k1" }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    queryClient.setQueryData(["database-servers"], [{ RootUserPassword: "secret" }]);

    act(() => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ adminName: "second", apiKey: "k2" }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: sessionStorage.getItem(STORAGE_KEY),
        }),
      );
    });

    expect(screen.getByTestId("state").textContent).toBe("auth:second");
    expect(queryClient.getQueryData(["database-servers"])).toBeUndefined();
  });

  it("keeps the cache when a storage event repeats the same identity", () => {
    const same = JSON.stringify({ adminName: "stable", apiKey: "k" });
    sessionStorage.setItem(STORAGE_KEY, same);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    queryClient.setQueryData(["databases"], []);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, newValue: same }),
      );
    });

    expect(queryClient.getQueryData(["databases"])).toEqual([]);
  });

  it("ignores storage events for unrelated keys", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ adminName: "stable", apiKey: "k" }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some.other.key",
          newValue: "tampering",
        }),
      );
    });

    expect(screen.getByTestId("state").textContent).toBe("auth:stable");
  });
});
