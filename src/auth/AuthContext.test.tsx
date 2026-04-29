import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAdminName, getAuthStrategy } from "@/api/httpClient";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./authContextValue";

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
});
