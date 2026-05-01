import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconEdit, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { AuthorizedUserInfoItem } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { ListPagination } from "@/components/common/ListPagination";
import { ListToolbar } from "@/components/common/ListToolbar";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { SortableHeader } from "@/components/common/SortableHeader";
import { AuthorizedUserForm } from "@/features/authorizedUsers/AuthorizedUserForm";
import {
  useAuthorizedUsers,
  useCreateAuthorizedUser,
  useDeleteAuthorizedUser,
  useUpdateAuthorizedUser,
} from "@/features/authorizedUsers/queries";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { useDatabases } from "@/features/databases/queries";
import { downloadCsv, toCsv } from "@/lib/csv";
import { useListTable } from "@/lib/listTable";
import { notifyError, notifySuccess } from "@/lib/notify";

type SortKey = "email" | "host" | "mappings";

const SEARCHABLE = [
  (u: AuthorizedUserInfoItem) => u.Email,
  (u: AuthorizedUserInfoItem) => u.StaticHost,
] as const;

const SORT_KEYS = {
  email: (u: AuthorizedUserInfoItem) => u.Email,
  host: (u: AuthorizedUserInfoItem) => u.StaticHost,
  mappings: (u: AuthorizedUserInfoItem) => u.DatabaseMappings?.length ?? 0,
} as const;

