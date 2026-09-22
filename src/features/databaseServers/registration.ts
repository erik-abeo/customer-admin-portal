import type { ProbeDatabaseServerResponse } from "@/api/types";

/**
 * Whether a server form may be submitted, given the probe result for exactly
 * the inputs now in it (null when there is none, or the inputs have changed).
 *
 * A new server is only registered once a probe of what is being registered has
 * passed. Everything the portal does with a server afterwards, provisioning,
 * minting keys, measuring capacity, moving customers onto it, needs the service
 * to reach it and administer it, which is what the probe checks. Registering
 * one that fails would only move the failure to the first migration.
 *
 * Editing is not gated: the stored password is never sent back to the browser,
 * so an edit that changes only the name or description has nothing to probe
 * with.
 */
export function canRegisterServer(
  isEdit: boolean,
  probeResult: ProbeDatabaseServerResponse | null,
): boolean {
  return isEdit || probeResult?.IsSupported === true;
}
