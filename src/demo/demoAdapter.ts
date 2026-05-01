/**
 * Demo-mode axios adapter.
 *
 * Replaces the network layer entirely when the portal is started with
 * `VITE_DEMO_MODE=true`. Every HTTP call from the SPA — list pages,
 * detail pages, mutations, and even the LoginPage's verify-key probe —
 * is routed through this adapter, which serves data out of `demoStore`
 * with a small fake latency so the loading skeletons + nprogress bar
 * still feel real.
 *
 * Why this approach:
 *   - It plugs in at the axios layer, which means every existing API
 *     module keeps using `httpClient.get/post/put/delete` unchanged —
 *     no demo-aware branches in the data layer.
 *   - It returns the same response envelope shapes (PascalCase, ASP.NET
 *     System.Text.Json defaults) the real backend will return, so the
 *     UI cannot tell the difference.
 *   - Mutations write into the in-memory store so the demo can show
 *     "create a server", "edit a user", "delete a dump" end-to-end.
 *   - Each write also appends a synthetic event-log entry so the Event
 *     Log page reflects what the demonstrator just did.
 */
import type {
  AxiosHeaderValue,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { AxiosHeaders } from "axios";

import type {
  AuthorizedUserInfoItem,
  CreateDatabaseInfoRequest,
  CreateDatabaseServerInfoRequest,
  CreateDumpRequest,
  CreateStaticDatabaseUserRequest,
  CreateUserRequest,
  DatabaseInfoItem,
  DatabasePrivilegeInfo,
  DatabaseServerInfoItem,
  DumpInfoItem,
  EventLogEntry,
  EventLogQueryResponse,
  GetStaticDatabaseUserDetailResponse,
  ImportDumpRequest,
  UpdateDatabaseInfoRequest,
  UpdateDatabaseServerInfoRequest,
  UpdateDumpRequest,
  UpdateStaticDatabaseUserRequest,
  UpdateUserRequest,
} from "@/api/types";

import { demoStore } from "./demoStore";

const FAKE_LATENCY_MIN_MS = 80;
const FAKE_LATENCY_MAX_MS = 220;

/**
 * Path matched against the *relative* URL after the controller prefix
 * has been stripped (e.g. "/get-all-database-server-info"). Handlers
 * receive the parsed pieces:
 *   - body: parsed JSON body (or undefined for GET / DELETE)
 *   - params: regex captures from the path matcher
 *   - search: URLSearchParams from the query string
 */
interface RouteContext {
  body: unknown;
  params: Record<string, string>;
  search: URLSearchParams;
  config: InternalAxiosRequestConfig;
}

interface HandlerResult {
  status?: number;
  data: unknown;
  /** Optional response headers; X-Admin-Role is added automatically. */
  headers?: Record<string, string>;
}

type Handler = (ctx: RouteContext) => HandlerResult | Promise<HandlerResult>;

interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Regex applied against the relative path. Capture groups feed `params`. */
  pattern: RegExp;
  /** Names of the regex capture groups, in order. */
  paramNames?: string[];
  handle: Handler;
}

function notFound(message: string): HandlerResult {
  return {
    status: 404,
    data: { Success: false, Message: message },
  };
}

function ok<T>(data: T, status = 200, headers?: Record<string, string>): HandlerResult {
  return { status, data, headers };
}

function parseBody(config: InternalAxiosRequestConfig): unknown {
  if (config.data === undefined || config.data === null) return undefined;
  if (typeof config.data === "string") {
    try {
      return JSON.parse(config.data);
    } catch {
      return config.data;
    }
  }
  return config.data;
}

