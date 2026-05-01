import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAdminName, getAuthStrategy } from "@/api/httpClient";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./authContextValue";

const STORAGE_KEY = "cap.auth.v1";

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
  });

  afterEach(() => {
    sessionStorage.clear();
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
