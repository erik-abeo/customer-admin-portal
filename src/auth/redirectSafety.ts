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
 *   - A backslash or control character anywhere. Browsers strip tabs and
 *     newlines from URLs, so `/<tab>/evil.com` becomes `//evil.com`, and
 *     React Router 6 has open-redirect advisories for backslashes in paths.
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
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return "/";
  return decoded;
}
