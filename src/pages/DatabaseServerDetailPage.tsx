import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import type { DatabaseInfoItem } from "@/api/types";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { DatabaseServerForm } from "@/features/databaseServers/DatabaseServerForm";
import {
  useDatabaseServer,
  useUpdateDatabaseServer,
} from "@/features/databaseServers/queries";
import { DatabaseForm } from "@/features/databases/DatabaseForm";
import {
  useCreateDatabase,
  useDatabases,
  useUpdateDatabase,
} from "@/features/databases/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

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

export function DatabaseServerDetailPage() {
  const { serverId: serverIdParam } = useParams();
  const serverId = serverIdParam ? Number(serverIdParam) : undefined;

  const serverQ = useDatabaseServer(serverId);
  const dbsQ = useDatabases();
  const createDb = useCreateDatabase();
  const updateDb = useUpdateDatabase();
  const updateServer = useUpdateDatabaseServer();

  const [editServerOpened, editServerCtl] = useDisclosure(false);
  const [createDbOpened, createDbCtl] = useDisclosure(false);
  const [editDbTarget, setEditDbTarget] = useState<DatabaseInfoItem | null>(null);

  const databasesOnServer = useMemo(
    () => (dbsQ.data ?? []).filter((d) => d.DatabaseServerId === serverId),
    [dbsQ.data, serverId],
  );

  if (serverId === undefined || Number.isNaN(serverId)) {
    return (
      <Container size="md" py="md">
        <Text c="red">Invalid server id.</Text>
      </Container>
    );
  }

  const server = serverQ.data;

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Database server"
        breadcrumbs={[
          { label: "Database servers", to: "/database-servers" },
          { label: server?.Name ?? `Server #${serverId}` },
        ]}
        title={server?.Name ?? `Server #${serverId}`}
        description={
          server?.Description ?? "MariaDB server registered with the portal."
        }
        actions={
          server && (
            <Button
              variant="default"
              leftSection={<IconEdit size={16} />}
              onClick={editServerCtl.open}
            >
              Edit server
            </Button>
          )
        }
      />

      <Stack gap="lg">
        <QueryStatus isLoading={serverQ.isLoading} error={serverQ.error}>
          {server && (
            <Card>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
                <Fact label="Local address">
                  <Text ff="monospace" size="sm">
                    {server.LocalServerAddress}
                  </Text>
                </Fact>
                <Fact label="Remote address">
                  <Text
                    ff="monospace"
                    size="sm"
                    c={server.RemoteServerAddress ? undefined : "dimmed"}
                  >
                    {server.RemoteServerAddress ?? "—"}
                  </Text>
                </Fact>
                <Fact label="Port">
                  <Badge variant="light" color="crystal">
                    {server.ServerPort}
                  </Badge>
                </Fact>
                <Fact label="SSL certificate">
                  <Badge color={server.Certificate ? "teal" : "gray"} variant="light">
                    {server.Certificate ? "Loaded" : "None"}
                  </Badge>
                </Fact>
              </SimpleGrid>
            </Card>
          )}
        </QueryStatus>

        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Title order={2} style={{ fontSize: 18 }}>
              Databases on this server
            </Title>
            <Text size="sm" c="dimmed">
              Customer databases hosted on{" "}
              <Text span fw={600}>
                {server?.Name ?? "this server"}
              </Text>
              .
            </Text>
          </Stack>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={createDbCtl.open}
            disabled={!server}
          >
            Add database
          </Button>
        </Group>

        <QueryStatus
          isLoading={dbsQ.isLoading}
          error={dbsQ.error}
          isEmpty={databasesOnServer.length === 0}
          emptyMessage="No databases on this server yet"
          emptyDescription="Add the first customer database to make this server useful."
          emptyAction={
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={createDbCtl.open}
              disabled={!server}
            >
              Add database
            </Button>
          }
          onRetry={() => void dbsQ.refetch()}
          loadingSkeleton={{ rows: 4, columns: 4 }}
        >
          <Card padding={0}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>CrystalPM ID</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th style={{ width: 80 }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {databasesOnServer.map((d) => (
                  <Table.Tr key={d.Id}>
                    <Table.Td>
                      <Text ff="monospace" size="sm">
                        {d.DatabaseName}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="crystal">
                        {d.CrystalPmId}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text
                        size="sm"
                        c={d.Description ? undefined : "dimmed"}
                        lineClamp={2}
                      >
                        {d.Description ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Edit database">
                        <ActionIcon
                          variant="subtle"
                          onClick={() => setEditDbTarget(d)}
                          aria-label="Edit"
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </QueryStatus>
      </Stack>

      <Modal
        opened={editServerOpened}
        onClose={editServerCtl.close}
        title="Edit server"
        size="lg"
      >
        {server && (
          <DatabaseServerForm
            initial={server}
            submitLabel="Save changes"
            onCancel={editServerCtl.close}
            submitting={updateServer.isPending}
            onSubmit={async (payload) => {
              try {
                await updateServer.mutateAsync(
                  payload as Parameters<typeof updateServer.mutateAsync>[0],
                );
                notifySuccess("Server updated");
                editServerCtl.close();
              } catch (e) {
                notifyError(e, "Failed to update server");
              }
            }}
          />
        )}
      </Modal>

      <Modal
        opened={createDbOpened}
        onClose={createDbCtl.close}
        title="Add database"
        size="md"
      >
        {server && (
          <DatabaseForm
            servers={[server]}
            defaultServerId={serverId}
            submitLabel="Create database"
            onCancel={createDbCtl.close}
            submitting={createDb.isPending}
            onSubmit={async (payload) => {
              try {
                await createDb.mutateAsync(
                  payload as Parameters<typeof createDb.mutateAsync>[0],
                );
                notifySuccess("Database created");
                createDbCtl.close();
              } catch (e) {
                notifyError(e, "Failed to create database");
              }
            }}
          />
        )}
      </Modal>

      <Modal
        opened={editDbTarget !== null}
        onClose={() => setEditDbTarget(null)}
        title={editDbTarget ? `Edit ${editDbTarget.DatabaseName}` : "Edit"}
        size="md"
      >
        {editDbTarget && server && (
          <DatabaseForm
            servers={[server]}
            initial={editDbTarget}
            submitLabel="Save changes"
            onCancel={() => setEditDbTarget(null)}
            submitting={updateDb.isPending}
            onSubmit={async (payload) => {
              try {
                await updateDb.mutateAsync(
                  payload as Parameters<typeof updateDb.mutateAsync>[0],
                );
                notifySuccess("Database updated");
                setEditDbTarget(null);
              } catch (e) {
                notifyError(e, "Failed to update database");
              }
            }}
          />
        )}
      </Modal>
    </Container>
  );
}
