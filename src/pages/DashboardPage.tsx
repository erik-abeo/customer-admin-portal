import {
  Alert,
  Anchor,
  Card,
  Container,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowUpRight,
  IconDatabase,
  IconFileDatabase,
  IconKey,
  IconList,
  IconPlus,
  IconServer2,
  IconUserPlus,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/authContextValue";
import { HealthBadge, type HealthStatus } from "@/components/common/HealthBadge";
import {
  LiveBadge,
  MetricCard,
  PlaceholderMetricCard,
} from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { RecentActivity } from "@/components/common/RecentActivity";
import { env } from "@/config/env";
import { useAuthorizedUsers } from "@/features/authorizedUsers/queries";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { useDatabases } from "@/features/databases/queries";
import { useStaticUsers } from "@/features/staticUsers/queries";

interface ActionTileProps {
  to: string;
  icon: Icon;
  title: string;
  subtitle: string;
}

function ActionTile({ to, icon: Icon, title, subtitle }: ActionTileProps) {
  return (
    <Card
      component={Link}
      to={to}
      className="metric-card"
      style={{ textDecoration: "none", color: "inherit" }}
      padding="md"
    >
      <Group gap="md" wrap="nowrap" align="center">
        <span className="metric-icon" aria-hidden="true">
          <Icon size={20} stroke={1.7} />
        </span>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        </Stack>
        <IconArrowUpRight size={16} stroke={1.6} color="var(--mantine-color-dimmed)" />
      </Group>
    </Card>
  );
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

export function DashboardPage() {
  const { adminName } = useAuth();
  const servers = useDatabaseServers();
  const databases = useDatabases();
  const users = useAuthorizedUsers();
  const statics = useStaticUsers();

  const distinctStaticUserCount = (() => {
    if (!statics.data) return null;
    return new Set(statics.data.map((r) => r.UserName)).size;
  })();

  const queryStatuses = [servers, databases, users, statics];
  const healthStatus: HealthStatus = queryStatuses.some((q) => q.error)
    ? "error"
    : queryStatuses.some((q) => q.isLoading)
      ? "loading"
      : "ok";
  const healthTooltip =
    healthStatus === "error"
      ? "One or more management endpoints failed. Open the affected page to see details."
      : healthStatus === "loading"
        ? "Probing the management API…"
        : `All four management endpoints responded successfully (${env.apiBaseUrl}${env.apiControllerPrefix}).`;

  // Refresh "today" once every 5 minutes so the greeting/date stay accurate
  // for tabs left open across midnight or across a meal break.
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setToday(new Date()), 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow={dateLabel}
        title={
          <>
            {greetingFor(today)}
            {adminName ? `, ${adminName.split(/[\s._-]/)[0]}` : ""}
          </>
        }
        description="A live snapshot of the remote MariaDB infrastructure managed by this portal."
        actions={
          <Group gap="xs">
            <LiveBadge />
            <HealthBadge status={healthStatus} tooltip={healthTooltip} />
          </Group>
        }
      />

      <Stack gap="lg">
        <Stack gap="xs">
          <Text
            size="sm"
            fw={600}
            c="dimmed"
            tt="uppercase"
            style={{ letterSpacing: "0.05em" }}
          >
            Inventory
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
            <MetricCard
              to="/database-servers"
              icon={IconServer2}
              label="Database servers"
              value={servers.data?.length ?? null}
              isLoading={servers.isLoading}
              error={servers.error}
              description="Registered MariaDB instances."
              tone="primary"
            />
            <MetricCard
              to="/databases"
              icon={IconDatabase}
              label="Customer databases"
              value={databases.data?.length ?? null}
              isLoading={databases.isLoading}
              error={databases.error}
              description="Mapped to a CrystalPM ID."
              tone="violet"
            />
            <MetricCard
              to="/authorized-users"
              icon={IconUsers}
              label="Authorized users"
              value={users.data?.length ?? null}
              isLoading={users.isLoading}
              error={users.error}
              description="Customer logins (Supertokens)."
              tone="teal"
            />
            <MetricCard
              to="/static-users"
              icon={IconKey}
              label="Static DB users"
              value={distinctStaticUserCount}
              isLoading={statics.isLoading}
              error={statics.error}
              description="Long-lived service users."
              tone="amber"
            />
          </SimpleGrid>
        </Stack>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack gap="xs">
              <Text
                size="sm"
                fw={600}
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: "0.05em" }}
              >
                Operational visibility
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <PlaceholderMetricCard
                  icon={IconActivity}
                  label="Active sessions"
                  tone="gray"
                  reason="Backend exposes per-user kill, but no list endpoint over database_user_cache yet."
                />
                <PlaceholderMetricCard
                  icon={IconList}
                  label="Recent events"
                  tone="gray"
                  reason="event_log table is populated, but no read endpoint is exposed yet."
                />
              </SimpleGrid>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack gap="xs" h="100%">
              <Text
                size="sm"
                fw={600}
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: "0.05em" }}
              >
                Activity
              </Text>
              <RecentActivity />
            </Stack>
          </Grid.Col>
        </Grid>

        <Stack gap="xs">
          <Text
            size="sm"
            fw={600}
            c="dimmed"
            tt="uppercase"
            style={{ letterSpacing: "0.05em" }}
          >
            Quick actions
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <ActionTile
              to="/database-servers"
              icon={IconPlus}
              title="Register a new database server"
              subtitle="Add a MariaDB instance the portal can manage."
            />
            <ActionTile
              to="/databases"
              icon={IconDatabase}
              title="Add a customer database"
              subtitle="Create a database and map it to a CrystalPM ID."
            />
            <ActionTile
              to="/authorized-users"
              icon={IconUserPlus}
              title="Create an authorized user"
              subtitle="Add a Supertokens user and assign databases."
            />
            <ActionTile
              to="/static-users"
              icon={IconKey}
              title="Create a static database user"
              subtitle="Provision a long-lived service user with privileges."
            />
          </SimpleGrid>
        </Stack>

        <Alert
          icon={<IconAlertTriangle size={18} />}
          color="yellow"
          variant="light"
          radius="md"
          title="Some Phase 1 modules require backend work"
        >
          <Text size="sm">
            <Anchor component={Link} to="/dumps">
              Database Dumps
            </Anchor>{" "}
            and{" "}
            <Anchor component={Link} to="/event-log">
              Event Log Viewer
            </Anchor>{" "}
            are scaffolded with the target UI but await new endpoints on{" "}
            <Text span ff="monospace" size="sm">
              ClientRemoteDatabaseAccessAPI
            </Text>
            . See the README{" "}
            <Text span fs="italic">
              Backend gap
            </Text>{" "}
            section for the full list of required APIs and what each one unlocks.
          </Text>
        </Alert>

        <Group gap="xs" justify="center">
          <IconFileDatabase
            size={14}
            stroke={1.6}
            color="var(--mantine-color-dimmed)"
          />
          <Text size="xs" c="dimmed" ta="center">
            All counts come from live calls to{" "}
            <Title order={6} component="span" ff="monospace">
              get-all-*
            </Title>
            . Numbers refresh on visit and on the Refresh action of each management
            page.
          </Text>
        </Group>
      </Stack>
    </Container>
  );
}
