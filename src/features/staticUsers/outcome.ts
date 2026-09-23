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
 * levels and sets the top-level `Message` to something other than "Success".
 * Both are read, so nothing that failed is shown as fine.
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

/**
 * Whether any part of an operation that went ahead failed. Only "Success"
 * means everything applied; any other value is read as partial, so an older
 * service's "Failure" is still caught. Check {@link refusedOutright} first.
 */
export const hasFailures = (response: AnyResponse): boolean =>
  response.Message !== "Success" || serverOutcomes(response).some((o) => o.Failed);

/**
 * The generated password from a create response. The service generates one
 * password and sends it on every server it created the user on.
 */
export const generatedPassword = (
  response: CreateStaticDatabaseUserResponse,
): string | null =>
  (response.Servers ?? []).find((s) => s.UserPassword)?.UserPassword ?? null;

/**
 * The refusals, when the service refused the whole request, or null when it
 * went ahead.
 *
 * The service checks every requested database before it changes anything, and
 * if any may not be granted it answers `Message` "Refused": nothing is created
 * or changed, and `Servers` lists only the refused databases, each with its
 * reason. Anything else went ahead, fully ("Success") or partly (any other
 * value, including an older service's "Failure").
 */
export function refusedOutright(response: AnyResponse): string[] | null {
  if (response.Message !== "Refused") return null;
  return (response.Servers ?? []).flatMap((s) => [
    ...(s.Errors ?? []),
    ...(s.Databases ?? []).flatMap((d) => d.Errors ?? []),
  ]);
}
