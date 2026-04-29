import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { spotlight } from "@mantine/spotlight";
import {
  IconChevronDown,
  IconCommand,
  IconDashboard,
  IconDatabase,
  IconFileDatabase,
  IconKey,
  IconList,
  IconLogout,
  IconMoon,
  IconSearch,
  IconServer2,
  IconSun,
  IconUsers,
} from "@tabler/icons-react";
import { Suspense } from "react";
import {
  Outlet,
  NavLink as RouterNavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "@/auth/authContextValue";
import { useRole } from "@/auth/useRole";
import { features } from "@/config/env";
import { Brand } from "@/components/common/Brand";
import { CommandPalette } from "@/components/common/CommandPalette";
import { PageFallback } from "@/components/common/PageFallback";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.1.0";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: IconDashboard },
  { to: "/database-servers", label: "Database servers", icon: IconServer2 },
  { to: "/databases", label: "Databases", icon: IconDatabase },
  { to: "/authorized-users", label: "Authorized users", icon: IconUsers },
  { to: "/static-users", label: "Static DB users", icon: IconKey },
  { to: "/dumps", label: "Dumps", icon: IconFileDatabase },
  { to: "/event-log", label: "Event log", icon: IconList },
] as const;

function initialsOf(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const { adminName, signOut } = useAuth();
  const role = useRole();
  const { setColorScheme } = useMantineColorScheme();
  // Use the *computed* (resolved) color scheme so the toggle label and icon
  // accurately reflect what the user actually sees, even when their stored
  // preference is "auto".
  const computedScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  const isDark = computedScheme === "dark";

  const handleSignOut = () => {
    signOut();
    navigate("/login", { replace: true });
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header className="app-header" withBorder={false}>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Brand height={32} />
          </Group>
          <Group gap="xs">
            <Tooltip label="Open command palette (Ctrl+K / Cmd+K)">
              <UnstyledButton
                onClick={() => spotlight.open()}
                aria-label="Open command palette"
                className="command-palette-trigger"
                visibleFrom="sm"
              >
                <Group gap={8} wrap="nowrap">
                  <IconSearch size={14} stroke={1.6} />
                  <Text size="xs" c="dimmed">
                    Jump to…
                  </Text>
                  <Group gap={2} wrap="nowrap">
                    <kbd className="kbd">
                      <IconCommand size={10} />K
                    </kbd>
                  </Group>
                </Group>
              </UnstyledButton>
            </Tooltip>
            <Tooltip label="Open command palette" hiddenFrom="sm">
              <ActionIcon
                variant="subtle"
                onClick={() => spotlight.open()}
                aria-label="Open command palette"
                hiddenFrom="sm"
              >
                <IconSearch size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
              <ActionIcon
                variant="subtle"
                onClick={() => setColorScheme(isDark ? "light" : "dark")}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>

            {adminName && (
              <Menu shadow="md" width={240} position="bottom-end">
                <Menu.Target>
                  <UnstyledButton aria-label="Account menu">
                    <Group gap="xs">
                      <Avatar size="sm" radius="xl" color="crystal">
                        {initialsOf(adminName)}
                      </Avatar>
                      <Text size="sm" visibleFrom="sm">
                        {adminName}
                      </Text>
                      {features.rbac && (
                        <Badge
                          size="xs"
                          variant="light"
                          color={role === "admin" ? "crystal" : "gray"}
                          visibleFrom="sm"
                        >
                          {role === "admin" ? "Admin" : "Read-only"}
                        </Badge>
                      )}
                      <IconChevronDown size={14} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Signed in as</Menu.Label>
                  <Menu.Item closeMenuOnClick={false} style={{ cursor: "default" }}>
                    <Stack gap={2}>
                      <Text size="sm">{adminName}</Text>
                      {features.rbac && (
                        <Text size="xs" c="dimmed">
                          Role: {role === "admin" ? "Administrator" : "Read-only"}
                        </Text>
                      )}
                    </Stack>
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconLogout size={14} />}
                    onClick={handleSignOut}
                  >
                    Sign out
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" className="app-navbar" withBorder={false}>
        <ScrollArea offsetScrollbars>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            c="dimmed"
            px="sm"
            pt="xs"
            pb={4}
            style={{ letterSpacing: "0.06em" }}
          >
            Manage
          </Text>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                component={RouterNavLink}
                to={to}
                label={label}
                leftSection={<Icon size={18} stroke={1.7} />}
                active={active}
                variant={active ? "light" : "subtle"}
                onClick={close}
              />
            );
          })}
        </ScrollArea>
        <Stack gap={2} mt="auto" px="sm" pt="md" pb="xs">
          <Text size="xs" c="dimmed" fw={600}>
            Customer Admin Portal
          </Text>
          <Text size="xs" c="dimmed">
            v{APP_VERSION} · CrystalPM
          </Text>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main className="app-main">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </AppShell.Main>

      <CommandPalette />
    </AppShell>
  );
}
