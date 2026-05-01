/**
 * E2E coverage for the dump-upload confirmation modal.
 *
 * Verifies the regression fix that replaced the silent "first database in
 * the list" target with an explicit picker. Specifically:
 *
 *   1. The upload button opens the modal with the file name in the title.
 *   2. The Upload button is disabled until BOTH the server and the database
 *      are picked.
 *   3. Switching the server clears any previously-selected database.
 *   4. Confirming the upload issues a multipart POST to /My/upload-dump.
 *   5. The notification "Uploaded …" surfaces on success.
 */
import { expect, test } from "@playwright/test";

import {
  installApiMocks,
  type DumpInfoFixture,
  type UploadDumpCapture,
} from "./helpers/mockApi";

const STORAGE_KEY = "cap.auth.v1";

const sampleDump: DumpInfoFixture = {
  Id: 1,
  DatabaseServerId: 1,
  DatabaseId: 100,
  FileName: "existing.sql",
  Description: "Existing dump fixture",
  SizeBytes: 2048,
  CreatedDateTimeUtc: "2026-04-20T00:00:00Z",
  LastModifiedDateTimeUtc: null,
};

test.describe("Dumps — upload modal", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript((key) => {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ adminName: "E2E Admin", apiKey: "e2e-key" }),
      );
    }, STORAGE_KEY);
  });

  test("requires explicit server + database before allowing upload", async ({
    page,
  }) => {
    const captures: UploadDumpCapture[] = [];
    await installApiMocks(page, {
      dumps: [sampleDump],
      onUploadDump: (req) => captures.push(req),
    });

    await page.goto("/dumps");
    await expect(
      page.getByRole("heading", { name: /Database dumps/i, level: 1 }),
    ).toBeVisible();

    // Trigger the file picker. Mantine's FileButton renders a hidden <input
    // type="file"/> that we drive directly with setInputFiles().
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "tenant_acme.sql",
      mimeType: "application/sql",
      buffer: Buffer.from("-- mock dump body\n"),
    });

    const dialog = page.getByRole("dialog", { name: /Upload tenant_acme\.sql/i });
    await expect(dialog).toBeVisible();

    const uploadCta = dialog.getByRole("button", { name: /^Upload$/i });
    await expect(uploadCta).toBeDisabled();

    await dialog.getByLabel(/Database server/i).click();
    await page.getByRole("option", { name: /us-east-prod-01/i }).click();
    // Server picked, database not yet picked.
    await expect(uploadCta).toBeDisabled();

    await dialog.getByLabel(/Target database/i).click();
    await page.getByRole("option", { name: /tenant_acme/i }).click();
    await expect(uploadCta).toBeEnabled();

    // Switching the server back to a different one should clear the
    // database selection so we can never carry a stale (server, db) pair.
    await dialog.getByLabel(/Database server/i).click();
    await page.getByRole("option", { name: /us-east-prod-02/i }).click();
    await expect(uploadCta).toBeDisabled();

    // Re-pick the original server + database and confirm.
    await dialog.getByLabel(/Database server/i).click();
    await page.getByRole("option", { name: /us-east-prod-01/i }).click();
    await dialog.getByLabel(/Target database/i).click();
    await page.getByRole("option", { name: /tenant_acme/i }).click();

    await uploadCta.click();

    // Success notification appears (Mantine renders these as role="alert").
    await expect(page.getByText(/Uploaded tenant_acme\.sql/i)).toBeVisible();
    await expect(dialog).toBeHidden();

    // The mock observed exactly one multipart POST.
    expect(captures).toHaveLength(1);
    expect(captures[0]!.contentType).toMatch(/multipart\/form-data/);
    expect(captures[0]!.bodyBytes).toBeGreaterThan(0);
  });

  test("disables the upload trigger when no database exists", async ({ page }) => {
    await installApiMocks(page, { empty: true });
    await page.goto("/dumps");

    await expect(
      page.getByRole("heading", { name: /Database dumps/i, level: 1 }),
    ).toBeVisible();

    // The upload button is rendered but disabled until at least one
    // database is registered (otherwise the modal would have nothing to
    // pick from).
    const uploadTrigger = page.getByRole("button", { name: /Upload dump/i });
    await expect(uploadTrigger).toBeDisabled();
  });
});
