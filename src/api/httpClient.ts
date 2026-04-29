import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

import { setCurrentRole } from "@/auth/roles";
import { env } from "@/config/env";

/**
 * Authentication strategy interface. The current implementation injects a
 * static `api-key` header consumed by APIKeyAuthenticationMiddleware on the
 * ASP.NET ClientRemoteDatabaseAccessAPI. When we move management endpoints to
 * a per-user token model (Supertokens-issued JWT or otherwise), only this
 * module changes — swap in a new AuthStrategy via `setAuthStrategy`.
 */
export interface AuthStrategy {
  applyAuthHeaders(headers: Record<string, string>): Record<string, string>;
}

export class StaticApiKeyAuthStrategy implements AuthStrategy {
  constructor(private readonly apiKey: string) {}

  applyAuthHeaders(headers: Record<string, string>): Record<string, string> {
    return { ...headers, "api-key": this.apiKey };
  }
}

let currentAuthStrategy: AuthStrategy | null = null;

export function setAuthStrategy(strategy: AuthStrategy | null): void {
  currentAuthStrategy = strategy;
}

export function getAuthStrategy(): AuthStrategy | null {
  return currentAuthStrategy;
}

/**
 * Optional context describing the human admin behind the request, surfaced
 * to interceptors (audit logging) and forwarded to the backend so future
 * audit endpoints can attribute write operations.
 */
let currentAdminName: string | null = null;

export function setAdminName(name: string | null): void {
  currentAdminName = name && name.trim().length > 0 ? name.trim() : null;
}

export function getAdminName(): string | null {
  return currentAdminName;
}

/** Normalized error surfaced by the API client to the UI layer. */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function buildBaseUrl(): string {
  const base = env.apiBaseUrl.replace(/\/+$/, "");
  const prefix = env.apiControllerPrefix.startsWith("/")
    ? env.apiControllerPrefix
    : `/${env.apiControllerPrefix}`;
  return `${base}${prefix}`;
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: buildBaseUrl(),
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const headers: Record<string, string> = {
    ...((config.headers as Record<string, string> | undefined) ?? {}),
  };
  if (currentAuthStrategy) {
    Object.assign(headers, currentAuthStrategy.applyAuthHeaders(headers));
  }
  if (currentAdminName) {
    headers["X-Admin-User"] = currentAdminName;
  }
  config.headers = headers as typeof config.headers;
  return config;
});

/**
 * Optional global hook for response observers (audit log, etc.). Each
 * registered listener receives every response and every error normalized to
 * an ApiError. Throwing inside a listener is suppressed.
 */
export type ResponseListener = (event: ResponseEvent) => void;
export interface ResponseEvent {
  method: string;
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  admin: string | null;
  error?: ApiError;
}

const responseListeners = new Set<ResponseListener>();

export function addResponseListener(listener: ResponseListener): () => void {
  responseListeners.add(listener);
  return () => responseListeners.delete(listener);
}

function emit(event: ResponseEvent): void {
  for (const listener of responseListeners) {
    try {
      listener(event);
    } catch {
      // Listeners must never break the request pipeline.
    }
  }
}

const REQUEST_START = Symbol("request-start");
type TimedConfig = InternalAxiosRequestConfig & {
  [REQUEST_START]?: number;
};

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  (config as TimedConfig)[REQUEST_START] = performance.now();
  return config;
});

/**
 * Reads the X-Admin-Role response header (if any) and forwards it to the
 * RBAC store. Backend is expected to emit one of: "admin", "viewer".
 * Header names are case-insensitive per RFC 7230.
 */
function captureRoleHeader(headers: Record<string, unknown> | undefined): void {
  if (!headers) return;
  const candidate =
    headers["x-admin-role"] ?? headers["X-Admin-Role"] ?? headers["X-ADMIN-ROLE"];
  if (typeof candidate === "string") {
    setCurrentRole(candidate);
  }
}

httpClient.interceptors.response.use(
  (response: AxiosResponse) => {
    captureRoleHeader(response.headers as Record<string, unknown> | undefined);
    const cfg = response.config as TimedConfig;
    const start = cfg[REQUEST_START];
    emit({
      method: (response.config.method ?? "get").toUpperCase(),
      url: response.config.url ?? "",
      status: response.status,
      ok: true,
      durationMs: start ? performance.now() - start : 0,
      admin: currentAdminName,
    });
    return response;
  },
  (error: AxiosError) => {
    captureRoleHeader(error.response?.headers as Record<string, unknown> | undefined);
    const status = error.response?.status ?? 0;
    const data = error.response?.data;
    const message =
      (typeof data === "string" && data) ||
      (typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : undefined) ||
      error.message ||
      "Unknown API error";
    const apiError = new ApiError(message, status, data);
    const cfg = error.config as TimedConfig | undefined;
    const start = cfg?.[REQUEST_START];
    emit({
      method: (error.config?.method ?? "get").toUpperCase(),
      url: error.config?.url ?? "",
      status,
      ok: false,
      durationMs: start ? performance.now() - start : 0,
      admin: currentAdminName,
      error: apiError,
    });
    return Promise.reject(apiError);
  },
);
