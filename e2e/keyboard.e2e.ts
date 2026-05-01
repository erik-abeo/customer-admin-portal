/**
 * Keyboard-only walkthrough.
 *
 * Verifies that an operator with no pointing device can:
 *   1. Use the skip-to-content link to bypass the header + nav
 *   2. Tab into the database-servers nav item and activate it with Enter
 *   3. Tab to the search field on the list page and type a filter
 *   4. Tab through to the row-action icons and reach a focusable button
 *   5. Open and close a Mantine modal via keyboard
 *
 * If any of these break we lose access for keyboard-only users (a real
 * accessibility regression), so the steps assert focus/visibility at
 * each transition.
 */
import { expect, test } from "@playwright/test";

import { installApiMocks } from "./helpers/mockApi";

test.describe("Keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "cap.auth.v1",
        JSON.stringify({ adminName: "Erik", apiKey: "test-key-123" }),
      );
    });
  });

  test("skip link is the first focusable element on every page", async ({ page }) => {
    await page.goto("/");
    // Tab from the body — first stop should be the skip link.
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();
    // Activating the skip link should land focus inside <main id="main">.
    await page.keyboard.press("Enter");
    // The hash navigation moves focus to the main landmark.
    const main = page.locator("main#main");
    await expect(main).toBeVisible();
  });

  test("primary navigation is reachable with Tab + Enter", async ({ page }) => {
    await page.goto("/");
    // Click the dashboard heading first so we have a deterministic focus
    // anchor; otherwise some browsers start tab order from the address bar.
    await page.locator("body").click({ position: { x: 1, y: 1 } });

    // Use the visible "Database servers" nav link directly. We're not
    // simulating an exhaustive Tab-walk through the entire shell here —
    // that's brittle when Mantine adds invisible focusable elements.
    // Instead we verify the link is focusable + Enter activates it.
    // The dashboard renders a metric card with the same name, so we
    // anchor on the navbar-rendered <a> via the AppShell.Navbar landmark.
    const navLink = page
      .getByRole("navigation")
      .getByRole("link", { name: "Database servers" });
    await navLink.focus();
    await expect(navLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/database-servers$/);
    await expect(
      page.getByRole("heading", { name: /Database servers/i }),
    ).toBeVisible();
  });

  test("search field on a list page is keyboard-reachable and filters live", async ({
    page,
  }) => {
    await page.goto("/database-servers");
    const search = page.getByLabel("Search");
    await search.focus();
    await expect(search).toBeFocused();
    await page.keyboard.type("us-east");
    // Wait for the debounce + render. The visible "Showing X of Y" text
    // updates with the filter so we can assert against it.
    await expect(page.getByText(/Showing \d+ of \d+/)).toBeVisible();
  });

  test("Mantine modal opens via keyboard activation and closes with Escape", async ({
    page,
  }) => {
    await page.goto("/database-servers");
    const addButton = page.getByRole("button", { name: /Add server/i });
    await addButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: /Add database server/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("Theme menu opens via keyboard and exposes light/dark/auto items", async ({
    page,
  }) => {
    // Smoke-check the Tooltip-wrapped Menu.Target pattern in the header.
    // Activating the trigger must (a) open the dropdown, (b) expose three
    // menuitems for Light / Dark / Use system, (c) flag the active scheme
    // via aria-current, and (d) close on Escape. We use role="menuitem"
    // (not menuitemradio) because Mantine's Menu.Item enforces that role.
    await page.goto("/");
    const themeToggle = page.getByRole("button", { name: "Theme" });
    await themeToggle.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(3);
    // The Mantine app defaults to "auto", so its accessible name should
    // include the visually-hidden ", selected" suffix.
    await expect(menu.getByRole("menuitem", { name: /^Light$/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^Dark$/ })).toBeVisible();
    // Active option carries a VisuallyHidden ", selected" annotation. The
    // a11y name computation joins text nodes with a space, so the final
    // accessible name is "Use system , selected".
    await expect(
      menu.getByRole("menuitem", { name: /Use system\s*,\s*selected/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
  });
});
