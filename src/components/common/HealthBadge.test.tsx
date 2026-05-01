import { describe, it } from "vitest";

import { HealthBadge } from "./HealthBadge";
import { expectNoA11yViolations } from "@/test/axe";
import { renderWithProviders } from "@/test/renderWithProviders";

describe("<HealthBadge> accessibility", () => {
  it.each(["ok", "loading", "error"] as const)(
    "has no a11y violations in '%s' state",
    async (status) => {
      const { container } = renderWithProviders(<HealthBadge status={status} />);
      await expectNoA11yViolations(container);
    },
  );
});
