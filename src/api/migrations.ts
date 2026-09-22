import { httpClient } from "./httpClient";
import type {
  CreateMigrationSessionRequest,
  CreateMigrationSessionResponse,
  GetMigrationSessionResponse,
  GetMigrationSessionsResponse,
  MigrationSessionItem,
} from "./types";

/**
 * Migration sessions: the keys that move a customer onto a remote database.
 *
 * Only the four portal-facing endpoints live here. `redeem-migration-key`,
 * `migration-session/heartbeat` and `migration-session/complete` are the
 * installer's, and authenticate with the migration key and session token rather
 * than the admin API key, so the portal has no business calling them.
 */
export const migrationsApi = {
  async list(): Promise<MigrationSessionItem[]> {
    const { data } = await httpClient.get<GetMigrationSessionsResponse>(
      "/get-migration-sessions",
    );
    return data.Sessions ?? [];
  },

  async get(id: number): Promise<GetMigrationSessionResponse> {
    const { data } = await httpClient.get<GetMigrationSessionResponse>(
      `/get-migration-session/${id}`,
    );
    return data;
  },

  /**
   * Mints a key. The response carries it exactly once, so the caller must show
   * it before discarding the result.
   */
  async create(
    request: CreateMigrationSessionRequest,
  ): Promise<CreateMigrationSessionResponse> {
    const { data } = await httpClient.post<CreateMigrationSessionResponse>(
      "/create-migration-session",
      request,
    );
    return data;
  },

  /**
   * Drops the destination a failed migration left behind.
   *
   * The backend refuses unless the session finished unsuccessfully *and* created
   * that database itself (`DatabaseCreated`), so a migration aimed at a
   * pre-existing database can never take it down. Destroys data; there is no
   * undo.
   */
  async discardTarget(
    id: number,
  ): Promise<{ Success: boolean; Message: string | null }> {
    const { data } = await httpClient.post<{
      Success: boolean;
      Message: string | null;
    }>(`/discard-migration-target/${id}`);
    return data;
  },

  /**
   * Stops a key working. How a key minted for the wrong customer is undone.
   *
   * For a key already redeemed it also drops the installer's database login and
   * ends its connections, so a running stream stops at once rather than at its
   * next call. What it had written stays in the target.
   */
  async revoke(id: number): Promise<{ Success: boolean; Message: string | null }> {
    const { data } = await httpClient.post<{
      Success: boolean;
      Message: string | null;
    }>(`/revoke-migration-session/${id}`);
    return data;
  },
};
