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
 *     "create a server", "edit a user", "delete a static user" end-to-end.
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
  CreateCustomerMoveRequest,
  CreateMigrationSessionRequest,
  CreateMigrationSessionResponse,
  GetServerCapacityHistoryResponse,
  ServerMetricsPoint,
  GetMigrationSessionResponse,
  GetMigrationSessionsResponse,
  MigrationSessionItem,
  CustomerMove,
  GetCustomerMovesResponse,
  GetFleetCapacityResponse,
  ServerCapacity,
  ProbeDatabaseServerRequest,
  ProbeDatabaseServerResponse,
  CreateStaticDatabaseUserRequest,
  CreateStaticDatabaseUserResponse,
  CreateUserRequest,
  DatabaseInfoItem,
  DatabasePrivilegeInfo,
  DatabaseServerInfoItem,
  EventLogEntry,
  EventLogQueryResponse,
  GetStaticDatabaseUserDetailResponse,
  UpdateDatabaseInfoRequest,
  UpdateDatabaseServerInfoRequest,
  UpdateStaticDatabaseUserRequest,
  UpdateStaticDatabaseUserResponse,
  UpdateUserRequest,
} from "@/api/types";

import { isSafeDatabaseName } from "@/features/migrations/migrationTarget";

import { demoStore } from "./demoStore";
import { advanceMoves, advanceSessions, restoreSource } from "./simulation";

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

/** Statuses that block another move for the same customer, as the service counts them. */
const UNSETTLED_MOVES = new Set([
  "planned",
  "draining",
  "copying",
  "verifying",
  "flipped",
]);

/**
 * The service's mint refusals that demo mode can reproduce, in its order and
 * words. The ones that need a real server, such as a schema existing
 * unregistered, are left to the service.
 */
function mintRefusal(req: CreateMigrationSessionRequest): string | null {
  // As the service checks it: a stale server id is a refusal, and only an
  // available server takes a new customer. A key against a database already
  // there is a retry for a customer who is on it, so it is allowed.
  if (!demoStore.servers.some((s) => s.Id === req.DatabaseServerId))
    return `Database server ${req.DatabaseServerId} does not exist.`;
  const serverStatus = demoStore.serverStatus(req.DatabaseServerId);
  if (req.DatabaseName?.trim() && serverStatus !== "available")
    return `That server is marked '${serverStatus}', so it is not taking new customers.`;
  if (req.DatabaseName !== null) {
    const name = req.DatabaseName.trim();
    const existingForCustomer = demoStore.databases.find(
      (d) =>
        d.DatabaseServerId === req.DatabaseServerId &&
        d.CrystalPmId === req.CrystalPmId,
    );
    if (existingForCustomer)
      return `Customer ${req.CrystalPmId} already has '${existingForCustomer.DatabaseName}' on this server. Select it as the existing database instead.`;
    const sameName = demoStore.databases.find(
      (d) =>
        d.DatabaseServerId === req.DatabaseServerId &&
        d.DatabaseName.toLowerCase() === name.toLowerCase(),
    );
    if (sameName)
      return `A database named '${sameName.DatabaseName}' already exists on this server for customer ${sameName.CrystalPmId}. Choose a name unique to this customer.`;
    return null;
  }

  const database = demoStore.databases.find((d) => d.Id === req.DatabaseId);
  if (!database) return "The selected database no longer exists.";
  if (database.DatabaseServerId !== req.DatabaseServerId)
    return "The selected database is not on the selected server. Re-pick the destination.";
  if (database.CrystalPmId !== req.CrystalPmId)
    return `The selected database belongs to customer ${database.CrystalPmId}, not ${req.CrystalPmId}.`;
  // From the database's own status, as the service decides it: a move in
  // progress shows as `moving`.
  if (database.Status !== "active")
    return `The selected database is ${database.Status}, so nothing may be migrated into it.`;
  return null;
}

/**
 * An invented but plausible trend: one snapshot a day, growing slowly towards
 * today's figures, so the history view has something to show.
 */
