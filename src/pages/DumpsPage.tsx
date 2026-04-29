import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Container,
  FileButton,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconCloudUpload,
  IconDatabaseImport,
  IconEdit,
  IconLock,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type { DumpInfoItem } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryStatus } from "@/components/common/QueryStatus";
import { features } from "@/config/env";
import { useDatabaseServers } from "@/features/databaseServers/queries";
import { useDatabases } from "@/features/databases/queries";
import { DumpForm } from "@/features/dumps/DumpForm";
import {
  useCreateDump,
  useDeleteDump,
  useDumps,
  useImportDump,
  useUpdateDump,
  useUploadDump,
} from "@/features/dumps/queries";
import { notifyError, notifySuccess } from "@/lib/notify";

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function DumpsPage() {
  if (!features.dumps) {
    return <DumpsPlaceholder />;
  }
  return <DumpsLive />;
}

function DumpsLive() {
  const dumps = useDumps();
  const servers = useDatabaseServers();
  const databases = useDatabases();
  const create = useCreateDump();
  const update = useUpdateDump();
  const remove = useDeleteDump();
  const importMut = useImportDump();
  const upload = useUploadDump();

  const [createOpened, createCtl] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<DumpInfoItem | null>(null);
  const [importTarget, setImportTarget] = useState<DumpInfoItem | null>(null);
  const [importTargetDbId, setImportTargetDbId] = useState<string | null>(null);
  const [importReplace, setImportReplace] = useState(false);

  const serverNameById = useMemo(
    () =>
      Object.fromEntries(
        (servers.data ?? []).map((s) => [s.Id, s.Name] as const),
      ) as Record<number, string>,
    [servers.data],
  );
  const databaseNameById = useMemo(
    () =>
      Object.fromEntries(
        (databases.data ?? []).map((d) => [d.Id, d.DatabaseName] as const),
      ) as Record<number, string>,
    [databases.data],
  );

  const rows = dumps.data ?? [];

  const confirmDelete = (d: DumpInfoItem) => {
    modals.openConfirmModal({
      title: `Delete ${d.Name}?`,
      centered: true,
      children: (
        <Text size="sm">
          This removes the dump entry. The underlying file may also be deleted depending
          on backend configuration. This cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete dump", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(d.Id);
          notifySuccess(`Deleted ${d.Name}`);
        } catch (e) {
          notifyError(e, "Failed to delete dump");
        }
      },
    });
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if ((servers.data ?? []).length === 0 || (databases.data ?? []).length === 0) {
      notifyError(
        new Error("Add at least one database before uploading a dump."),
        "Cannot upload",
      );
      return;
    }
    // Pick the first server/database as a sensible default; backend
    // owners should improve this with a target-selection dialog.
    const firstDb = databases.data![0]!;
    try {
      await upload.mutateAsync({
        file,
        databaseServerId: firstDb.DatabaseServerId,
        databaseId: firstDb.Id,
        description: `Uploaded ${file.name}`,
      });
      notifySuccess(`Uploaded ${file.name}`);
    } catch (e) {
      notifyError(e, "Failed to upload dump");
    }
  };

  const handleImport = async () => {
    if (!importTarget || !importTargetDbId) return;
    try {
      const res = await importMut.mutateAsync({
        DumpId: importTarget.Id,
        TargetDatabaseId: Number(importTargetDbId),
        Replace: importReplace,
      });
      notifySuccess(res.JobId ? `Import queued (job ${res.JobId})` : "Import queued");
      setImportTarget(null);
      setImportTargetDbId(null);
      setImportReplace(false);
    } catch (e) {
      notifyError(e, "Failed to start import");
    }
  };

  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Backups"
        title="Database dumps"
        description="Manage MariaDB dump files used to seed and migrate customer databases."
        actions={
          <>
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => void dumps.refetch()}
                loading={dumps.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <RequireRole role="admin">
              <FileButton onChange={handleUpload} accept=".sql,.gz,.sql.gz,.zip">
                {(props) => (
                  <Button
                    {...props}
                    variant="default"
                    leftSection={<IconCloudUpload size={16} />}
                    loading={upload.isPending}
                  >
                    Upload dump
                  </Button>
                )}
              </FileButton>
            </RequireRole>
            <RequireRole role="admin">
              <Button
                leftSection={<IconDatabaseImport size={16} />}
                onClick={createCtl.open}
                disabled={(servers.data ?? []).length === 0}
              >
                Register dump
              </Button>
            </RequireRole>
          </>
        }
      />

      <Stack gap="md">
        <QueryStatus
          isLoading={dumps.isLoading || servers.isLoading || databases.isLoading}
          error={dumps.error ?? servers.error ?? databases.error}
          onRetry={() => {
            void dumps.refetch();
            void servers.refetch();
            void databases.refetch();
          }}
          loadingSkeleton={{ rows: 6, columns: 6 }}
          isEmpty={rows.length === 0}
          emptyMessage="No dumps registered yet"
          emptyDescription="Register a dump file or upload one to make it available for imports."
          emptyAction={
            <RequireRole role="admin">
              <Button
                leftSection={<IconDatabaseImport size={16} />}
                onClick={createCtl.open}
                disabled={(servers.data ?? []).length === 0}
              >
                Register your first dump
              </Button>
            </RequireRole>
          }
        >
          <Card padding={0}>
            <Table.ScrollContainer minWidth={840}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Database</Table.Th>
                    <Table.Th>Server</Table.Th>
                    <Table.Th>Size</Table.Th>
                    <Table.Th>Created (UTC)</Table.Th>
                    <Table.Th style={{ width: 150 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((d) => (
                    <Table.Tr key={d.Id}>
                      <Table.Td>
                        <Text ff="monospace" size="sm">
                          {d.Name}
                        </Text>
                        {d.Description && (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {d.Description}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {databaseNameById[d.DatabaseId] ?? `db#${d.DatabaseId}`}
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="crystal">
                          {serverNameById[d.DatabaseServerId] ??
                            `srv#${d.DatabaseServerId}`}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{formatBytes(d.SizeBytes)}</Table.Td>
                      <Table.Td>
                        <Text size="xs" ff="monospace">
                          {d.CreatedDateTimeUtc.replace("T", " ").slice(0, 19)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Trigger import">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => {
                                  setImportTarget(d);
                                  setImportTargetDbId(String(d.DatabaseId));
                                }}
                                aria-label="Import"
                              >
                                <IconDatabaseImport size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </RequireRole>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Edit dump">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => setEditTarget(d)}
                                aria-label="Edit"
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </RequireRole>
                          <RequireRole role="admin" fallback="disable">
                            <Tooltip label="Delete dump">
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
        title="Register dump"
        size="md"
      >
        <DumpForm
          servers={servers.data ?? []}
          databases={databases.data ?? []}
          submitLabel="Register"
          submitting={create.isPending}
          onCancel={createCtl.close}
          onSubmit={async (payload) => {
            try {
              await create.mutateAsync(
                payload as Parameters<typeof create.mutateAsync>[0],
              );
              notifySuccess("Dump registered");
              createCtl.close();
            } catch (e) {
              notifyError(e, "Failed to register dump");
            }
          }}
        />
      </Modal>

      <Modal
        opened={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit ${editTarget.Name}` : "Edit"}
        size="md"
      >
        {editTarget && (
          <DumpForm
            servers={servers.data ?? []}
            databases={databases.data ?? []}
            initial={editTarget}
            submitLabel="Save"
            submitting={update.isPending}
            onCancel={() => setEditTarget(null)}
            onSubmit={async (payload) => {
              try {
                await update.mutateAsync(
                  payload as Parameters<typeof update.mutateAsync>[0],
                );
                notifySuccess("Dump updated");
                setEditTarget(null);
              } catch (e) {
                notifyError(e, "Failed to update dump");
              }
            }}
          />
        )}
      </Modal>

      <Modal
        opened={importTarget !== null}
        onClose={() => {
          setImportTarget(null);
          setImportTargetDbId(null);
          setImportReplace(false);
        }}
        title={importTarget ? `Import ${importTarget.Name}` : "Import"}
        size="md"
      >
        {importTarget && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Triggers an import of this dump into the selected target database.
            </Text>
            <Select
              label="Target database"
              placeholder="Choose database"
              data={(databases.data ?? []).map((d) => ({
                value: String(d.Id),
                label: `${d.DatabaseName} (${
                  serverNameById[d.DatabaseServerId] ?? `srv#${d.DatabaseServerId}`
                })`,
              }))}
              value={importTargetDbId}
              onChange={setImportTargetDbId}
              searchable
              required
            />
            <Switch
              label="Drop and recreate the target database before import"
              checked={importReplace}
              onChange={(e) => setImportReplace(e.currentTarget.checked)}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                variant="default"
                onClick={() => {
                  setImportTarget(null);
                  setImportTargetDbId(null);
                  setImportReplace(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                loading={importMut.isPending}
                leftSection={<IconDatabaseImport size={16} />}
                disabled={!importTargetDbId}
              >
                Start import
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}

function DumpsPlaceholder() {
  return (
    <Container size="xl" py="lg" className="app-fade-in">
      <PageHeader
        eyebrow="Backups"
        title={
          <Group gap="xs" align="center">
            <span>Database dumps</span>
            <Badge color="yellow" variant="light" leftSection={<IconLock size={12} />}>
              Disabled
            </Badge>
          </Group>
        }
        description="Manage MariaDB dump files used to seed and migrate customer databases."
      />
      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Alert color="yellow" variant="light" title="Feature disabled">
            <Text size="sm">
              Dumps management is implemented in the UI but disabled by default until
              the backend endpoints land. To enable, set{" "}
              <Code>VITE_FEATURE_DUMPS=true</Code> in your environment and ship the
              endpoints documented in <Anchor href="#">BACKEND-CONTRACT.md</Anchor>{" "}
              under <b>Dumps</b>.
            </Text>
          </Alert>
          <Text size="sm" c="dimmed">
            Required endpoints: <Code>GET /My/get-all-dumps</Code>,{" "}
            <Code>POST /My/create-dump</Code>, <Code>PUT /My/update-dump</Code>,{" "}
            <Code>DELETE /My/delete-dump/&#123;id&#125;</Code>,{" "}
            <Code>POST /My/import-dump</Code>, <Code>POST /My/upload-dump</Code>{" "}
            (multipart).
          </Text>
        </Stack>
      </Paper>
    </Container>
  );
}
