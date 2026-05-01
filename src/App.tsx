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
import { Suspense, lazy, useEffect } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { addResponseListener } from "@/api/httpClient";
import { AuthProvider } from "@/auth/AuthContext";
import { useAuth } from "@/auth/authContextValue";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { PageFallback } from "@/components/common/PageFallback";
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
        // Don't retry client errors — they won't fix themselves on a retry
        // and they cost the user a wait. Use a duck-typed status check so
        // this works for both ApiError and arbitrary thrown shapes.
        const status = (error as { status?: unknown } | null | undefined)?.status ?? 0;
        if (typeof status === "number" && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

// Opt into the React Router v7 future flags so the runtime stops
// emitting the `v7_startTransition` / `v7_relativeSplatPath` warnings.
// Our routes don't use splat-relative resolution, and updates are
// already startTransition-friendly, so behavior is unchanged today and
// the eventual v7 upgrade will be a no-op semantically.
const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

// /login lives outside the protected AppLayout (which has its own Suspense
// boundary around <Outlet />), so it needs its own boundary to avoid a
// blank screen during the lazy chunk fetch on first paint.
const router = createBrowserRouter(
  [
    {
      path: "/login",
      element: (
        <Suspense fallback={<PageFallback />}>
          <LoginPage />
        </Suspense>
      ),
      errorElement: <ErrorBoundary />,
    },
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
  ],
  { future: ROUTER_FUTURE_FLAGS },
);

/**
 * Side-effect component that:
 *   1. Mirrors the signed-in admin name to Sentry.
 *   2. Force-signs the user out on the first 401 from any API call.
 *
 * Mounted inside <AuthProvider> so signOut() is always defined.
 *
 * Implementation notes:
 *   - 401 detection routes through `addResponseListener`, which fires on
 *     every response (success and failure). This is reliable even when
 *     TanStack Query catches the rejection (which is the common case and
 *     why a previous `unhandledrejection` listener never fired).
 *   - We snapshot whether we've already signed out to avoid stampede when
 *     several in-flight requests fail simultaneously after key revocation.
 */
function GlobalSignOutOn401() {
  const { adminName, isAuthenticated, signOut } = useAuth();

  useEffect(() => {
    setSentryUser(adminName);
  }, [adminName]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let signedOut = false;
    const unsubscribe = addResponseListener((event) => {
      if (signedOut) return;
      if (event.status !== 401) return;
      signedOut = true;
      signOut();
    });
    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, signOut]);

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
          <NavigationProgress
            color="crystal"
            size={2}
            zIndex={1100}
            aria-label="Page loading"
          />
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