function demoCapacityHistory(serverId: number, days: number): ServerMetricsPoint[] {
  const customers = demoStore.databases.filter(
    (d) => d.DatabaseServerId === serverId,
  ).length;
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => {
    const age = days - 1 - i;
    const growth = 1 - age / (days * 4);
    return {
      UtcTimestamp: new Date(now - age * 86_400_000).toISOString(),
      CustomerDatabaseCount: Math.max(0, customers - Math.floor(age / 45)),
      AuthorizedUserCount: Math.round((customers * 4 + 2) * growth),
      DataBytes: Math.round(customers * 1_400_000_000 * growth),
      IndexBytes: Math.round(customers * 160_000_000 * growth),
      ApproxRowCount: Math.round(customers * 1_600_000 * growth),
      DatabaseConnections: 12 + ((i * 7 + serverId * 3) % 17),
    };
  });
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
        DatabaseServerInfoList: demoStore.servers.map((s) => ({
          ...s,
          Status: demoStore.serverStatus(s.Id),
        })),
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
      return ok({ ...found, Status: demoStore.serverStatus(id) });
    },
  },
  {
    method: "GET",
    pattern: /^\/get-customer-moves$/,
    handle: () => {
      advanceMoves(demoStore, Date.now());
      return ok<GetCustomerMovesResponse>({
        Success: true,
        Message: null,
        Moves: demoStore.customerMoves,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/get-customer-move\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      advanceMoves(demoStore, Date.now());
      const id = Number(params.id);
      const move = demoStore.customerMoves.find((m) => m.Id === id);
      if (!move) return notFound(`Move ${id} not found`);
      return ok({
        Success: true,
        Message: null,
        Move: move,
        Verification: demoStore.customerMoveVerification[id] ?? [],
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/create-customer-move$/,
    handle: ({ body }) => {
      const req = body as CreateCustomerMoveRequest;
      const database = demoStore.databases.find((d) => d.Id === req.DatabaseId);
      // Refused the way the service refuses, so demo mode shows the same words.
      if (!database)
        return {
          status: 400,
          data: { Success: false, Message: "That database does not exist.", MoveId: 0 },
        };
      if (database.DatabaseServerId === req.TargetDatabaseServerId)
        return {
          status: 400,
          data: {
            Success: false,
            Message: "The customer is already on that server.",
            MoveId: 0,
          },
        };
      if (!demoStore.servers.some((s) => s.Id === req.TargetDatabaseServerId))
        return {
          status: 400,
          data: {
            Success: false,
            Message: `Database server ${req.TargetDatabaseServerId} does not exist.`,
            MoveId: 0,
          },
        };
      const targetStatus = demoStore.serverStatus(req.TargetDatabaseServerId);
      if (targetStatus !== "available")
        return {
          status: 400,
          data: {
            Success: false,
            Message: `The target server is marked '${targetStatus}', so it is not taking new customers.`,
            MoveId: 0,
          },
        };
      if (database.Status !== "active")
        return {
          status: 400,
          data: {
            Success: false,
            Message: `This database is ${database.Status}. Only an active database can be moved.`,
            MoveId: 0,
          },
        };
      const refuse = (message: string) => ({
        status: 400,
        data: { Success: false, Message: message, MoveId: 0 },
      });
      const staticPrivileges = Object.values(demoStore.staticUserPrivileges)
        .flat()
        .filter((p) => p.DatabaseId === database.Id).length;
      if (staticPrivileges > 0)
        return refuse(
          `${staticPrivileges} static user privilege(s) are held on this database, and moves do not carry static users yet. After a move they would still point at the old copy.`,
        );
      if (
        demoStore.migrationSessions.some(
          (s) =>
            s.DatabaseId === database.Id &&
            (s.Status === "redeemed" || s.Status === "streaming"),
        )
      )
        return refuse(
          "A migration is streaming into this database. Wait for it to finish, or revoke it, before moving the customer.",
        );
      if (
        demoStore.customerMoves.some(
          (m) =>
            m.DatabaseId === database.Id &&
            (UNSETTLED_MOVES.has(m.Status ?? "") ||
              (m.Status === "settled" && !m.SourceDroppedDateTimeUtc)),
        )
      )
        return refuse(
          "This customer already has a move in progress, or one that has cut over and not been settled. Settle or roll that back first.",
        );
      const targetName = req.TargetDatabaseName?.trim() || database.DatabaseName;
      if (!isSafeDatabaseName(targetName))
        return refuse(
          `'${targetName}' is not a usable database name. Use letters, digits and underscores, starting with a letter.`,
        );
      const onTarget = demoStore.databases.filter(
        (d) => d.DatabaseServerId === req.TargetDatabaseServerId,
      );
      const sameName = onTarget.find(
        (d) => d.DatabaseName.toLowerCase() === targetName.toLowerCase(),
      );
      if (sameName)
        return refuse(
          `The target server already has a database named '${sameName.DatabaseName}' (customer ${sameName.CrystalPmId}). Choose another name for this customer's copy.`,
        );
      if (onTarget.some((d) => d.CrystalPmId === database.CrystalPmId))
        return refuse(
          `Customer ${database.CrystalPmId} already has a database registered on the target server. Resolve that registration before moving them there.`,
        );

      const source = demoStore.servers.find((s) => s.Id === database.DatabaseServerId);
      const target = demoStore.servers.find((s) => s.Id === req.TargetDatabaseServerId);
      const id = demoStore.customerMoveIds.next();

      const move: CustomerMove = {
        Id: id,
        DatabaseId: database.Id,
        CrystalPmId: database.CrystalPmId,
        SourceDatabaseServerId: database.DatabaseServerId,
        SourceDatabaseServerName: source?.Name ?? null,
        TargetDatabaseServerId: req.TargetDatabaseServerId,
        TargetDatabaseServerName: target?.Name ?? null,
        TargetDatabaseName: targetName,
        SourceDatabaseName: database.DatabaseName,
        Status: "planned",
        PhaseDetail: "Waiting for the executor to reserve the target.",
        RequestedByAdmin: req.RequestedByAdmin,
        CreatedDateTimeUtc: new Date().toISOString(),
        QuiescedDateTimeUtc: null,
        CopyStartedDateTimeUtc: null,
        CopyCompletedDateTimeUtc: null,
        VerifiedDateTimeUtc: null,
        FlippedDateTimeUtc: null,
        SourceRetiredDateTimeUtc: null,
        SourceDroppedDateTimeUtc: null,
        ErrorMessage: null,
      };
      demoStore.customerMoves = [move, ...demoStore.customerMoves];
      // What planning does on the service: the customer stops getting new sessions.
      database.Status = "moving";
      return ok({
        Success: true,
        MoveId: id,
        Message:
          "Move planned. Within moments the target is reserved and the customer stops getting new sessions; sessions already open are left to finish before the copy starts.",
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/cancel-customer-move\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const move = demoStore.customerMoves.find((m) => m.Id === Number(params.id));
      if (!move) return notFound("Move not found");
      if (move.Status !== "planned" && move.Status !== "draining") {
        return ok({
          Success: false,
          Message: `This move is ${move.Status}. Only a move that has not started copying can be cancelled.`,
          MoveId: move.Id,
        });
      }
      move.Status = "cancelled";
      const cancelled = demoStore.databases.find((d) => d.Id === move.DatabaseId);
      if (cancelled?.Status === "moving") cancelled.Status = "active";
      move.PhaseDetail =
        "Cancelled by an operator before copying began. The customer was put back online.";
      return ok({
        Success: true,
        MoveId: move.Id,
        Message: "Move cancelled. The customer is back online on the source.",
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/roll-back-customer-move\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const move = demoStore.customerMoves.find((m) => m.Id === Number(params.id));
      if (!move) return notFound("Move not found");
      if (move.Status !== "flipped") {
        return ok({
          Success: false,
          Message: `This move is ${move.Status}. Only a move that has cut over can be rolled back.`,
          MoveId: move.Id,
        });
      }
      move.Status = "rolled_back";
      restoreSource(demoStore, move);
      move.PhaseDetail =
        "Pointed back at the source. The target copy is left in place.";
      return ok({
        Success: true,
        MoveId: move.Id,
        Message:
          "Pointed back at the source. Anything written on the target since the cutover is still there, not in the source, and the target copy is left in place.",
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/drop-customer-move-source\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const move = demoStore.customerMoves.find((m) => m.Id === Number(params.id));
      if (!move) return notFound("Move not found");
      if (move.SourceDroppedDateTimeUtc)
        return ok({
          Success: true,
          Message: "The source has already been dropped.",
          MoveId: move.Id,
        });
      // As the service: a settled move with no drop recorded is a drop interrupted
      // after its claim, and asking again finishes it.
      if (move.Status !== "flipped" && move.Status !== "settled") {
        return ok({
          Success: false,
          Message: `This move is ${move.Status}. Only a move that cut over cleanly has a source to retire.`,
          MoveId: move.Id,
        });
      }
      if (!move.SourceDatabaseName?.trim())
        return ok({
          Success: false,
          Message:
            "The source database name is not recorded, so it cannot be dropped safely.",
          MoveId: move.Id,
        });
      move.Status = "settled";
      move.SourceDroppedDateTimeUtc = new Date().toISOString();
      move.PhaseDetail = "Source dropped. This move can no longer be rolled back.";
      return ok({
        Success: true,
        MoveId: move.Id,
        Message: `Dropped '${move.SourceDatabaseName}'.`,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/get-fleet-capacity$/,
    handle: () => {
      // Measured from the demo store rather than invented, so the page shows the
      // same servers and customers the rest of demo mode does. Sizes are made up,
      // since there is no server to ask.
      const servers: ServerCapacity[] = demoStore.servers.map((server, index) => {
        const databases = demoStore.databases
          .filter((d) => d.DatabaseServerId === server.Id)
          .map((d, i) => ({
            DatabaseId: d.Id,
            DatabaseName: d.DatabaseName,
            CrystalPmId: d.CrystalPmId,
            DataBytes: 900_000_000 + i * 640_000_000,
            IndexBytes: 120_000_000 + i * 40_000_000,
            ApproxRowCount: 1_200_000 + i * 380_000,
            AuthorizedUserCount: 3 + i,
            AuthorizationsLast30Days: 420 + i * 180,
            IsOrphaned: false,
          }));

        const max = 10;
        const used = databases.length;
        const verdict =
          used >= max ? "Full" : used >= max * 0.8 ? "NearCapacity" : "Headroom";

        return {
          DatabaseServerId: server.Id,
          Name: server.Name,
          Engine: index === 1 ? "MariaDb" : "MySql",
          EngineVersion: index === 1 ? "10.11.6" : "8.4.3",
          Status: demoStore.serverStatus(server.Id),
          CustomerDatabaseCount: used,
          MaxCustomerDatabases: max,
          AuthorizedUserCount: databases.reduce((n, d) => n + d.AuthorizedUserCount, 0),
          DataBytes: databases.reduce((n, d) => n + d.DataBytes, 0),
          IndexBytes: databases.reduce((n, d) => n + d.IndexBytes, 0),
          ApproxRowCount: databases.reduce((n, d) => n + d.ApproxRowCount, 0),
          ThreadsConnected: 18 + index * 22,
          MaxConnections: 200,
          Verdict: verdict,
          VerdictReasons: [
            `${used} of ${max} customer databases used.`,
            `${18 + index * 22} of 200 connections in use.`,
          ],
          UnreachableReason: null,
          Databases: databases.sort(
            (a, b) => b.DataBytes + b.IndexBytes - (a.DataBytes + a.IndexBytes),
          ),
        };
      });

      return ok<GetFleetCapacityResponse>({
        Success: true,
        Message: null,
        Servers: servers,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/get-server-capacity-history\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params, search }) => {
      const id = Number(params.id);
      if (!demoStore.servers.some((s) => s.Id === id))
        return notFound(`Database server ${id} does not exist.`);
      const days = Math.min(400, Math.max(1, Number(search.get("days")) || 90));
      return ok<GetServerCapacityHistoryResponse>({
        Success: true,
        Message: null,
        DatabaseServerId: id,
        Days: days,
        Points: demoCapacityHistory(id, days),
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/get-migration-sessions$/,
    handle: () => {
      advanceSessions(demoStore, Date.now());
      return ok<GetMigrationSessionsResponse>({
        Success: true,
        Message: null,
        Sessions: demoStore.migrationSessions,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/get-migration-session\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      advanceSessions(demoStore, Date.now());
      const id = Number(params.id);
      const session = demoStore.migrationSessions.find((m) => m.Id === id);
      if (!session) return notFound(`Migration session ${id} not found`);
      return ok<GetMigrationSessionResponse>({
        Success: true,
        Message: null,
        Session: session,
        Progress: demoStore.migrationProgress[id] ?? [],
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/create-migration-session$/,
    handle: ({ body }) => {
      const req = body as CreateMigrationSessionRequest;
      const refusal = mintRefusal(req);
      if (refusal) return { status: 400, data: { Success: false, Message: refusal } };

      const id = demoStore.migrationSessionIds.next();
      const server = demoStore.servers.find((s) => s.Id === req.DatabaseServerId);
      const database = demoStore.databases.find((d) => d.Id === req.DatabaseId);
      const expires = new Date(
        Date.now() + (req.ExpiresInMinutes ?? 120) * 60_000,
      ).toISOString();

      // A fixed key in demo mode. It is not a secret here and a stable value is
      // easier to talk about when showing somebody the reveal-once modal.
      // Crockford base32, four groups, like a real one: no I, L, O or U.
      const key = "CPM-D3M0-0000-0000-0001";

      const session: MigrationSessionItem = {
        Id: id,
        MigrationKeyPrefix: "D3M0",
        DatabaseServerId: req.DatabaseServerId,
        DatabaseServerName: server?.Name ?? null,
        DatabaseId: req.DatabaseId,
        DatabaseName: database?.DatabaseName ?? null,
        ProvisionDatabaseName: req.DatabaseName,
        // Nothing is created until an installer redeems the key.
        DatabaseCreated: false,
        CrystalPmId: req.CrystalPmId,
        Status: "pending",
        Phase: null,
        CreatedByAdmin: req.CreatedByAdmin,
        CreatedDateTimeUtc: new Date().toISOString(),
        ExpiresDateTimeUtc: expires,
        RedeemedDateTimeUtc: null,
        CompletedDateTimeUtc: null,
        ClientPublicIp: null,
        ClientMachineId: null,
        MigrationUserName: null,
        MigrationUserHost: null,
        LastHeartbeatUtc: null,
        ErrorMessage: null,
      };
      demoStore.migrationSessions = [session, ...demoStore.migrationSessions];

      const elsewhere = demoStore.databases.filter(
        (d) =>
          d.CrystalPmId === req.CrystalPmId &&
          d.DatabaseServerId !== req.DatabaseServerId,
      );
      const target =
        database?.DatabaseName ?? req.DatabaseName ?? "the selected database";

      return ok<CreateMigrationSessionResponse>({
        Success: true,
        Message:
          "Migration key created. It is shown once and cannot be retrieved again.",
        SessionId: id,
        MigrationKey: key,
        MigrationKeyPrefix: "D3M0",
        ExpiresUtc: expires,
        TargetSummary:
          `Customer ${req.CrystalPmId} into '${target}' on server ${req.DatabaseServerId}.` +
          (elsewhere.length > 0
            ? ` Note: this customer already has a database on server ${[
                ...new Set(elsewhere.map((d) => d.DatabaseServerId)),
              ].join(", ")}.`
            : ""),
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/discard-migration-target\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const session = demoStore.migrationSessions.find((m) => m.Id === id);
      if (!session) return notFound(`Migration session ${id} not found`);
      if (!["failed", "revoked", "expired"].includes(session.Status ?? "")) {
        return ok({
          Success: false,
          Message: `This session is ${session.Status}. Only a migration that has finished unsuccessfully can have its target discarded.`,
        });
      }
      if (!session.DatabaseCreated) {
        // Success, as the service answers: there is nothing of this
        // migration's to drop, which is what the operator wanted to be true.
        return ok({
          Success: true,
          Message: session.ProvisionDatabaseName
            ? "Nothing to discard: the key was never redeemed, so no database was created."
            : "Nothing to discard: this migration targeted a database that already existed, which is not this migration's to drop.",
        });
      }
      if (session.DatabaseId === null) {
        // Success, as the service answers: what was asked for is already true.
        return ok({
          Success: true,
          Message:
            "Nothing to discard: this migration's database has already been dropped.",
        });
      }
      // As the service checks it: the registration is read as it is now, and
      // if it has been repointed (another schema, or the same name on another
      // server) it no longer names what this session created.
      const registration = demoStore.databases.find((d) => d.Id === session.DatabaseId);
      if (
        !registration ||
        registration.DatabaseServerId !== session.DatabaseServerId ||
        registration.DatabaseName.toLowerCase() !==
          (session.ProvisionDatabaseName ?? "").toLowerCase()
      )
        return {
          status: 409,
          data: {
            Success: false,
            Message: `The registration of database ${session.DatabaseId} has changed since this session created '${session.ProvisionDatabaseName}' on server ${session.DatabaseServerId}, so it is no longer this migration's to drop.`,
          },
        };
      // A retry minted against this database streams into it. If one succeeded,
      // or is still running, the database is the customer's now.
      const others = demoStore.migrationSessions.filter(
        (m) =>
          m.Id !== session.Id &&
          m.DatabaseId === session.DatabaseId &&
          !["failed", "revoked", "expired"].includes(m.Status ?? ""),
      );
      if (others.length > 0)
        return ok({
          Success: false,
          Message: `'${session.DatabaseName}' is also the target of ${others
            .map((m) => `session ${m.Id} (${m.Status})`)
            .join(", ")}, so it is not this migration's to drop.`,
        });
      // Counted as the service counts them, and described in the same words.
      const userMappings = demoStore.authorizedUsers
        .flatMap((u) => u.DatabaseMappings ?? [])
        .filter((m) => m.DatabaseId === session.DatabaseId).length;
      const staticPrivileges = Object.values(demoStore.staticUserPrivileges)
        .flat()
        .filter((p) => p.DatabaseId === session.DatabaseId).length;
      const moves = demoStore.customerMoves.filter(
        (m) => m.DatabaseId === session.DatabaseId,
      ).length;
      const dependents = [
        userMappings > 0 ? `${userMappings} user mapping(s)` : null,
        staticPrivileges > 0 ? `${staticPrivileges} static user privilege(s)` : null,
        moves > 0 ? `${moves} move(s)` : null,
      ].filter((part): part is string => part !== null);
      if (dependents.length > 0)
        return ok({
          Success: false,
          Message: `'${session.DatabaseName}' is in use: ${dependents.join(", ")} refer to it. Remove those first if it really is disposable.`,
        });
      const dropped = session.DatabaseName ?? session.ProvisionDatabaseName;
      demoStore.databases = demoStore.databases.filter(
        (d) => d.Id !== session.DatabaseId,
      );
      session.DatabaseId = null;
      session.DatabaseName = null;
      return ok({
        Success: true,
        Message: `Dropped '${dropped}'. Mint a new key to try again.`,
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/revoke-migration-session\/(\d+)$/,
    paramNames: ["id"],
    handle: ({ params }) => {
      const id = Number(params.id);
      const session = demoStore.migrationSessions.find((m) => m.Id === id);
      if (!session) return notFound(`Migration session ${id} not found`);
      if (!["pending", "redeemed", "streaming"].includes(session.Status ?? "")) {
        return ok({
          Success: false,
          Message: `This session is already ${session.Status} and cannot be revoked.`,
        });
      }
      session.Status = "revoked";
      session.CompletedDateTimeUtc = new Date().toISOString();
      return ok({
        Success: true,
        Message: session.MigrationUserName
          ? "Migration key revoked. The installer's database login was dropped and its connections ended, so the stream has stopped. Whatever it had already written is still in the target."
          : "Migration key revoked.",
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/probe-database-server$/,
    handle: ({ body }) => {
      const req = body as ProbeDatabaseServerRequest;
      // Demo mode has no server to reach, so the probe answers from the shape of
      // the request. A host mentioning "maria" comes back as MariaDB purely so
      // the two-engine rendering can be exercised without one.
      const isMariaDb = /maria/i.test(req.Host ?? "");
      // Likewise a host mentioning "noprocess" answers as a login without
      // PROCESS, so the rejection can be seen without a real server.
      const canSeeConnections = !/noprocess/i.test(req.Host ?? "");
      const engine = isMariaDb ? "MariaDb" : "MySql";
      const version = isMariaDb ? "10.11.6" : "8.4.3";
      return ok<ProbeDatabaseServerResponse>({
        Success: true,
        Message: canSeeConnections
          ? `${engine} ${version} is supported and this login can provision.`
          : "This server cannot be registered: the login cannot see other logins' connections (PROCESS).",
        Engine: engine,
        EngineVersion: version,
        RawVersion: isMariaDb ? `5.5.5-${version}-MariaDB-log` : version,
        MeetsMinimumVersion: true,
        TlsInUse: true,
        CanCreateDatabase: true,
        CanCreateUser: true,
        CanGrant: true,
        CanSeeConnections: canSeeConnections,
        IsSupported: canSeeConnections,
        Checks: [
          {
            Name: "connect",
            Passed: true,
            Detail: `Connected to ${req.Host}:${req.Port ?? "3306"}.`,
          },
          {
            Name: "engine",
            Passed: true,
            Detail: `Detected ${engine} from the server itself.`,
          },
          {
            Name: "version",
            Passed: true,
            Detail: `${engine} ${version} meets the ${isMariaDb ? "10.6" : "8.0"} minimum.`,
          },
          {
            Name: "tls",
            Passed: true,
            Detail: "TLS negotiated (TLS_AES_256_GCM_SHA384).",
          },
          {
            Name: "privileges.create-database",
            Passed: true,
            Detail: "Login can create databases.",
          },
          {
            Name: "privileges.create-user",
            Passed: true,
            Detail: "Login can create users.",
          },
          {
            Name: "privileges.grant-option",
            Passed: true,
            Detail: "Login holds GRANT OPTION.",
          },
          {
            Name: "privileges.process",
            Passed: canSeeConnections,
            Detail: canSeeConnections
              ? "Login can see other logins' connections."
              : "Login lacks PROCESS, so it cannot see or end other logins' connections: revoking a migration, ending a session and draining a move would all silently do nothing.",
          },
        ],
      });
    },
  },
  {
    method: "POST",
    pattern: /^\/create-database-server-info$/,
    handle: ({ body }) => {
      const req = body as CreateDatabaseServerInfoRequest;
      // Blank optional fields are stored as NULL, as the service stores them,
      // and a missing admin login defaults to root.
      const blankToNull = (value: string | null | undefined) =>
        value?.trim() ? value : null;
      const next: DatabaseServerInfoItem = {
        Id: demoStore.serverIds.next(),
        Name: req.Name,
        Description: blankToNull(req.Description),
        LocalServerAddress: req.LocalServerAddress,
        RemoteServerAddress: blankToNull(req.RemoteServerAddress)?.trim() ?? null,
        ServerPort: req.ServerPort,
        AdminUserName: req.AdminUserName?.trim() || "root",
        RootUserPassword: req.RootUserPassword,
        Certificate: req.Certificate,
        SecurityGroupId: blankToNull(req.SecurityGroupId),
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

      // Field by field, as the service applies an update: a string that is
      // null, empty or whitespace leaves the stored value alone, and a port only
      // counts when positive. SecurityGroupId alone can be cleared: null leaves
      // it, and an empty string stores null.
      const stored = demoStore.servers[idx];
      const given = (value: string | null | undefined): value is string =>
        value !== null && value !== undefined && value.trim().length > 0;
      const next = { ...stored };
      if (given(req.Name)) next.Name = req.Name;
      if (given(req.Description)) next.Description = req.Description;
      if (given(req.LocalServerAddress))
        next.LocalServerAddress = req.LocalServerAddress;
      if (given(req.RemoteServerAddress))
        next.RemoteServerAddress = req.RemoteServerAddress;
      if (req.ServerPort > 0) next.ServerPort = req.ServerPort;
      if (given(req.RootUserPassword)) next.RootUserPassword = req.RootUserPassword;
      if (given(req.Certificate)) next.Certificate = req.Certificate;
      if (given(req.AdminUserName)) next.AdminUserName = req.AdminUserName.trim();
      if (req.SecurityGroupId !== null && req.SecurityGroupId !== undefined)
        next.SecurityGroupId = req.SecurityGroupId.trim() ? req.SecurityGroupId : null;

      demoStore.servers[idx] = next;
      demoStore.recordAdminEvent(`Updated database server ${next.Name}`);
      return ok({
        Success: true,
        Message: "Database server info updated successfully",
      });
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
    handle: () => {
      // A move that cut over since the last read has repointed a database.
      advanceMoves(demoStore, Date.now());
      return ok({
        Success: true,
        Message: null,
        DatabaseInfoList: demoStore.databases,
      });
    },
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
        Status: "active",
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
        MaxLoginInstances: req.MaxLoginInstances ?? 1,
        DatabaseMappings: req.DatabaseMappings ?? [],
      };
      demoStore.authorizedUsers.push(next);
      demoStore.recordAdminEvent(
        `Created authorized user ${next.Email}`,
        `DatabaseMappings count: ${next.DatabaseMappings.length}`,
      );
      // The service answers with a plain string, not a result object.
      return ok("User created successfully");
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
        // The service writes this on every update, defaulting a missing one to 1.
        MaxLoginInstances: req.MaxLoginInstances ?? 1,
        DatabaseMappings: req.DatabaseMappings,
      };
      demoStore.recordAdminEvent(`Updated authorized user ${req.Email}`);
      // The service answers with a plain string, not a result object.
      return ok("User updated successfully");
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
      // The service answers with a plain string, not a result object.
      return ok("User deleted successfully");
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
      // The service generates the password and ignores any in the request.
      const password = "demo-generated-password";
      const results: CreateStaticDatabaseUserResponse["Servers"] = [];
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
        results.push({
          ServerId: serverEntry.ServerId,
          ServerName: server?.Name ?? null,
          LocalServerAddress: server?.LocalServerAddress ?? null,
          RemoteServerAddress: server?.RemoteServerAddress ?? null,
          ServerPort: server ? String(server.ServerPort) : null,
          UserPassword: password,
          Certificate: server?.Certificate ?? null,
          Databases: serverEntry.Databases.map((d) => {
            const db = demoStore.databases.find((x) => x.Id === d.DatabaseId);
            return {
              DatabaseId: d.DatabaseId,
              DatabaseName: db?.DatabaseName ?? null,
              Description: db?.Description ?? null,
              Privileges: d.Privileges,
              Errors: [],
            };
          }),
          Errors: [],
        });
      }
      demoStore.recordAdminEvent(
        `Created static DB user ${userName}`,
        `Servers: ${results.map((c) => c.ServerName ?? c.ServerId).join(", ")}`,
      );
      const response: CreateStaticDatabaseUserResponse = {
        UserName: userName,
        Message: "Success",
        Servers: results,
      };
      return ok(response);
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
      const servers: UpdateStaticDatabaseUserResponse["Servers"] = [];
      let failed = false;
      for (const serverEntry of req.Servers) {
        // As the service: a server the user is not on updates nothing, and says so.
        const row = all.find((u) => u.DatabaseServerId === serverEntry.ServerId);
        if (!row) {
          failed = true;
          servers.push({
            ServerId: serverEntry.ServerId,
            Databases: [],
            Errors: [
              `Failed to update static database user for server ID: ${serverEntry.ServerId}`,
            ],
          });
          continue;
        }
        if (req.NewDescription) row.Description = req.NewDescription;
        row.LastModifiedDateTimeUtc = new Date().toISOString();
        demoStore.staticUserPrivileges[row.Id] = serverEntry.Databases.map(
          (d): DatabasePrivilegeInfo => ({
            DatabaseId: d.DatabaseId,
            Privileges: d.Privileges,
          }),
        );
        servers.push({
          ServerId: serverEntry.ServerId,
          Databases: serverEntry.Databases.map((d) => ({
            DatabaseId: d.DatabaseId,
            DatabaseName:
              demoStore.databases.find((x) => x.Id === d.DatabaseId)?.DatabaseName ??
              null,
            Privileges: d.Privileges,
            Errors: [],
          })),
          Errors: [],
        });
      }
      demoStore.recordAdminEvent(`Updated static DB user ${req.UserName}`);
      const response: UpdateStaticDatabaseUserResponse = {
        UserName: req.UserName,
        Message: failed ? "Failure" : "Success",
        NewPassword: req.GenerateNewPassword ? "demo-rotated-password" : null,
        Servers: servers,
      };
      return ok(response);
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
    // A copy, as the wire would give. The store is mutated in place by writes
    // and the simulation, and handing out the same objects would let React
    // Query see an old response as equal to a new one and skip the update.
    data:
      typeof result.data === "object" &&
      result.data !== null &&
      !(result.data instanceof Blob)
        ? JSON.parse(JSON.stringify(result.data))
        : result.data,
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
