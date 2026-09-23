/**
 * Names for Mantine Pagination's arrow controls, which otherwise render as
 * unlabelled icon buttons (WCAG 4.1.2). Pass as `getControlProps`.
 */
const CONTROL_LABELS: Record<string, string> = {
  first: "First page",
  previous: "Previous page",
  next: "Next page",
  last: "Last page",
};

export const paginationControlProps = (control: string) => ({
  "aria-label": CONTROL_LABELS[control] ?? control,
});
