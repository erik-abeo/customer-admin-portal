import {
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { useAuthorizedUsersForDatabase } from "@/features/authorizedUsers/queries";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { useDatabases } from "@/features/databases/queries";

interface FactProps {
  label: string;
  children: React.ReactNode;
}

function Fact({ label, children }: FactProps) {
  return (
    <Stack gap={2}>
      <Text
        size="xs"
        c="dimmed"
        fw={600}
        tt="uppercase"
        style={{ letterSpacing: "0.05em" }}
      >
        {label}
      </Text>
      <div style={{ fontSize: 14 }}>{children}</div>
    </Stack>
  );
}

export function DatabaseDetailPage() {
  const { databaseId: databaseIdParam } = useParams();
  const databaseId = databaseIdParam ? Number(databaseIdParam) : undefined;

  const databases = useDatabases();
  const servers = useDatabaseServers();

  const database = useMemo(() => {
    if (databaseId === undefined) return undefined;
    return databases.data?.find((d) => d.Id === databaseId);
  }, [databases.data, databaseId]);

  const server = useMemo(() => {
    if (!database) return undefined;
    return servers.data?.find((s) => s.Id === database.DatabaseServerId);
  }, [database, servers.data]);

  const authorized = useAuthorizedUsersForDatabase(
    database?.DatabaseServerId,
    database?.Id,
  );

  if (databaseId === undefined || Number.isNaN(databaseId)) {
    return (
      <Container size="md" py="md">
        <Text c="red">Invalid database id.</Text>
      </Container>
    );
  }

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Customer database"
        breadcrumbs={[
          { label: "Databases", to: "/databases" },
          { label: database?.DatabaseName ?? `Database #${databaseId}` },
        ]}
        title={
          <Text span ff="monospace" inherit>
            {database?.DatabaseName ?? `Database #${databaseId}`}
          </Text>
        }
        description={
          database?.Description ??
          "Customer database hosted on a registered MariaDB server."
        }
      />

      <Stack gap="lg">
        <QueryStatus
          isLoading={databases.isLoading || servers.isLoading}
          error={databases.error ?? servers.error}
        >
          {database ? (
            <Card>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="lg">
                <Fact label="Server">
                  {server ? (
                    <Anchor component={Link} to={`/database-servers/${server.Id}`}>
                      {server.Name}
                    </Anchor>
                  ) : (
                    <Text span c="dimmed">
                      #{database.DatabaseServerId}
                    </Text>
                  )}
                </Fact>
                <Fact label="CrystalPM ID">
                  <Badge variant="light" color="crystal">
                    {database.CrystalPmId}
                  </Badge>
                </Fact>
                <Fact label="Authorized users">
                  <Badge
                    variant="light"
                    color={(authorized.data?.length ?? 0) > 0 ? "teal" : "gray"}
                  >
                    {authorized.data?.length ?? "—"}
                  </Badge>
                </Fact>
              </SimpleGrid>
            </Card>
          ) : (
            <Text c="dimmed">Database not found.</Text>
          )}
        </QueryStatus>

        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={3} style={{ fontSize: 18 }}>
              Authorized users
            </Title>
            <Text size="sm" c="dimmed">
              Customer logins (Supertokens) granted access to this database.
            </Text>
          </Stack>
        </Group>

        <QueryStatus
          isLoading={authorized.isLoading}
          error={authorized.error}
          isEmpty={(authorized.data ?? []).length === 0}
          emptyMessage="No authorized users for this database yet"
          emptyDescription="Grant access by editing a user on the Authorized users page."
          emptyAction={
            <Button
              variant="default"
              component={Link}
              to="/authorized-users"
              leftSection={<IconUsers size={16} />}
            >
              Open Authorized users
            </Button>
          }
          onRetry={() => void authorized.refetch()}
          loadingSkeleton={{ rows: 4, columns: 3 }}
        >
          <Card padding={0}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Static host</Table.Th>
                  <Table.Th>Other database access</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(authorized.data ?? []).map((u) => {
                  const otherCount = Math.max(0, (u.DatabaseMappings?.length ?? 0) - 1);
                  return (
                    <Table.Tr key={u.Id}>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          to={`/authorized-users?email=${encodeURIComponent(u.Email)}`}
                        >
                          {u.Email}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        {u.UseStaticHost ? (
                          <Text ff="monospace" size="sm">
                            {u.StaticHost ?? "—"}
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            Any
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={otherCount > 0 ? "crystal" : "gray"}
                        >
                          {otherCount} other
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
        </QueryStatus>
      </Stack>
    </Container>
  );
}
