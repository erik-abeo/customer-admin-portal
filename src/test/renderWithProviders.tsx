import { MantineProvider } from "@mantine/core";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { theme } from "@/theme";

interface ProvidersProps {
  children: ReactNode;
  initialEntries?: string[];
}

// Opt into the React Router v7 future flags so the runtime stops
// emitting the `v7_startTransition` / `v7_relativeSplatPath` warnings
// against test output. Behavior under these flags matches what we
// already rely on; the upgrade to v7 will be a no-op semantically.
const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function Providers({ children, initialEntries = ["/"] }: ProvidersProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <MemoryRouter initialEntries={initialEntries} future={ROUTER_FUTURE_FLAGS}>
        {children}
      </MemoryRouter>
    </MantineProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & { initialEntries?: string[] } = {},
): RenderResult {
  const { initialEntries, ...rest } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers initialEntries={initialEntries}>{children}</Providers>
    ),
    ...rest,
  });
}
