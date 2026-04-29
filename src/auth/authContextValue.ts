import { createContext, useContext } from "react";

export interface AuthState {
  adminName: string | null;
  isAuthenticated: boolean;
  signIn: (adminName: string, apiKey: string) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
