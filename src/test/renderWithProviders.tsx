import { MantineProvider } from "@mantine/core";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { theme } from "@/theme";

interface ProvidersProps {
  children: ReactNode;
  initialEntries?: string[];
}

function Providers({ children, initialEntries = ["/"] }: ProvidersProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
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