const ROUTES: Route[] = [
  // ---------- Database servers ----------
  {
    method: "GET",
    pattern: /^\/get-all-database-server-info$/,
    handle: () =>
      ok({
        Success: true,
        Message: null,
        DatabaseServerInfoList: demoStore.servers,
      }),
  },
  {
    method: "GET",
    pattern: /^\/get-database-server-info\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const found = demoStore.servers.find((s) => s.Id === id);
      if (!found) return notFound(`Database server ${id} not found`);
      return ok(found);
    },
  },
  {
    method: "POST",
    pattern: /^\/create-database-server-info$/,
    handle: ({ body }) => {
      const req = body as CreateDatabaseServerInfoRequest;
      const next: DatabaseServerInfoItem = {
        Id: demoStore.serverIds.next(),
        Name: req.Name,
        Description: req.Description,
        LocalServerAddress: req.LocalServerAddress,
        RemoteServerAddress: req.RemoteServerAddress,
        ServerPort: req.ServerPort,
        RootUserPassword: req.RootUserPassword,
        Certificate: req.Certificate,
      };
      demoStore.servers.push(next);
      demoStore.recordAdminEvent(`Created database server ${next.Name}`);
      return ok({ Id: next.Id, Message: null });
    },
  },
  {
    method: "PUT",
    pattern: /^\/update-database-server-info$/,
    handle: ({ body }) => {
      const req = body as UpdateDatabaseServerInfoRequest;
      const idx = demoStore.servers.findIndex((s) => s.Id === req.Id);
      if (idx === -1) return notFound(`Database server ${req.Id} not found`);
      demoStore.servers[idx] = { ...demoStore.servers[idx], ...req };
      demoStore.recordAdminEvent(`Updated database server ${req.Name}`);
      return ok({ Success: true, Message: null });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/delete-database-server-info\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const idx = demoStore.servers.findIndex((s) => s.Id === id);
      if (idx === -1) return notFound(`Database server ${id} not found`);
      const removed = demoStore.servers.splice(idx, 1)[0];
      // Cascade: drop databases on that server (matches the warning copy
      // shown in the Delete confirmation modal).
      demoStore.databases = demoStore.databases.filter(
        (d) => d.DatabaseServerId !== id,
      );
      demoStore.recordAdminEvent(`Deleted database server ${removed.Name}`);
      return ok({ Success: true, Message: null });
    },
  },

  // ---------- Databases ----------
  {
    method: "GET",
    pattern: /^\/get-all-database-info$/,
    handle: () =>
      ok({
        Success: true,
        Message: null,
        DatabaseInfoList: demoStore.databases,
      }),
  },
  {
    method: "GET",
    pattern: /^\/get-database-info\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const found = demoStore.databases.find((d) => d.Id === id);
      return ok({
        Success: !!found,
        Message: found ? null : `Database ${id} not found`,
        DatabaseInfo: found ?? null,
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/create-database-info$/,
    handle: ({ body }) => {
      const req = body as CreateDatabaseInfoRequest;
      const next: DatabaseInfoItem = {
        Id: demoStore.databaseIds.next(),
        DatabaseServerId: req.DatabaseServerId,
        DatabaseName: req.DatabaseName,
        Description: req.Description,
        CrystalPmId: req.CrystalPmId,
      };
      demoStore.databases.push(next);
      demoStore.recordAdminEvent(`Created database ${next.DatabaseName}`);
      return ok({ Success: true, Message: null, Id: next.Id });
    },
  },
  {
    method: "PUT",
    pattern: /^\/update-database-info$/,
    handle: ({ body }) => {
      const req = body as UpdateDatabaseInfoRequest;
      const idx = demoStore.databases.findIndex((d) => d.Id === req.Id);
      if (idx === -1) return notFound(`Database ${req.Id} not found`);
      const current = demoStore.databases[idx];
      demoStore.databases[idx] = {
        ...current,
        DatabaseServerId: req.DatabaseServerId ?? current.DatabaseServerId,
        DatabaseName: req.DatabaseName ?? current.DatabaseName,
        Description: req.Description ?? current.Description,
        CrystalPmId: req.CrystalPmId ?? current.CrystalPmId,
      };
      demoStore.recordAdminEvent(
        `Updated database ${demoStore.databases[idx].DatabaseName}`,
      );
      return ok({ Success: true, Message: null });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/delete-database-info\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const idx = demoStore.databases.findIndex((d) => d.Id === id);
      if (idx === -1) return notFound(`Database ${id} not found`);
      const removed = demoStore.databases.splice(idx, 1)[0];
      demoStore.recordAdminEvent(`Deleted database ${removed.DatabaseName}`);
      return ok({ Success: true, Message: null });
    },
  },

  // ---------- Authorized users ----------
  {
    method: "GET",
    pattern: /^\/get-users$/,
    handle: () =>
      ok({
        Success: true,
        Message: null,
        AuthorizedUserInfoList: demoStore.authorizedUsers,
      }),
  },
  {
    method: "GET",
    pattern: /^\/get-users\/(\d+)\/(\d+)$/,
    paramNames: ["serverId", "databaseId"],
    handle: ({ params }) => {
      const serverId = Number(params.serverId);
      const databaseId = Number(params.databaseId);
      const filtered = demoStore.authorizedUsers.filter((u) =>
        u.DatabaseMappings.some(
          (m) => m.DatabaseServerId === serverId && m.DatabaseId === databaseId,
        ),
      );
      return ok({
        Success: true,
        Message: null,
        AuthorizedUserInfoList: filtered,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/get-user\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const found = demoStore.authorizedUsers.find((u) => u.Id === id);
      return ok({
        Success: !!found,
        Message: found ? null : `User ${id} not found`,
        UserInfo: found ?? null,
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/create-user$/,
    handle: ({ body }) => {
      const req = body as CreateUserRequest;
      const next: AuthorizedUserInfoItem = {
        Id: demoStore.authorizedUserIds.next(),
        Email: req.Email,
        UseStaticHost: req.UseStaticHost,
        StaticHost: req.StaticHost,
        DatabaseMappings: req.DatabaseMappings ?? [],
      };
      demoStore.authorizedUsers.push(next);
      demoStore.recordAdminEvent(
        `Created authorized user ${next.Email}`,
        `DatabaseMappings count: ${next.DatabaseMappings.length}`,
      );
      return ok({ Success: true, Message: null, Id: next.Id });
    },
  },
  {
    method: "PUT",
    pattern: /^\/update-user$/,
    handle: ({ body }) => {
      const req = body as UpdateUserRequest;
      const userId = Number(req.UserId);
      const idx = demoStore.authorizedUsers.findIndex((u) => u.Id === userId);
      if (idx === -1) return notFound(`User ${req.UserId} not found`);
      const current = demoStore.authorizedUsers[idx];
      demoStore.authorizedUsers[idx] = {
        ...current,
        Email: req.Email,
        UseStaticHost: req.UseStaticHost,
        StaticHost: req.StaticHost,
        DatabaseMappings: req.DatabaseMappings,
      };
      demoStore.recordAdminEvent(`Updated authorized user ${req.Email}`);
      return ok({ Success: true, Message: null });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/delete-user\/([^/]+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const idx = demoStore.authorizedUsers.findIndex((u) => u.Id === id);
      if (idx === -1) return notFound(`User ${params.id} not found`);
      const removed = demoStore.authorizedUsers.splice(idx, 1)[0];
      demoStore.recordAdminEvent(`Deleted authorized user ${removed.Email}`);
      return ok({ Success: true, Message: null });
    },
  },

  // ---------- Static database users ----------
  {
    method: "GET",
    pattern: /^\/get-all-static-database-users$/,
    handle: () => ok(demoStore.staticUsers),
  },
  {
    method: "GET",
    pattern: /^\/get-static-database-users-by-server\/(\d+)$/,
    paramNames: ["serverId"],
    handle: ({ params }) => {
      const sid = Number(params.serverId);
      return ok(demoStore.staticUsers.filter((u) => u.DatabaseServerId === sid));
    },
  },
  {
    method: "GET",
    pattern: /^\/get-static-database-users-by-database\/(\d+)$/,
    paramNames: ["databaseId"],
    handle: ({ params }) => {
      const dbId = Number(params.databaseId);
      // Static users that have a privilege grid touching this database id.
      const matchingIds = new Set(
        Object.entries(demoStore.staticUserPrivileges)
          .filter(([, grids]) => grids.some((g) => g.DatabaseId === dbId))
          .map(([id]) => Number(id)),
      );
      return ok(demoStore.staticUsers.filter((u) => matchingIds.has(u.Id)));
    },
  },
  {
    method: "GET",
    pattern: /^\/get-static-database-user\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const found = demoStore.staticUsers.find((u) => u.Id === id);
      if (!found) return notFound(`Static user ${id} not found`);
      const detail: GetStaticDatabaseUserDetailResponse = {
        ...found,
        LastModifiedDateTimeUtc:
          found.LastModifiedDateTimeUtc ?? found.CreatedDateTimeUtc,
        DatabasePrivileges: demoStore.staticUserPrivileges[id] ?? [],
      };
      return ok(detail);
    },
  },
  {
    method: "POST",
    pattern: /^\/create-static-database-user$/,
    handle: ({ body }) => {
      const req = body as CreateStaticDatabaseUserRequest;
      const userName = `static_demo_${Date.now().toString(36)}`;
      const created: Array<{ ServerId: number; ServerName: string | null }> = [];
      for (const serverEntry of req.Servers) {
        const id = demoStore.staticUserIds.next();
        demoStore.staticUsers.push({
          Id: id,
          DatabaseServerId: serverEntry.ServerId,
          UserName: userName,
          Description: req.Description,
          CreatedDateTimeUtc: new Date().toISOString(),
          LastModifiedDateTimeUtc: new Date().toISOString(),
        });
        // Carry the privilege grid over.
        demoStore.staticUserPrivileges[id] = serverEntry.Databases.map(
          (d): DatabasePrivilegeInfo => ({
            DatabaseId: d.DatabaseId,
            Privileges: d.Privileges,
          }),
        );
        const server = demoStore.servers.find((s) => s.Id === serverEntry.ServerId);
        created.push({
          ServerId: serverEntry.ServerId,
          ServerName: server?.Name ?? null,
        });
      }
      demoStore.recordAdminEvent(
        `Created static DB user ${userName}`,
        `Servers: ${created.map((c) => c.ServerName ?? c.ServerId).join(", ")}`,
      );
      return ok({
        UserName: userName,
        Message: null,
        Servers: created.map((c) => ({
          ServerId: c.ServerId,
          ServerName: c.ServerName,
          UserName: userName,
          Password: "demo-generated-password",
          HostAddress: null,
          Port: null,
          Message: null,
        })),
      });
    },
  },
  {
    method: "PUT",
    pattern: /^\/update-static-database-user$/,
    handle: ({ body }) => {
      const req = body as UpdateStaticDatabaseUserRequest;
      // The list groups by UserName, so an "update" affects every row for
      // this user across servers.
      const all = demoStore.staticUsers.filter((u) => u.UserName === req.UserName);
      if (all.length === 0) return notFound(`Static user ${req.UserName} not found`);
      for (const u of all) {
        u.Description = req.NewDescription;
        u.LastModifiedDateTimeUtc = new Date().toISOString();
      }
      demoStore.recordAdminEvent(`Updated static DB user ${req.UserName}`);
      return ok({
        UserName: req.UserName,
        Message: null,
        NewPassword: req.GenerateNewPassword ? "demo-rotated-password" : null,
        Servers: all.map((u) => ({ ServerId: u.DatabaseServerId, Message: null })),
      });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/delete-static-database-user\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const idx = demoStore.staticUsers.findIndex((u) => u.Id === id);
      if (idx === -1) return notFound(`Static user ${id} not found`);
      const removed = demoStore.staticUsers.splice(idx, 1)[0];
      delete demoStore.staticUserPrivileges[id];
      demoStore.recordAdminEvent(
        `Deleted static DB user ${removed.UserName} on server ${removed.DatabaseServerId}`,
      );
      return ok({ Success: true, Message: null });
    },
  },

  // ---------- Dumps ----------
  {
    method: "GET",
    pattern: /^\/get-all-dumps$/,
    handle: ({ search }) => {
      const serverId = search.get("databaseServerId");
      const databaseId = search.get("databaseId");
      let dumps: DumpInfoItem[] = demoStore.dumps;
      if (serverId) {
        dumps = dumps.filter((d) => d.DatabaseServerId === Number(serverId));
      }
      if (databaseId) {
        dumps = dumps.filter((d) => d.DatabaseId === Number(databaseId));
      }
      return ok({ Success: true, Message: null, Dumps: dumps });
    },
  },
  {
    method: "POST",
    pattern: /^\/create-dump$/,
    handle: ({ body }) => {
      const req = body as CreateDumpRequest;
      const next: DumpInfoItem = {
        Id: demoStore.dumpIds.next(),
        Name: req.Name,
        DatabaseServerId: req.DatabaseServerId,
        DatabaseId: req.DatabaseId,
        FilePath: req.FilePath,
        Description: req.Description,
        SizeBytes: null,
        CreatedDateTimeUtc: new Date().toISOString(),
        LastModifiedDateTimeUtc: new Date().toISOString(),
      };
      demoStore.dumps.unshift(next);
      demoStore.recordAdminEvent(`Registered dump ${next.Name}`);
      return ok({ Success: true, Message: null, Id: next.Id });
    },
  },
  {
    method: "POST",
    pattern: /^\/upload-dump$/,
    handle: () => {
      // Multipart bodies arrive as FormData; we don't try to parse them
      // in demo mode — just simulate a successful upload.
      const id = demoStore.dumpIds.next();
      const next: DumpInfoItem = {
        Id: id,
        Name: `uploaded_demo_${id}`,
        DatabaseServerId: 1,
        DatabaseId: 100,
        FilePath: `/dumps/uploads/uploaded_demo_${id}.sql.gz`,
        Description: "Uploaded via demo mode",
        SizeBytes: 12_345_678,
        CreatedDateTimeUtc: new Date().toISOString(),
        LastModifiedDateTimeUtc: new Date().toISOString(),
      };
      demoStore.dumps.unshift(next);
      demoStore.recordAdminEvent(`Uploaded dump ${next.Name}`);
      return ok({ Success: true, Message: null, Id: id });
    },
  },
  {
    method: "PUT",
    pattern: /^\/update-dump$/,
    handle: ({ body }) => {
      const req = body as UpdateDumpRequest;
      const idx = demoStore.dumps.findIndex((d) => d.Id === req.Id);
      if (idx === -1) return notFound(`Dump ${req.Id} not found`);
      const current = demoStore.dumps[idx];
      demoStore.dumps[idx] = {
        ...current,
        Name: req.Name ?? current.Name,
        Description: req.Description ?? current.Description,
        FilePath: req.FilePath ?? current.FilePath,
        LastModifiedDateTimeUtc: new Date().toISOString(),
      };
      demoStore.recordAdminEvent(`Updated dump ${demoStore.dumps[idx].Name}`);
      return ok({ Success: true, Message: null });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/delete-dump\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const idx = demoStore.dumps.findIndex((d) => d.Id === id);
      if (idx === -1) return notFound(`Dump ${id} not found`);
      const removed = demoStore.dumps.splice(idx, 1)[0];
      demoStore.recordAdminEvent(`Deleted dump ${removed.Name}`);
      return ok({ Success: true, Message: null });
    },
  },
  {
    method: "POST",
    pattern: /^\/import-dump$/,
    handle: ({ body }) => {
      const req = body as ImportDumpRequest;
      demoStore.recordAdminEvent(
        `Imported dump ${req.DumpId} into database ${req.TargetDatabaseId}`,
        req.Replace ? "Replace mode (drop & recreate)" : "Append mode",
      );
      return ok({
        Success: true,
        Message: null,
        JobId: `demo-job-${Date.now().toString(36)}`,
      });
    },
  },

  // ---------- Event log ----------
  {
    method: "GET",
    pattern: /^\/event-log$/,
    handle: ({ search }) => {
      const page = Math.max(1, Number(search.get("page") ?? 1));
      const pageSize = Math.max(1, Math.min(200, Number(search.get("pageSize") ?? 50)));
      const userEmail = search.get("userEmail");
      const ipAddress = search.get("ipAddress");
      const eventType = search.get("eventType");
      const dbServerId = search.get("databaseServerId");
      const dbId = search.get("databaseId");

      let items: EventLogEntry[] = demoStore.eventLog;
      if (userEmail) {
        items = items.filter((e) =>
          (e.UserEmail ?? "").toLowerCase().includes(userEmail.toLowerCase()),
        );
      }
      if (ipAddress) {
        items = items.filter((e) => (e.IpAddress ?? "").includes(ipAddress));
      }
      if (eventType) {
        items = items.filter(
          (e) => e.EventType.toLowerCase() === eventType.toLowerCase(),
        );
      }
      if (dbServerId) {
        items = items.filter((e) => e.DatabaseServerId === Number(dbServerId));
      }
      if (dbId) {
        items = items.filter((e) => e.DatabaseId === Number(dbId));
      }

      const total = items.length;
      const slice = items.slice((page - 1) * pageSize, page * pageSize);
      const response: EventLogQueryResponse = {
        Items: slice,
        TotalCount: total,
        Page: page,
        PageSize: pageSize,
      };
      return ok(response);
    },
  },
  {
    method: "GET",
    pattern: /^\/event-log\/export\.csv$/,
    handle: () => {
      const header = [
        "Id",
        "TimestampUtc",
        "UserEmail",
        "IpAddress",
        "DatabaseServerId",
        "DatabaseId",
        "EventType",
        "Message",
      ].join(",");
      const rows = demoStore.eventLog.map((e) =>
        [
          e.Id,
          e.TimestampUtc,
          e.UserEmail ?? "",
          e.IpAddress ?? "",
          e.DatabaseServerId ?? "",
          e.DatabaseId ?? "",
          e.EventType,
          (e.Message ?? "").replace(/"/g, '""'),
        ].join(","),
      );
      const csv = [header, ...rows].join("\n");
      return {
        status: 200,
        data: new Blob([csv], { type: "text/csv" }),
        headers: { "content-type": "text/csv" },
      };
    },
  },
];

function findRoute(
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | null {
  const upperMethod = method.toUpperCase();
  for (const route of ROUTES) {
    if (route.method !== upperMethod) continue;
    const match = path.match(route.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    if (route.paramNames) {
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
    }
    return { route, params };
  }
  return null;
}

function relativePath(
  rawUrl: string,
  prefix: string,
): { path: string; search: URLSearchParams } {
  // axios may pass a fully-qualified URL or a path. Normalize both.
  let pathPart = rawUrl;
  let searchPart = "";
  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex !== -1) {
    pathPart = rawUrl.slice(0, queryIndex);
    searchPart = rawUrl.slice(queryIndex + 1);
  }
  // If full URL, drop the origin.
  try {
    if (/^https?:\/\//i.test(pathPart)) {
      const url = new URL(pathPart + (searchPart ? `?${searchPart}` : ""));
      pathPart = url.pathname;
      searchPart = url.search.replace(/^\?/, "");
    }
  } catch {
    // fall through — treat as path-only
  }
  // Strip prefix (e.g. "/My") if present.
  if (prefix && pathPart.startsWith(prefix)) {
    pathPart = pathPart.slice(prefix.length);
  }
  if (!pathPart.startsWith("/")) pathPart = `/${pathPart}`;
  return { path: pathPart, search: new URLSearchParams(searchPart) };
}

async function delay(): Promise<void> {
  const ms =
    FAKE_LATENCY_MIN_MS +
    Math.floor(Math.random() * (FAKE_LATENCY_MAX_MS - FAKE_LATENCY_MIN_MS));
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Build a complete axios response object. We always resolve (never
 * reject) — axios's `dispatchRequest` calls `settle()` which converts
 * non-2xx statuses into rejections that flow through the existing
 * httpClient response interceptor and become ApiError instances.
 */
function buildResponse(
  result: HandlerResult,
  config: InternalAxiosRequestConfig,
): AxiosResponse<unknown> {
  const status = result.status ?? 200;
  const headers = new AxiosHeaders();
  headers.set("content-type", "application/json");
  // Default RBAC role for demo mode is full admin so every UI surface
  // is reachable. Individual handlers can override via headers.
  headers.set("x-admin-role", "admin");
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      headers.set(k, v as AxiosHeaderValue);
    }
  }
  return {
    data: result.data,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    headers,
    config,
    request: undefined,
  };
}

/**
 * The actual axios adapter. Called by axios for every request when it
 * is installed via `httpClient.defaults.adapter` and `axios.defaults.adapter`.
 */
export async function demoAdapter(
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse<unknown>> {
  const url = config.url ?? "";
  // The httpClient instance has `baseURL` set to `${apiBase}${prefix}`.
  // axios already concatenates baseURL + url before calling the adapter,
  // but to be safe we accept either an already-resolved URL or just the
  // path.
  const baseURL = config.baseURL ?? "";
  const fullUrl =
    url.startsWith("http") || url.startsWith("/My")
      ? url
      : `${baseURL.replace(/\/+$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
  const { path, search } = relativePath(fullUrl, "/My");
  const method = (config.method ?? "get").toUpperCase();

  await delay();

  const matched = findRoute(method, path);
  if (!matched) {
    // Mirror what an unmocked endpoint would return — a 404 with a JSON
    // body. The httpClient interceptor will translate this to ApiError.
    return buildResponse(
      {
        status: 404,
        data: {
          Success: false,
          Message: `Demo mode has no handler for ${method} ${path}`,
        },
      },
      config,
    );
  }

  const ctx: RouteContext = {
    body: parseBody(config),
    params: matched.params,
    search,
    config,
  };
  const result = await matched.route.handle(ctx);
  return buildResponse(result, config);
}
