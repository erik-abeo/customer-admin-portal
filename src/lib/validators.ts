/**
 * Reusable form validators wired into Mantine `useForm` `validate` maps.
 *
 * Each validator returns either a string (error to display) or `null`
 * (the value passes). They're pure / side-effect free so they're easy
 * to compose:
 *
 *   validate: {
 *     Name: composeValidators(required("Name"), maxLength(100)),
 *   }
 *
 * Why centralize: every list-page Add/Edit modal in the portal needs
 * the same trimming + length + identifier-shape logic. Drift between
 * "this field rejects whitespace" and "this one trims silently" is the
 * #1 source of admin-UX confusion. Pulling these into one module keeps
 * the user-visible copy and the rules consistent.
 */

export type Validator<T> = (value: T) => string | null;

export function composeValidators<T>(...validators: Validator<T>[]): Validator<T> {
  return (value: T) => {
    for (const v of validators) {
      const result = v(value);
      if (result !== null) return result;
    }
    return null;
  };
}

export function required(field: string): Validator<string | null | undefined> {
  return (value) => {
    if (value === null || value === undefined) return `${field} is required`;
    if (typeof value === "string" && value.trim().length === 0) {
      return `${field} is required`;
    }
    return null;
  };
}

export function maxLength(
  max: number,
  field?: string,
): Validator<string | null | undefined> {
  return (value) => {
    if (value === null || value === undefined) return null;
    if (value.length > max) {
      return `${field ?? "Value"} must be ${max} characters or fewer`;
    }
    return null;
  };
}

export function minLength(
  min: number,
  field?: string,
): Validator<string | null | undefined> {
  return (value) => {
    if (value === null || value === undefined) return null;
    if (value.length < min) {
      return `${field ?? "Value"} must be at least ${min} characters`;
    }
    return null;
  };
}

const HOSTNAME_RE =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1?|::|([0-9a-fA-F]{1,4}:){1,7}:|:(:[0-9a-fA-F]{1,4}){1,7}|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2})$/;

/**
 * Accept hostnames (RFC 1123-ish), IPv4, and IPv6 literals. We're
 * deliberately lenient on hostnames because internal DNS often uses
 * dots in unusual positions; the goal is to catch obvious typos like
 * trailing slashes or whitespace, not to validate the whole RFC.
 */
export function hostname(field: string): Validator<string | null | undefined> {
  return (value) => {
    if (!value) return null;
    const v = value.trim();
    if (v.length === 0) return null;
    if (v.length > 253) return `${field} is too long (max 253 characters)`;
    if (IPV4_RE.test(v)) {
      const parts = v.split(".").map((p) => Number.parseInt(p, 10));
      if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
        return `${field} is not a valid IPv4 address`;
      }
      return null;
    }
    if (IPV6_RE.test(v)) return null;
    if (!HOSTNAME_RE.test(v)) {
      return `${field} must be a valid hostname or IP address`;
    }
    return null;
  };
}

/** Practical email regex — not RFC-perfect, deliberately. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function email(field = "Email"): Validator<string | null | undefined> {
  return (value) => {
    if (!value) return null;
    const v = value.trim();
    if (v.length === 0) return null;
    if (v.length > 320) return `${field} is too long`;
    return EMAIL_RE.test(v) ? null : `${field} must be a valid email address`;
  };
}

/**
 * MySQL/MariaDB identifier rules: 1–64 chars, ASCII letters/digits/`_`/`$`.
 * Identifiers can't start with a digit-only sequence; we keep the rule
 * restrictive to match what the backend will actually accept without
 * quoting.
 */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]{0,63}$/;
export function identifier(field: string): Validator<string | null | undefined> {
  return (value) => {
    if (!value) return null;
    const v = value.trim();
    if (v.length === 0) return null;
    if (!IDENTIFIER_RE.test(v)) {
      return `${field} must start with a letter or _ and contain only letters, digits, _, or $ (max 64 chars)`;
    }
    return null;
  };
}

export function port(field = "Port"): Validator<number | string | null | undefined> {
  return (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return `${field} must be a whole number`;
    }
    if (n < 1 || n > 65535) return `${field} must be between 1 and 65535`;
    return null;
  };
}

/** Strength heuristic for new passwords (8+ chars, 3 of 4 character classes). */
export function strongPassword(
  field = "Password",
): Validator<string | null | undefined> {
  return (value) => {
    if (!value) return null;
    if (value.length < 8) return `${field} must be at least 8 characters`;
    let classes = 0;
    if (/[a-z]/.test(value)) classes++;
    if (/[A-Z]/.test(value)) classes++;
    if (/\d/.test(value)) classes++;
    if (/[^A-Za-z0-9]/.test(value)) classes++;
    if (classes < 3) {
      return `${field} must mix three of: lowercase, uppercase, digits, symbols`;
    }
    return null;
  };
}
