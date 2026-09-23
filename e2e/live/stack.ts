/**
 * The real stack the live suite runs against: the two database containers the
 * API's own integration tests use, an authorization database built from the
 * service's baseline and migrations, and the API itself as a real process.
 *
 * Nothing here can reach production. Every connection string, key and outbound
 * URL the API reads is overridden, exactly as the installer end-to-end script in
 * crystalpm does, and AWS is pointed at credentials that do not exist.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MYSQL_CONTAINER = "cpm-api-mysql84-test";
export const MARIADB_CONTAINER = "cpm-api-mariadb106-test";
export const MYSQL_PORT = 3384;
export const MARIADB_PORT = 3316;
export const DB_PASSWORD =
  process.env.CPM_API_TEST_MARIADB_PASSWORD ?? "CpmApiTest2026";

/** Everything this suite creates starts with this, and nothing else does. */
export const PREFIX = "cpmp_";
export const AUTH_DATABASE = `${PREFIX}portal_e2e_auth`;

/**
 * The crystalpm checkout that holds the API, from CPM_REPO or else a sibling of
 * this repository under either name it is commonly cloned as.
 */
function findRepo(): string {
  if (process.env.CPM_REPO) return path.resolve(process.env.CPM_REPO);
  const parent = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );
  // Only a checkout with the API's test baseline will do: an older clone has the
  // service but not the schema this suite builds from.
  const found = ["crystalpm", "crystalpm6"]
    .map((name) => path.join(parent, name))
    .filter((candidate) =>
      existsSync(
        path.join(
          candidate,
          "tests",
          "ClientRemoteDatabaseAccessAPI.Tests",
          "Database",
          "000_baseline_schema.sql",
        ),
      ),
    );
  if (found.length === 1) return found[0];
  throw new Error(
    found.length === 0
      ? `No crystalpm checkout with the API test baseline was found next to this repository in ${parent}. Set CPM_REPO to its path.`
      : `More than one crystalpm checkout was found next to this repository (${found.join(", ")}). Set CPM_REPO to the one to test against.`,
  );
}

const REPO = findRepo();
const API_PROJECT = path.join(
  REPO,
  "src",
  "RemoteDatabaseAccessAuthorization",
  "ClientRemoteDatabaseAccessAPI",
);
const BASELINE = path.join(
  REPO,
  "tests",
  "ClientRemoteDatabaseAccessAPI.Tests",
  "Database",
  "000_baseline_schema.sql",
);

/**
 * Held for the whole live run, so two runs of this suite cannot interleave.
 * The API's own integration tests do not take it: their setup sweeps test
 * schemas and migration logins on these same containers, so do not run them at
 * the same time as this suite.
 */
const LOCK = path.resolve(
  process.env.CPM_DB_TEST_LOCK ?? path.join(tmpdir(), "cpm-db-test.lock"),
);

