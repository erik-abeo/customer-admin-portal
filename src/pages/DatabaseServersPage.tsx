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
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DatabaseServerInfoItem } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { ListPagination } from "@/components/common/ListPagination";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { SortableHeader } from "@/components/common/SortableHeader";
import { features } from "@/config/env";
import { DatabaseServerForm } from "@/features/databaseServers/DatabaseServerForm";
import {
  useCreateDatabaseServer,
  useDatabaseServers,
  useDeleteDatabaseServer,
  useUpdateDatabaseServer,
} from "@/features/databaseServers/queries";
import { downloadCsv, toCsv } from "@/lib/csv";
import { useListTable } from "@/lib/listTable";
import { notifyError, notifySuccess } from "@/lib/notify";

type SortKey = "name" | "local" | "remote" | "port";

const SORT_KEYS = {
  name: (s: DatabaseServerInfoItem) => s.Name,
  local: (s: DatabaseServerInfoItem) => s.LocalServerAddress,
  remote: (s: DatabaseServerInfoItem) => s.RemoteServerAddress,
  port: (s: DatabaseServerInfoItem) => s.ServerPort,
} as const;

const SEARCHABLE = [
  (s: DatabaseServerInfoItem) => s.Name,
  (s: DatabaseServerInfoItem) => s.LocalServerAddress,
  (s: DatabaseServerInfoItem) => s.RemoteServerAddress,
  (s: DatabaseServerInfoItem) => s.Description,
] as const;

export function DatabaseServersPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useDatabaseServers();
  const create = useCreateDatabaseServer();
  const update = useUpdateDatabaseServer();
  const remove = useDeleteDatabaseServer();

  const table = useListTable<DatabaseServerInfoItem, SortKey>({
    data,
    searchableFields: SEARCHABLE,
    sortKeys: SORT_KEYS,
    defaultSort: { key: "name", dir: "asc" },
    defaultPageSize: 25,
  });

  const exportCsv = useCallback(() => {
    const csv = toCsv(
      ["Id", "Name", "Local address", "Remote address", "Port", "Description"],
      table.filteredRows.map((s) => [
        s.Id,
        s.Name,
        s.LocalServerAddress,
        s.RemoteServerAddress ?? "",
        s.ServerPort,
        s.Description ?? "",
      ]),
    );
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadCsv(`database-servers-${stamp}.csv`, csv);
  }, [table.filteredRows]);

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
        <ListToolbar
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Name, address, description…"
          totalCount={table.totalCount}
          filteredCount={table.filteredCount}
          onExport={exportCsv}
          exportDisabled={table.filteredCount === 0}
        />

        <QueryStatus
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          loadingSkeleton={{
            rows: 8,
            columnWidths: ["28%", "32%", "32%", "8%", "40%", "60px"],
          }}
          isEmpty={table.filteredCount === 0}
          emptyMessage={
            table.totalCount === 0
              ? "No database servers registered yet"
              : "No servers match the current filters"
          }
          emptyDescription={
            table.totalCount === 0
              ? "Register a MariaDB instance to start onboarding customer databases."
              : "Try adjusting the search above."
          }
          emptyAction={
            table.totalCount === 0 ? (
              <RequireRole role="admin">
                <Button leftSection={<IconPlus size={16} />} onClick={createCtl.open}>
                  Add your first server
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
                    <SortableHeader
                      sortKey="name"
                      sort={table.sort}
                      onSortChange={table.setSort}
                    >
                      Name
                    </SortableHeader>
                    <SortableHeader
                      sortKey="local"
                      sort={table.sort}
                      onSortChange={table.setSort}
                    >
                      Local address
                    </SortableHeader>
                    <SortableHeader
                      sortKey="remote"
                      sort={table.sort}
                      onSortChange={table.setSort}
                    >
                      Remote address
                    </SortableHeader>
                    <SortableHeader
                      sortKey="port"
                      sort={table.sort}
                      onSortChange={table.setSort}
                    >
                      Port
                    </SortableHeader>
                    <Table.Th>Description</Table.Th>
                    <Table.Th style={{ width: 110 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {table.rows.map((s) => (
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

        <ListPagination
          page={table.page}
          pageCount={table.pageCount}
          pageSize={table.pageSize}
          filteredCount={table.filteredCount}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
        />
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
