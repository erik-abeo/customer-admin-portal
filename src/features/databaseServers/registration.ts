import type { DatabaseServerInfoItem, ProbeDatabaseServerResponse } from "@/api/types";

/** The form fields that decide whether the service can reach and administer a server. */
export interface ServerConnectionValues {
  LocalServerAddress: string;
  ServerPort: number;
  AdminUserName: string;
  RootUserPassword: string;
  Certificate: string;
}

/** What a probe of the form would actually connect with. */
export interface EffectiveConnection {
  Host: string;
  Port: string;
  User: string;
  Password: string;
  /** Empty when there is no certificate. */
  CertificatePem: string;
}

/**
 * The connection the server would have if the form were saved now.
 *
 * On edit a blank password or certificate keeps the stored one, because the
 * service skips blank fields on update. The get endpoints return both, so the
 * stored values stand in for blanks here, and a probe tests what will really be
 * used rather than asking the operator to retype a password.
 */
export function effectiveConnection(
  values: ServerConnectionValues,
  initial?: DatabaseServerInfoItem,
): EffectiveConnection {
  return {
    Host: values.LocalServerAddress.trim(),
    Port: String(values.ServerPort),
    User: values.AdminUserName.trim(),
    Password: values.RootUserPassword || initial?.RootUserPassword || "",
    CertificatePem: values.Certificate.trim() || initial?.Certificate?.trim() || "",
  };
}

/**
 * Whether an edit changes anything the service connects with: the address,
 * port, admin login, password or certificate. A name, description or security
 * group change does not.
 */
export function connectionChanged(
  values: ServerConnectionValues,
  initial: DatabaseServerInfoItem,
): boolean {
  const now = effectiveConnection(values, initial);
  return (
    now.Host !== initial.LocalServerAddress.trim() ||
    now.Port !== String(initial.ServerPort) ||
    now.User !== (initial.AdminUserName || "root").trim() ||
    now.Password !== initial.RootUserPassword ||
    now.CertificatePem !== (initial.Certificate ?? "").trim()
  );
}

/**
 * The TLS mode a probe should use. With a certificate, `VerifyCA`, which is what
 * the installer is handed at redemption, so the certificate being registered is
 * the one the probe proves. Without one, `Required`.
 */
export const probeSslMode = (
  connection: EffectiveConnection,
): "VerifyCA" | "Required" => (connection.CertificatePem ? "VerifyCA" : "Required");

/**
 * Whether a server form may be submitted, given the probe result for exactly
 * the connection it would save (null when there is none, or it has changed).
 *
 * A new server is only registered once a probe of it has passed. Everything the
 * portal does with a server afterwards, provisioning, minting keys, measuring
 * capacity, moving customers onto it, needs the service to reach it and
 * administer it, which is what the probe checks, and registering one that fails
 * would only move the failure to the first migration.
 *
 * An edit that changes how the service connects to a server is held to the same
 * probe, but an operator may save it anyway after saying so. The service does
 * not gate updates, and there are legitimate edits a probe fails: a new CA staged
 * before the server's certificate is rotated to it, or the password rotated on a
 * server registered before the version floor. An edit that touches only the
 * name, description or security group has nothing new to prove and is not
 * gated.
 */
export function canSubmitServer(
  isEdit: boolean,
  changesConnection: boolean,
  probeResult: ProbeDatabaseServerResponse | null,
  savingWithoutPassingProbe = false,
): boolean {
  if (isEdit && !changesConnection) return true;
  if (probeResult?.IsSupported === true) return true;
  return isEdit && savingWithoutPassingProbe;
}
