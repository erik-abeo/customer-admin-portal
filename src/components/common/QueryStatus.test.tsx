import { Button } from "@mantine/core";
import { describe, it } from "vitest";

import { QueryStatus } from "./QueryStatus";
import { ApiError } from "@/api/httpClient";
import { expectNoA11yViolations } from "@/test/axe";
import { renderWithProviders } from "@/test/renderWithProviders";

describe("<QueryStatus> accessibility", () => {
  it("loading state has no a11y violations", async () => {
    const { container } = renderWithProviders(<QueryStatus isLoading error={null} />);
    await expectNoA11yViolations(container);
  });

  it("loading skeleton state has no a11y violations", async () => {
    const { container } = renderWithProviders(
      <QueryStatus isLoading error={null} loadingSkeleton={{ rows: 3, columns: 4 }} />,
    );
    await expectNoA11yViolations(container);
  });

  it("error state with retry has no a11y violations", async () => {
    const { container } = renderWithProviders(
      <QueryStatus
        isLoading={false}
        error={new ApiError("Boom", 500)}
        onRetry={() => undefined}
      />,
    );
    await expectNoA11yViolations(container);
  });

  it("empty state with action has no a11y violations", async () => {
    const { container } = renderWithProviders(
      <QueryStatus
        isLoading={false}
        error={null}
        isEmpty
        emptyMessage="No data yet"
        emptyDescription="Get started by adding your first record."
        emptyAction={<Button>Add first</Button>}
      />,
    );
    await expectNoA11yViolations(container);
  });
});
