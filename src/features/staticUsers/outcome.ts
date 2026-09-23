import type {
  CreateStaticDatabaseUserResponse,
  UpdateStaticDatabaseUserResponse,
} from "@/api/types";

/** What happened on one server, with every error the service reported for it or its databases. */
export interface ServerOutcome {
  ServerId: number;
  Failed: boolean;
  Errors: string[];
}

type AnyResponse = CreateStaticDatabaseUserResponse | UpdateStaticDatabaseUserResponse;

/**
 * Per-server outcomes of a create or update. The service answers 200 even when a
 * server or one of its databases failed: it lists the reasons in `Errors` at both
 * levels and sets the top-level `Message` to "Failure". Both are read, so nothing
 * that failed is shown as fine.
 */
export function serverOutcomes(response: AnyResponse): ServerOutcome[] {
  return (response.Servers ?? []).map((server) => {
    const errors = [
      ...(server.Errors ?? []),
      ...(server.Databases ?? []).flatMap((d) => d.Errors ?? []),
    ];
    return { ServerId: server.ServerId, Failed: errors.length > 0, Errors: errors };
  });
}

/** Whether any part of the operation failed. */
export const hasFailures = (response: AnyResponse): boolean =>
  response.Message === "Failure" || serverOutcomes(response).some((o) => o.Failed);

/**
 * The generated password from a create response. The service generates one
 * password and sends it on every server it created the user on.
 */
export const generatedPassword = (
  response: CreateStaticDatabaseUserResponse,
): string | null =>
  (response.Servers ?? []).find((s) => s.UserPassword)?.UserPassword ?? null;
