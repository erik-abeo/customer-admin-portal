import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  StaticApiKeyAuthStrategy,
  setAdminName,
  setAuthStrategy,
} from "@/api/httpClient";
import { AuthContext, type AuthState } from "@/auth/authContextValue";

const STORAGE_KEY = "cap.auth.v1";

interface StoredAuth {
  adminName: string;
  apiKey: string;
}

function readStored(): StoredAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (!parsed.adminName || !parsed.apiKey) return null;
    return { adminName: parsed.adminName, apiKey: parsed.apiKey };
  } catch {
    return null;
  }
}

function writeStored(value: StoredAuth | null): void {
  try {
    if (value) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode, quota). Auth simply does not
    // persist across reloads in that case.
  }
}

function applyToHttpClient(value: StoredAuth | null): void {
  if (value) {
    setAuthStrategy(new StaticApiKeyAuthStrategy(value.apiKey));
    setAdminName(value.adminName);
  } else {
    setAuthStrategy(null);
    setAdminName(null);
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [stored, setStored] = useState<StoredAuth | null>(() => {
    const initial = readStored();
    // Apply credentials synchronously during the first render so React Query
    // hooks below send authenticated requests immediately.
    applyToHttpClient(initial);
    return initial;
  });

  // Cross-tab sign-in / sign-out: react to storage changes from other tabs
  // so the UI doesn't drift from the actual auth state.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      const next = readStored();
      setStored(next);
      applyToHttpClient(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback((adminName: string, apiKey: string) => {
    const next: StoredAuth = {
      adminName: adminName.trim(),
      apiKey: apiKey.trim(),
    };
    writeStored(next);
    applyToHttpClient(next);
    setStored(next);
  }, []);

  const signOut = useCallback(() => {
    writeStored(null);
    applyToHttpClient(null);
    setStored(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      adminName: stored?.adminName ?? null,
      isAuthenticated: stored !== null,
      signIn,
      signOut,
    }),
    [stored, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
