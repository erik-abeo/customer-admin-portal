import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

/** Same admin with the same key, so what is cached was fetched with their access. */
function sameIdentity(a: StoredAuth | null, b: StoredAuth | null): boolean {
  return a?.adminName === b?.adminName && a?.apiKey === b?.apiKey;
}

export function AuthProvider({ children }: PropsWithChildren) {
  // Mounted inside QueryClientProvider (see App.tsx), so the client comes from
  // context rather than an import, and nothing here depends on App.
  const queryClient = useQueryClient();
  const [stored, setStored] = useState<StoredAuth | null>(() => {
    const initial = readStored();
    // Apply credentials synchronously during the first render so React Query
    // hooks below send authenticated requests immediately.
    applyToHttpClient(initial);
    return initial;
  });

  // The identity the cache was filled under, read by the storage listener
  // without re-subscribing it on every change.
  const current = useRef(stored);
  useEffect(() => {
    current.current = stored;
  }, [stored]);

  // Cross-tab sign-in / sign-out: react to storage changes from other tabs
  // so the UI doesn't drift from the actual auth state. Whenever the identity
  // changes, signed out or signed in as someone else, the cache goes with it:
  // what one admin fetched is not the next one's to see.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      const next = readStored();
      if (!sameIdentity(current.current, next)) queryClient.clear();
      setStored(next);
      applyToHttpClient(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  const signIn = useCallback(
    (adminName: string, apiKey: string) => {
      const next: StoredAuth = {
        adminName: adminName.trim(),
        apiKey: apiKey.trim(),
      };
      if (!sameIdentity(current.current, next)) queryClient.clear();
      writeStored(next);
      applyToHttpClient(next);
      setStored(next);
    },
    [queryClient],
  );

  // Clears every cached query and mutation as well. Server records carry their
  // decrypted administrator passwords, and a minted migration key sits in its
  // mutation's result, so none of it may outlive the session that fetched it,
  // idle sign-out and a 401 included, since both come through here.
  const signOut = useCallback(() => {
    writeStored(null);
    applyToHttpClient(null);
    setStored(null);
    queryClient.clear();
  }, [queryClient]);

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
