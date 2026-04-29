import { Button } from "@mantine/core";
import { describe, it } from "vitest";

import { PageHeader } from "./PageHeader";
import { expectNoA11yViolations } from "@/test/axe";
import { renderWithProviders } from "@/test/renderWithProviders";

describe("<PageHeader> accessibility", () => {
  it("has no a11y violations with title + description + actions", async () => {
    const { container } = renderWithProviders(
      <PageHeader
        eyebrow="Section"
        title="Page title"
        description="A short description that explains the page purpose."
        actions={<Button>Add item</Button>}
      />,
    );
    await expectNoA11yViolations(container);
  });

  it("has no a11y violations with breadcrumbs", async () => {
    const { container } = renderWithProviders(
      <PageHeader
        title="Detail"
        breadcrumbs={[{ label: "Parent", to: "/parent" }, { label: "Current" }]}
      />,
    );
    await expectNoA11yViolations(container);
  });
});