export function AuthorizedUsersPage() {
  const users = useAuthorizedUsers();
  const servers = useDatabaseServers();
  const databases = useDatabases();
  const create = useCreateAuthorizedUser();
  const update = useUpdateAuthorizedUser();
  const remove = useDeleteAuthorizedUser();

  const [createOpened, createCtl] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<AuthorizedUserInfoItem | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [hostFilter, setHostFilter] = useState<"all" | "static" | "any">("all");
  const [accessFilter, setAccessFilter] = useState<"all" | "with" | "without">("all");

  // Stable predicate so the hook's filter dependency doesn't churn each render.
  const filterPredicate = useCallback(
    (u: AuthorizedUserInfoItem) => {
      if (hostFilter === "static" && !u.UseStaticHost) return false;
      if (hostFilter === "any" && u.UseStaticHost) return false;
      const mappingCount = u.DatabaseMappings?.length ?? 0;
      if (accessFilter === "with" && mappingCount === 0) return false;
      if (accessFilter === "without" && mappingCount > 0) return false;
      return true;
    },
    [hostFilter, accessFilter],
  );

  const table = useListTable<AuthorizedUserInfoItem, SortKey>({
    data: users.data,
    searchableFields: SEARCHABLE,
    filter: filterPredicate,
    sortKeys: SORT_KEYS,
    defaultSort: { key: "email", dir: "asc" },
    defaultPageSize: 25,
    initialSearch: searchParams.get("email") ?? "",
  });

  // Keep the URL in sync with the email search so deep links from the
  // Database Detail page survive a refresh.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (table.debouncedSearch.trim().length > 0) {
      next.set("email", table.debouncedSearch.trim());
    } else {
      next.delete("email");
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [table.debouncedSearch, searchParams, setSearchParams]);

  const exportCsv = useCallback(() => {
    const serverNameById = new Map(
      (servers.data ?? []).map((s) => [s.Id, s.Name] as const),
    );
    const databaseNameById = new Map(
      (databases.data ?? []).map((d) => [d.Id, d.DatabaseName] as const),
    );
    const csv = toCsv(
      [
        "User ID",
        "Email",
        "Use static host",
        "Static host",
        "Database access count",
        "Databases",
      ],
      table.filteredRows.map((u) => [
        u.Id,
        u.Email,
        u.UseStaticHost ? "yes" : "no",
        u.StaticHost ?? "",
        u.DatabaseMappings?.length ?? 0,
        (u.DatabaseMappings ?? [])
          .map((m) => {
            const server = serverNameById.get(m.DatabaseServerId);
            const db = databaseNameById.get(m.DatabaseId);
            return `${server ?? `srv#${m.DatabaseServerId}`}/${
              db ?? `db#${m.DatabaseId}`
            }`;
          })
          .join("; "),
      ]),
    );
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadCsv(`authorized-users-${stamp}.csv`, csv);
  }, [table.filteredRows, servers.data, databases.data]);

  const confirmDelete = (user: AuthorizedUserInfoItem) => {
    modals.openConfirmModal({
      title: `Delete ${user.Email}?`,
      centered: true,
      children: (
        <Text size="sm">
          This permanently removes the Supertokens user and all database access
          mappings. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete user", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(user.Id);
          notifySuccess(`Deleted ${user.Email}`);
        } catch (e) {
          notifyError(e, "Failed to delete user");
        }
      },
    });
  };

  const extraFilters = useMemo(
    () => (
      <>
        <Stack gap={4}>
          <Text size="xs" fw={500}>
            Host restriction
          </Text>
          <SegmentedControl
            value={hostFilter}
            onChange={(v) => setHostFilter(v as typeof hostFilter)}
            data={[
              { label: "All", value: "all" },
              { label: "Static only", value: "static" },
              { label: "Any host", value: "any" },
            ]}
            size="xs"
          />
        </Stack>
        <Stack gap={4}>
          <Text size="xs" fw={500}>
            Database access
          </Text>
          <SegmentedControl
            value={accessFilter}
            onChange={(v) => setAccessFilter(v as typeof accessFilter)}
            data={[
              { label: "All", value: "all" },
              { label: "With mappings", value: "with" },
              { label: "Without", value: "without" },
            ]}
            size="xs"
          />
        </Stack>
      </>
    ),
    [hostFilter, accessFilter],
  );

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Access"
        title="Authorized users"
        description="CrystalPM customer logins (managed via Supertokens). Each user can be granted access to one or more databases."
        actions={
          <>
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => void users.refetch()}
                loading={users.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <RequireRole role="admin">
              <Button leftSection={<IconPlus size={16} />} onClick={createCtl.open}>
                Add user
              </Button>
            </RequireRole>
          </>
        }
      />

      <Stack gap="md">
        <ListToolbar
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Email or static host…"
          totalCount={table.totalCount}
          filteredCount={table.filteredCount}
          onExport={exportCsv}
          exportDisabled={table.filteredCount === 0}
          extraFilters={extraFilters}
        />

        <QueryStatus
          isLoading={users.isLoading || servers.isLoading || databases.isLoading}
          error={users.error ?? servers.error ?? databases.error}
          onRetry={() => {
            void users.refetch();
            void servers.refetch();
            void databases.refetch();
          }}
          loadingSkeleton={{
            rows: 8,
            columnWidths: ["48%", "32%", "10%", "60px"],
          }}
          isEmpty={table.filteredCount === 0}
          emptyMessage={
            table.totalCount === 0
              ? "No authorized users yet"
              : "No users match the current filters"
          }
          emptyDescription={
            table.totalCount === 0
              ? "Onboard the first customer login (Supertokens) and grant them database access."
              : "Try adjusting the search or the segmented filters above."
          }
          emptyAction={
            table.totalCount === 0 ? (
              <RequireRole role="admin">
                <Button leftSection={<IconPlus size={16} />} onClick={createCtl.open}>
                  Add your first user
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
                      sortKey="email"
                      sort={table.sort}
                      onSortChange={table.setSort}
                    >
                      Email
                    </SortableHeader>
                    <SortableHeader
                      sortKey="host"
                      sort={table.sort}
                      onSortChange={table.setSort}
                    >
                      Static host
                    </SortableHeader>
                    <SortableHeader
                      sortKey="mappings"
                      sort={table.sort}
                      onSortChange={table.setSort}
                    >
                      Databases
                    </SortableHeader>
                    <Table.Th style={{ width: 100 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {table.rows.map((u) => (
                    <Table.Tr key={u.Id}>
                      <Table.Td>{u.Email}</Table.Td>
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
                          color={
                            (u.DatabaseMappings?.length ?? 0) > 0 ? "crystal" : "gray"
                          }
                        >
                          {u.DatabaseMappings?.length ?? 0}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Edit user">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => setEditTarget(u)}
                                aria-label="Edit"
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </RequireRole>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Delete user">
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                onClick={() => confirmDelete(u)}
                                aria-label="Delete"
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </RequireRole>
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
        title="Add authorized user"
        size="lg"
      >
        <AuthorizedUserForm
          servers={servers.data ?? []}
          databases={databases.data ?? []}
          submitLabel="Create user"
          onCancel={createCtl.close}
          submitting={create.isPending}
          onSubmit={async (payload) => {
            try {
              await create.mutateAsync(
                payload as Parameters<typeof create.mutateAsync>[0],
              );
              notifySuccess("User created");
              createCtl.close();
            } catch (e) {
              notifyError(e, "Failed to create user");
            }
          }}
        />
      </Modal>

      <Modal
        opened={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit ${editTarget.Email}` : "Edit"}
        size="lg"
      >
        {editTarget && (
          <AuthorizedUserForm
            servers={servers.data ?? []}
            databases={databases.data ?? []}
            initial={editTarget}
            submitLabel="Save changes"
            onCancel={() => setEditTarget(null)}
            submitting={update.isPending}
            onSubmit={async (payload) => {
              try {
                await update.mutateAsync(
                  payload as Parameters<typeof update.mutateAsync>[0],
                );
                notifySuccess("User updated");
                setEditTarget(null);
              } catch (e) {
                notifyError(e, "Failed to update user");
              }
            }}
          />
        )}
      </Modal>
    </Container>
  );
}
