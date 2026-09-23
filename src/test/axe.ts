import { type AxeResults, run, type RunOptions } from "axe-core";
import { expect } from "vitest";

/**
 * Run axe-core against the given DOM node and assert no violations.
 *
 * Usage:
 * ```ts
 * import { renderWithProviders } from "@/test/renderWithProviders";
 * import { expectNoA11yViolations } from "@/test/axe";
 *
 * it("has no a11y violations", async () => {
 *   const { container } = renderWithProviders(<MyComponent />);
 *   await expectNoA11yViolations(container);
 * });
 * ```
 */
export async function expectNoA11yViolations(
  node: Element,
  options: RunOptions = {},
): Promise<void> {
  const results: AxeResults = await run(node, {
    // Disable color-contrast checks: happy-dom doesn't compute layout/colors
    // accurately. Contrast is enforced in a real browser by the mocked
    // Playwright suite (e2e/a11y.e2e.ts), in both color schemes.
    rules: {
      "color-contrast": { enabled: false },
      ...(options.rules ?? {}),
    },
    ...options,
  });
  if (results.violations.length === 0) return;
  const summary = results.violations
    .map(
      (v) =>
        `\n  • [${v.id}] ${v.help} (${v.impact})\n    ${v.helpUrl}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `      - ${n.target.join(" ")}\n        ${n.failureSummary}`)
          .join("\n"),
    )
    .join("\n");
  expect.fail(`axe-core found accessibility violations:${summary}`);
}
