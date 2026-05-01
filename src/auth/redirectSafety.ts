/**
 * Sanitize the post-login `redirect` query parameter.
 *
 * Accepts only same-origin SPA paths. Specifically rejects:
 *   - Absolute URLs (`http:` / `https:` / etc.) → would jump off-origin.
 *   - Protocol-relative URLs (`//evil.com`)    → browsers + some routers
 *     interpret these as a different origin even though they pass a
 *     naive `startsWith("/")` check.
 *   - Backslash-escaped variants (`/\evil.com`) → some legacy parsers
 *     normalize these to `//evil.com`.
 *   - Malformed percent-encodings.
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (!decoded.startsWith("/")) return "/";
  if (decoded.startsWith("//")) return "/";
  if (decoded.startsWith("/\\")) return "/";
  return decoded;
}
