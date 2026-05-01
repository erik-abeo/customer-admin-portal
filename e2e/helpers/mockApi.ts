import type { Page, Route } from "@playwright/test";

/**
 * Mock the entire backend surface area so E2E tests never depend on a live
 * gateway. Anything not explicitly mocked returns 404 so accidentally
 * un-mocked endpoints fail loudly in test output.
 *
 * Response shapes mirror the C# DTOs declared in src/api/types.ts —
 * note the PascalCase property names, which match the wire format that
 * ASP.NET's default System.Text.Json serializer produces.
 */
export interface MockApiOptions {
  baseUrl?: string;
  /** When true, list endpoints return [] (used to test empty states). */
  empty?: boolean;
  /** Custom dumps to seed the /get-all-dumps response. */
  dumps?: DumpInfoFixture[];
  /** Hook fired when /upload-dump is hit; lets the test capture the request body. */
  onUploadDump?: (request: UploadDumpCapture) => void;
}

export interface DumpInfoFixture {
  Id: number;
  DatabaseServerId: number;
  DatabaseId: number;
  FileName: string;
  Description: string | null;
  SizeBytes: number | null;
  CreatedDateTimeUtc: string;
  LastModifiedDateTimeUtc: string | null;
}

export interface UploadDumpCapture {
  contentType: string | null;
  /** Multipart bodies are heavy; we only surface the size + the field count. */
  bodyBytes: number;
}

const DEFAULT_BASE = "http://api.test";

interface RouteSpec {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path under the controller prefix, e.g. "/get-all-database-server-info". */
  path: string | RegExp;
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
}

export async function installApiMocks(
  page: Page,
  opts: MockApiOptions = {},
): Promise<void> {
  const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const empty = opts.empty ?? false;

  const servers = empty ? [] : sampleServers;
  const databases = empty ? [] : sampleDatabases;
  const users = empty ? [] : sampleUsers;
  const staticUsers = empty ? [] : sampleStaticUsers;
  const dumps = empty ? [] : (opts.dumps ?? []);

  const routes: RouteSpec[] = [
    {
      method: "GET",
      path: "/get-all-database-server-info",
      body: {
        Success: true,
        Message: null,
        DatabaseServerInfoList: servers,
      },
      headers: { "X-Admin-Role": "admin" },
    },
    {
      method: "GET",
      path: "/get-all-database-info",
      body: {
        Success: true,
        Message: null,
        DatabaseInfoList: databases,
      },
    },
    {
      method: "GET",
      path: "/get-users",
      body: {
        Success: true,
        Message: null,
        AuthorizedUserInfoList: users,
      },
    },
    // The static-users list is rendered from per-row records; see
    // src/pages/StaticUsersPage.tsx for the grouping helper.
    {
      method: "GET",
      path: "/get-all-static-database-users",
      body: staticUsers,
    },
    {
      method: "GET",
      path: "/get-all-dumps",
      body: { Success: true, Message: null, Dumps: dumps },
    },
    // Event log shape — empty page is enough to keep the page from
    // showing an error state while exercising the surrounding UI.
    {
      method: "GET",
      path: "/event-log",
      body: { Items: [], Total: 0, Page: 1, PageSize: 50 },
    },
  ];

  await page.route(`${base}/My/**`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/My/, "");
    const method = request.method().toUpperCase() as RouteSpec["method"];

    // Dynamic per-id handlers — look up the requested record from the
    // seeded fixtures so detail pages render real data.
    {
      const serverMatch =
        method === "GET" && path.match(/^\/get-database-server-info\/(\d+)$/);
      if (serverMatch) {
        const id = Number(serverMatch[1]);
        const found = servers.find((s) => s.Id === id);
        if (found) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(found),
          });
          return;
        }
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: "{}",
        });
        return;
      }
    }
    {
      const dbMatch = method === "GET" && path.match(/^\/get-database-info\/(\d+)$/);
      if (dbMatch) {
        const id = Number(dbMatch[1]);
        const found = databases.find((d) => d.Id === id);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            Success: !!found,
            Message: found ? null : `Database ${id} not found`,
            DatabaseInfo: found ?? null,
          }),
        });
        return;
      }
    }

    // Dynamic upload-dump handler — captures the multipart request and
    // returns the contract-spec response (CreateDumpResponse-shaped:
    // Success/Message/Id) so the UI's success path runs.
    if (method === "POST" && path === "/upload-dump") {
      const headers = request.headers();
      const body = request.postDataBuffer();
      opts.onUploadDump?.({
        contentType: headers["content-type"] ?? null,
        bodyBytes: body?.length ?? 0,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Success: true, Message: null, Id: 9999 }),
      });
      return;
    }

    for (const spec of routes) {
      const matches =
        spec.method === method &&
        (typeof spec.path === "string" ? spec.path === path : spec.path.test(path));
      if (matches) {
        await route.fulfill({
          status: spec.status ?? 200,
          contentType: "application/json",
          headers: spec.headers,
          body: JSON.stringify(spec.body),
        });
        return;
      }
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `unmocked ${method} ${path}` }),
    });
  });
}

const sampleServers = [
  {
    Id: 1,
    Name: "us-east-prod-01",
    Description: "Primary US-East shard",
    LocalServerAddress: "10.0.0.10",
    RemoteServerAddress: "remotedb-1.crystalpm.net",
    ServerPort: 3306,
    RootUserPassword: "********",
    Certificate: null,
  },
  {
    Id: 2,
    Name: "us-east-prod-02",
    Description: "Secondary US-East shard",
    LocalServerAddress: "10.0.0.11",
    RemoteServerAddress: "remotedb-2.crystalpm.net",
    ServerPort: 3306,
    RootUserPassword: "********",
    Certificate: null,
  },
];

const sampleDatabases = [
  {
    Id: 100,
    DatabaseServerId: 1,
    DatabaseName: "tenant_acme",
    Description: "Acme Eyecare",
    CrystalPmId: 11111,
  },
  {
    Id: 101,
    DatabaseServerId: 1,
    DatabaseName: "tenant_globex",
    Description: "Globex Optical",
    CrystalPmId: 22222,
  },
];

const sampleUsers = [
  {
    Id: 1001,
    Email: "alice@acme.com",
    UseStaticHost: true,
    StaticHost: "10.0.0.10",
    DatabaseMappings: [{ DatabaseServerId: 1, DatabaseId: 100 }],
  },
  {
    Id: 1002,
    Email: "bob@globex.com",
    UseStaticHost: false,
    StaticHost: null,
    DatabaseMappings: [{ DatabaseServerId: 1, DatabaseId: 101 }],
  },
];

const sampleStaticUsers = [
  {
    Id: 1,
    DatabaseServerId: 1,
    UserName: "static_acme",
    Description: "Acme — read/write",
    CreatedDateTimeUtc: "2026-04-01T00:00:00Z",
    LastModifiedDateTimeUtc: "2026-04-15T00:00:00Z",
  },
];
