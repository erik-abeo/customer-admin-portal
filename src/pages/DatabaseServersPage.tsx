import {
  ActionIcon,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconEdit,
  IconEye,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DatabaseServerInfoItem } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { features } from "@/config/env";
import { DatabaseServerForm } from "@/features/databaseServers/DatabaseServerForm";
import {
  useCreateDatabaseServer,
  useDatabaseServers,
  useDeleteDatabaseServer,
  useUpdateDatabaseServer,
} from "@/features/databaseServers/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

export function DatabaseServersPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useDatabaseServers();
  const create = useCreateDatabaseServer();
  const update = useUpdateDatabaseServer();
  const remove = useDeleteDatabaseServer();

  const confirmDelete = (server: DatabaseServerInfoItem) => {
    modals.openConfirmModal({
      title: `Delete ${server.Name}?`,
      centered: true,
      children: (
        <Text size="sm">
          This permanently removes the server registration. Existing customer databases
          on this server will become unmanageable. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete server", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(server.Id);
          notifySuccess(`Deleted ${server.Name}`);
        } catch (e) {
          notifyError(e, "Failed to delete server");
        }
      },
    });
  };

  const [createOpened, createCtl] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<DatabaseServerInfoItem | null>(null);

  const rows = data ?? [];

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Infrastructure"
        title="Database servers"
        description="MariaDB servers registered for use by CrystalPM customers."
        actions={
          <>
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => void refetch()}
                loading={isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <RequireRole role="admin">
              <Button leftSection={<IconPlus size={16} />} onClick={createCtl.open}>
                Add server
              </Button>
            </RequireRole>
          </>
        }
      />

      <Stack gap="md">
        <QueryStatus
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          loadingSkeleton={{ rows: 6, columns: 6 }}
          isEmpty={rows.length === 0}
          emptyMessage="No database servers registered yet"
          emptyDescription="Register a MariaDB instance to start onboarding customer databases."
          emptyAction={
            <RequireRole role="admin">
              <Button leftSection={<IconPlus size={16} />} onClick={createCtl.open}>
                Add your first server
              </Button>
            </RequireRole>
          }
        >
          <Card padding={0}>
            <Table.ScrollContainer minWidth={720}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Local address</Table.Th>
                    <Table.Th>Remote address</Table.Th>
                    <Table.Th>Port</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th style={{ width: 110 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((s) => (
                    <Table.Tr key={s.Id}>
                      <Table.Td>{s.Name}</Table.Td>
                      <Table.Td>
                        <Text ff="monospace" size="sm">
                          {s.LocalServerAddress}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          ff="monospace"
                          size="sm"
                          c={s.RemoteServerAddress ? undefined : "dimmed"}
                        >
                          {s.RemoteServerAddress ?? "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>{s.ServerPort}</Table.Td>
                      <Table.Td>
                        <Text
                          size="sm"
                          c={s.Description ? undefined : "dimmed"}
                          lineClamp={2}
                        >
                          {s.Description ?? "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Tooltip label="View databases">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => navigate(`/database-servers/${s.Id}`)}
                              aria-label="View"
                            >
                              <IconEye size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Edit server">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => setEditTarget(s)}
                                aria-label="Edit"
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </RequireRole>
                          {features.deletes && (
                            <RequireRole role="admin" fallback="disable">
                              <Tooltip label="Delete server">
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  onClick={() => confirmDelete(s)}
                                  aria-label="Delete"
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </RequireRole>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </QueryStatus>
      </Stack>

      <Modal
        opened={createOpened}
        onClose={createCtl.close}
        title="Add database server"
        size="lg"
      >
        <DatabaseServerForm
          submitLabel="Create server"
          onCancel={createCtl.close}
          submitting={create.isPending}
          onSubmit={async (payload) => {
            try {
              const res = await create.mutateAsync(
                payload as Parameters<typeof create.mutateAsync>[0],
              );
              notifySuccess(`Server #${res.Id} created`);
              createCtl.close();
            } catch (e) {
              notifyError(e, "Failed to create server");
            }
          }}
        />
      </Modal>

      <Modal
        opened={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit ${editTarget.Name}` : "Edit"}
        size="lg"
      >
        {editTarget && (
          <DatabaseServerForm
            initial={editTarget}
            submitLabel="Save changes"
            onCancel={() => setEditTarget(null)}
            submitting={update.isPending}
            onSubmit={async (payload) => {
              try {
                await update.mutateAsync(
                  payload as Parameters<typeof update.mutateAsync>[0],
                );
                notifySuccess("Server updated");
                setEditTarget(null);
              } catch (e) {
                notifyError(e, "Failed to update server");
              }
            }}
          />
        )}
      </Modal>
    </Container>
  );
}
