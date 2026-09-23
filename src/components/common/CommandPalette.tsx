import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { Spotlight, type SpotlightActionData } from "@mantine/spotlight";
import {
  IconDatabase,
  IconHome,
  IconKey,
  IconList,
  IconLogout,
  IconMoon,
  IconSearch,
  IconServer2,
  IconChartBar,
  IconExchange,
  IconSun,
  IconTransfer,
  IconUsers,
} from "@tabler/icons-react";

import { features } from "@/config/env";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/authContextValue";

/**
 * Cmd/Ctrl+K command palette. Indexes every primary navigation
 * destination plus a few admin-level operations so an operator can
 * hop anywhere in the portal in two keystrokes.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  const isDark = computedScheme === "dark";

  const actions = useMemo<SpotlightActionData[]>(
    () => [
      {
        id: "nav-dashboard",
        label: "Dashboard",
        description: "Overview metrics and recent activity",
        keywords: ["home", "overview"],
        leftSection: <IconHome size={18} stroke={1.7} />,
        onClick: () => navigate("/"),
      },
      {
        id: "nav-database-servers",
        label: "Database servers",
        description: "Registered MariaDB instances",
        keywords: ["servers", "infrastructure", "mariadb"],
        leftSection: <IconServer2 size={18} stroke={1.7} />,
        onClick: () => navigate("/database-servers"),
      },
      {
        id: "nav-databases",
        label: "Databases",
        description: "Customer databases on registered servers",
        keywords: ["customer", "schema", "cpm"],
        leftSection: <IconDatabase size={18} stroke={1.7} />,
        onClick: () => navigate("/databases"),
      },
      {
        id: "nav-authorized-users",
        label: "Authorized users",
        description: "Customer logins and database access mappings",
        keywords: ["customer", "supertokens", "login"],
        leftSection: <IconUsers size={18} stroke={1.7} />,
        onClick: () => navigate("/authorized-users"),
      },
      {
        id: "nav-static-users",
        label: "Static database users",
        description: "Long-lived service accounts",
        keywords: ["service", "privileges", "system"],
        leftSection: <IconKey size={18} stroke={1.7} />,
        onClick: () => navigate("/static-users"),
      },
      {
        id: "nav-event-log",
        label: "Event log",
        description: "Filterable audit and access events (backend pending)",
        keywords: ["audit", "events", "history"],
        leftSection: <IconList size={18} stroke={1.7} />,
        onClick: () => navigate("/event-log"),
      },
      ...(features.migrations
        ? [
            {
              id: "nav-migrations",
              label: "Migrations",
              description: "Mint a key to move a customer onto a remote database",
              keywords: ["migrate", "move", "key", "stream", "onboarding"],
              leftSection: <IconTransfer size={18} stroke={1.7} />,
              onClick: () => navigate("/migrations"),
            },
            {
              id: "nav-capacity",
              label: "Capacity",
              description:
                "How full each server is, and where the next customer should go",
              keywords: ["placement", "capacity", "servers", "headroom", "size"],
              leftSection: <IconChartBar size={18} stroke={1.7} />,
              onClick: () => navigate("/capacity"),
            },
            {
              id: "nav-moves",
              label: "Customer moves",
              description: "Move a customer's database to another server",
              keywords: ["move", "rebalance", "relocate", "transfer", "server"],
              leftSection: <IconExchange size={18} stroke={1.7} />,
              onClick: () => navigate("/moves"),
            },
          ]
        : []),
      {
        id: "toggle-theme",
        label: isDark ? "Switch to light mode" : "Switch to dark mode",
        description: "Toggle the portal's color scheme",
        keywords: ["dark", "light", "theme", "appearance"],
        leftSection: isDark ? (
          <IconSun size={18} stroke={1.7} />
        ) : (
          <IconMoon size={18} stroke={1.7} />
        ),
        onClick: () => setColorScheme(isDark ? "light" : "dark"),
      },
      {
        id: "sign-out",
        label: "Sign out",
        description: "Clear the API key and return to the login page",
        keywords: ["logout", "exit", "leave"],
        leftSection: <IconLogout size={18} stroke={1.7} />,
        onClick: () => signOut(),
      },
    ],
    [isDark, navigate, setColorScheme, signOut],
  );

  return (
    <Spotlight
      actions={actions}
      shortcut={["mod + K", "mod + P"]}
      nothingFound="No matching commands"
      highlightQuery
      searchProps={{
        leftSection: <IconSearch size={18} stroke={1.6} />,
        placeholder: "Jump to anything… (try: users, servers, dark mode)",
      }}
    />
  );
}