function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, {
    encoding: "utf-8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** Runs SQL against one of the containers as root. */
export function sql(container: string, statements: string, database?: string): string {
  const client = container === MARIADB_CONTAINER ? "mariadb" : "mysql";
  const args = [
    "exec",
    "-i",
    container,
    client,
    "-uroot",
    `-p${DB_PASSWORD}`,
    "-N",
    "-B",
  ];
  if (database) args.push(database);
  return run("docker", args, statements);
}

/** Runs SQL against the suite's authorization database. */
export const authSql = (statements: string): string =>
  sql(MARIADB_CONTAINER, statements, AUTH_DATABASE);

export function readCertificate(container: string): string {
  const file =
    container === MARIADB_CONTAINER
      ? "/etc/mysql/tls/server-cert.pem"
      : "/var/lib/mysql/ca.pem";
  return run("docker", ["exec", container, "cat", file]).replace(/\r\n/g, "\n");
}

async function acquireLock(): Promise<void> {
  const deadline = Date.now() + 30 * 60_000;
  for (;;) {
    try {
      mkdirSync(LOCK);
      return;
    } catch {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for the database lock at ${LOCK}.`);
      await new Promise((resolve) => setTimeout(resolve, 20_000));
    }
  }
}

function releaseLock(): void {
  rmSync(LOCK, { recursive: true, force: true });
}

function applyScript(file: string): void {
  const name = path.basename(file);
  run("docker", ["cp", file, `${MARIADB_CONTAINER}:/tmp/${name}`]);
  run("docker", [
    "exec",
    MARIADB_CONTAINER,
    "mariadb",
    "-uroot",
    `-p${DB_PASSWORD}`,
    AUTH_DATABASE,
    "-e",
    `source /tmp/${name}`,
  ]);
}

/** Drops everything a run of this suite can leave on either server. */
function sweep(): void {
  for (const container of [MYSQL_CONTAINER, MARIADB_CONTAINER]) {
    const schemas = sql(
      container,
      `SELECT schema_name FROM information_schema.SCHEMATA WHERE schema_name LIKE '${PREFIX.replace("_", "\\_")}%'`,
    )
      .split(/\r?\n/)
      .filter(Boolean);
    for (const schema of schemas)
      sql(container, `DROP DATABASE IF EXISTS \`${schema}\``);

    // Migration logins this suite's redemptions created. The API's own tests sweep
    // these too; with the lock held, none of theirs can be live.
    const logins = sql(
      container,
      "SELECT CONCAT(user, '@', host) FROM mysql.user WHERE user LIKE 'cpmmig\\_%'",
    )
      .split(/\r?\n/)
      .filter(Boolean);
    for (const login of logins) {
      const [user, host] = login.split("@");
      sql(container, `DROP USER IF EXISTS '${user}'@'${host}'`);
    }
  }
}

function buildAuthDatabase(): void {
  sql(
    MARIADB_CONTAINER,
    `DROP DATABASE IF EXISTS \`${AUTH_DATABASE}\`; CREATE DATABASE \`${AUTH_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  applyScript(BASELINE);
  const migrations = path.join(API_PROJECT, "Database", "Migrations");
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    applyScript(path.join(migrations, file));
  }
}

async function startApi(
  port: number,
  apiKey: string,
): Promise<{ process: ChildProcess; directory: string }> {
  run("dotnet", [
    "build",
    path.join(API_PROJECT, "ClientRemoteDatabaseAccessAPI.csproj"),
    "-c",
    "Debug",
    "--nologo",
    "-v",
    "q",
  ]);

  // Run from a copy, so rebuilding the API while this suite runs is not blocked by
  // this process holding its output open.
  const directory = path.join(
    tmpdir(),
    `cpm-portal-live-api-${randomBytes(4).toString("hex")}`,
  );
  cpSync(path.join(API_PROJECT, "bin", "Debug", "net8.0"), directory, {
    recursive: true,
  });

  const authConnection = `Server=127.0.0.1;Port=${MARIADB_PORT};User ID=root;Password=${DB_PASSWORD};Database=${AUTH_DATABASE};SslMode=Required`;
  const fieldKey = randomBytes(16).toString("hex");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Debug builds skip the production port 443 binding. Everything below
    // overrides appsettings.json, which holds production values.
    ASPNETCORE_ENVIRONMENT: "Development",
    ConnectionStrings__LocalMariaDb: authConnection,
    ConnectionStrings__RemoteMariaDb: authConnection,
    MariaDb__WebFieldEncryptionKey: fieldKey,
    MariaDb__ClientFieldEncryptionKey: fieldKey,
    MariaDb__ServerAddress: "127.0.0.1",
    MariaDb__ServerPort: String(MARIADB_PORT),
    Supertokens__ApiUrl: "http://127.0.0.1:9",
    Supertokens__SymmetricKey: randomBytes(32).toString("hex"),
    "api-key": apiKey,
    AWS_ACCESS_KEY_ID: "AKIAE2ETESTNOTREAL00",
    AWS_SECRET_ACCESS_KEY: "e2e-test-not-a-real-secret",
    AWS_PROFILE: "cpm-portal-live-none",
    AWS_EC2_METADATA_DISABLED: "true",
    AWS__Region: "us-east-1",
  };
  delete env.AWS_SESSION_TOKEN;

  const log = path.join(directory, "api.log");
  const child = spawn(
    "dotnet",
    ["ClientRemoteDatabaseAccessAPI.dll", "--urls", `http://127.0.0.1:${port}`],
    {
      cwd: directory,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const output: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (child.exitCode !== null) {
      writeFileSync(log, output.join(""));
      throw new Error(`The API exited during startup; see ${log}.`);
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/My/get-migration-sessions`,
        {
          headers: { "api-key": apiKey },
        },
      );
      if (response.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      writeFileSync(log, output.join(""));
      throw new Error(`The API did not start answering on port ${port}; see ${log}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  process.on("exit", () => {
    if (child.exitCode === null) child.kill();
  });
  child.on("exit", () => writeFileSync(log, output.join("")));
  return { process: child, directory };
}

/**
 * Brings the stack up and returns what tears it down. The lock is released on
 * every path, including a failure part way up.
 */
export async function startStack(port: number): Promise<() => Promise<void>> {
  await acquireLock();
  let api: { process: ChildProcess; directory: string } | undefined;
  try {
    sweep();
    buildAuthDatabase();

    const apiKey = randomBytes(16).toString("hex");
    api = await startApi(port, apiKey);
    process.env.CPM_LIVE_API_KEY = apiKey;
  } catch (error) {
    api?.process.kill();
    releaseLock();
    throw error;
  }

  const started = api;
  return async () => {
    try {
      if (started.process.exitCode === null) {
        started.process.kill();
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (process.env.CPM_LIVE_KEEP === "1") return;
      sweep();
      if (existsSync(started.directory))
        rmSync(started.directory, { recursive: true, force: true });
    } finally {
      releaseLock();
    }
  };
}
