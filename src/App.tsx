import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/nprogress/styles.css";
import "@mantine/spotlight/styles.css";
import "@/styles/global.css";

import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { NavigationProgress } from "@mantine/nprogress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { lazy, useEffect } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { ApiError } from "@/api/httpClient";
import { AuthProvider } from "@/auth/AuthContext";
import { useAuth } from "@/auth/authContextValue";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { RootErrorBoundary } from "@/components/layout/RootErrorBoundary";
import { env } from "@/config/env";
import { installAuditLog } from "@/lib/auditLog";
import { installAuditSink } from "@/lib/auditSink";
import { MutationProgress } from "@/lib/mutationProgress";
import { initSentry, setSentryUser } from "@/lib/sentry";
import { theme } from "@/theme";

// Initialize Sentry before React renders so any startup error is captured.
// No-op when VITE_SENTRY_DSN isn't set.
initSentry();

const AuthorizedUsersPage = lazy(() =>
  import("@/pages/AuthorizedUsersPage").then((m) => ({
    default: m.AuthorizedUsersPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const DatabaseDetailPage = lazy(() =>
  import("@/pages/DatabaseDetailPage").then((m) => ({
    default: m.DatabaseDetailPage,
  })),
);
const DatabaseServerDetailPage = lazy(() =>
  import("@/pages/DatabaseServerDetailPage").then((m) => ({
    default: m.DatabaseServerDetailPage,
  })),
);
const DatabaseServersPage = lazy(() =>
  import("@/pages/DatabaseServersPage").then((m) => ({
    default: m.DatabaseServersPage,
  })),
);
const DatabasesPage = lazy(() =>
  import("@/pages/DatabasesPage").then((m) => ({ default: m.DatabasesPage })),
);
const DumpsPage = lazy(() =>
  import("@/pages/DumpsPage").then((m) => ({ default: m.DumpsPage })),
);
const EventLogPage = lazy(() =>
  import("@/pages/EventLogPage").then((m) => ({ default: m.EventLogPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);
const StaticUsersPage = lazy(() =>
  import("@/pages/StaticUsersPage").then((m) => ({
    default: m.StaticUsersPage,
  })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundary />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/database-servers", element: <DatabaseServersPage /> },
      {
        path: "/database-servers/:serverId",
        element: <DatabaseServerDetailPage />,
      },
      { path: "/databases", element: <DatabasesPage /> },
      { path: "/databases/:databaseId", element: <DatabaseDetailPage /> },
      { path: "/authorized-users", element: <AuthorizedUsersPage /> },
      { path: "/static-users", element: <StaticUsersPage /> },
      { path: "/dumps", element: <DumpsPage /> },
      { path: "/event-log", element: <EventLogPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function GlobalSignOutOn401() {
  const { adminName, signOut } = useAuth();
  useEffect(() => {
    setSentryUser(adminName);
  }, [adminName]);
  useEffect(() => {
    const errorHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof ApiError && reason.status === 401) {
        signOut();
      }
    };
    window.addEventListener("unhandledrejection", errorHandler);
    return () => window.removeEventListener("unhandledrejection", errorHandler);
  }, [signOut]);
  return null;
}

export function App() {
  useEffect(() => {
    document.title = env.appName;
    installAuditLog();
    installAuditSink();
  }, []);

  return (
    <RootErrorBoundary>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ModalsProvider>
          <NavigationProgress color="crystal" size={2} zIndex={1100} />
          <Notifications position="top-right" />
          <QueryClientProvider client={queryClient}>
            <MutationProgress />
            <AuthProvider>
              <GlobalSignOutOn401 />
              <RouterProvider router={router} />
              {import.meta.env.DEV && (
                <ReactQueryDevtools buttonPosition="bottom-left" />
              )}
            </AuthProvider>
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>
    </RootErrorBoundary>
  );
}
