/** Format a timestamp (ISO string or Date) as a short relative time. */
export function formatRelativeTime(
  input: string | Date,
  now: Date = new Date(),
): string {
  const then = typeof input === "string" ? new Date(input) : input;
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.round(diffMs / 1000);

  if (Number.isNaN(diffSec)) return "";
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: now.getFullYear() === then.getFullYear() ? undefined : "numeric",
  });
}
