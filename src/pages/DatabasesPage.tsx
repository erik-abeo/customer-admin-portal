import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Select,
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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { DatabaseInfoItem } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { features } from "@/config/env";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { DatabaseForm } from "@/features/databases/DatabaseForm";
import {
  useCreateDatabase,
  useDatabases,
  useDeleteDatabase,
  useUpdateDatabase,
} from "@/features/databases/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

export function DatabasesPage() {
  const dbs = useDatabases();
  const servers = useDatabaseServers();
  const create = useCreateDatabase();
  const update = useUpdateDatabase();
  const remove = useDeleteDatabase();

  const confirmDelete = (db: DatabaseInfoItem) => {
    modals.openConfirmModal({
      title: `Delete ${db.DatabaseName}?`,
      centered: true,
      children: (
        <Text size="sm">
          This permanently removes the database registration. Authorized-user mappings
          to this database will be invalidated. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete database", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(db.Id);
          notifySuccess(`Deleted ${db.DatabaseName}`);
        } catch (e) {
          notifyError(e, "Failed to delete database");
        }
      },
    });
  };

  const [createOpened, createCtl] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<DatabaseInfoItem | null>(null);
  const [serverFilter, setServerFilter] = useState<string | null>(null);

  const serverNameById = useMemo(
    () =>
      Object.fromEntries(
        (servers.data ?? []).map((s) => [s.Id, s.Name] as const),
      ) as Record<number, string>,
    [servers.data],
  );

  const filteredRows = useMemo(() => {
    const all = dbs.data ?? [];
    if (!serverFilter) return all;
    return all.filter((d) => String(d.DatabaseServerId) === serverFilter);
  }, [dbs.data, serverFilter]);

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Inventory"
        title="Databases"
        description="Customer databases hosted on registered MariaDB servers."
        actions={
          <>
            <Select
              placeholder="Filter by server…"
              data={(servers.data ?? []).map((s) => ({
                value: String(s.Id),
                label: s.Name,
              }))}
              value={serverFilter}
              onChange={setServerFilter}
              clearable
              searchable
              w={240}
            />
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => void dbs.refetch()}
                loading={dbs.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <RequireRole role="admin">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={createCtl.open}
                disabled={(servers.data ?? []).length === 0}
              >
                Add database
              </Button>
            </RequireRole>
          </>
        }
      />

      <Stack gap="md">
        <QueryStatus
          isLoading={dbs.isLoading || servers.isLoading}
          error={dbs.error ?? servers.error}
          onRetry={() => {
            void dbs.refetch();
            void servers.refetch();
          }}
          loadingSkeleton={{ rows: 6, columns: 5 }}
          isEmpty={filteredRows.length === 0}
          emptyMessage={
            serverFilter
              ? "No databases on the selected server"
              : "No databases registered yet"
          }
          emptyDescription={
            serverFilter
              ? "Try clearing the filter or pick another server."
              : "Create the first customer database against a registered server."
          }
          emptyAction={
            !serverFilter && (servers.data ?? []).length > 0 ? (
              <RequireRole role="admin">
                <Button leftSection={<IconPlus size={16} />} onClick={createCtl.open}>
                  Add your first database
                </Button>
              </RequireRole>
            ) : undefined
          }
        >
          <Card padding={0}>
            <Table.ScrollContainer minWidth={720}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Server</Table.Th>
                    <Table.Th>CrystalPM ID</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th style={{ width: 110 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredRows.map((d) => (
                    <Table.Tr key={d.Id}>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          to={`/databases/${d.Id}`}
                          ff="monospace"
                          size="sm"
                        >
                          {d.DatabaseName}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        {serverNameById[d.DatabaseServerId] ?? `#${d.DatabaseServerId}`}
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
                        <Group gap={4}>
                          <Tooltip label="View users">
                            <ActionIcon
                              component={Link}
                              to={`/databases/${d.Id}`}
                              variant="subtle"
                              aria-label="View"
                            >
                              <IconEye size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Edit database">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => setEditTarget(d)}
                                aria-label="Edit"
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </RequireRole>
                          {features.deletes && (
                            <RequireRole role="admin" fallback="disable">
                              <Tooltip label="Delete database">
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  onClick={() => confirmDelete(d)}
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
        title="Add database"
        size="md"
      >
        <DatabaseForm
          servers={servers.data ?? []}
          defaultServerId={serverFilter ? Number(serverFilter) : undefined}
          submitLabel="Create database"
          onCancel={createCtl.close}
          submitting={create.isPending}
          onSubmit={async (payload) => {
            try {
              await create.mutateAsync(
                payload as Parameters<typeof create.mutateAsync>[0],
              );
              notifySuccess("Database created");
              createCtl.close();
            } catch (e) {
              notifyError(e, "Failed to create database");
            }
          }}
        />
      </Modal>

      <Modal
        opened={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit ${editTarget.DatabaseName}` : "Edit"}
        size="md"
      >
        {editTarget && (
          <DatabaseForm
            servers={servers.data ?? []}
            initial={editTarget}
            submitLabel="Save changes"
            onCancel={() => setEditTarget(null)}
            submitting={update.isPending}
            onSubmit={async (payload) => {
              try {
                await update.mutateAsync(
                  payload as Parameters<typeof update.mutateAsync>[0],
                );
                notifySuccess("Database updated");
                setEditTarget(null);
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
