import { Button, Group, Select, Stack, TextInput, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  IconDatabase,
  IconFileText,
  IconNotes,
  IconServer2,
} from "@tabler/icons-react";

import type {
  CreateDumpRequest,
  DatabaseInfoItem,
  DatabaseServerInfoItem,
  DumpInfoItem,
  UpdateDumpRequest,
} from "@/api/types";
import { FormSection } from "@/components/common/FormSection";

interface DumpFormProps {
  servers: DatabaseServerInfoItem[];
  databases: DatabaseInfoItem[];
  initial?: DumpInfoItem | null;
  submitting?: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (payload: CreateDumpRequest | UpdateDumpRequest) => void | Promise<void>;
}

interface FormValues {
  name: string;
  description: string;
  filePath: string;
  databaseServerId: string;
  databaseId: string;
}

export function DumpForm({
  servers,
  databases,
  initial,
  submitting,
  submitLabel,
  onCancel,
  onSubmit,
}: DumpFormProps) {
  const isEdit = initial !== null && initial !== undefined;

  const form = useForm<FormValues>({
    initialValues: {
      name: initial?.Name ?? "",
      description: initial?.Description ?? "",
      filePath: initial?.FilePath ?? "",
      databaseServerId: initial ? String(initial.DatabaseServerId) : "",
      databaseId: initial ? String(initial.DatabaseId) : "",
    },
    validate: {
      name: (v) => (v.trim().length === 0 ? "Required" : null),
      filePath: (v) => (v.trim().length === 0 ? "Required" : null),
      databaseServerId: (v) => (v.trim().length === 0 ? "Required" : null),
      databaseId: (v) => (v.trim().length === 0 ? "Required" : null),
    },
  });

  const handle = (values: FormValues) => {
    if (isEdit && initial) {
      const payload: UpdateDumpRequest = {
        Id: initial.Id,
        Name: values.name.trim(),
        Description: values.description.trim() || null,
        FilePath: values.filePath.trim(),
      };
      return onSubmit(payload);
    }
    const payload: CreateDumpRequest = {
      Name: values.name.trim(),
      DatabaseServerId: Number(values.databaseServerId),
      DatabaseId: Number(values.databaseId),
      FilePath: values.filePath.trim(),
      Description: values.description.trim() || null,
    };
    return onSubmit(payload);
  };

  const visibleDatabases = form.values.databaseServerId
    ? databases.filter(
        (d) => String(d.DatabaseServerId) === form.values.databaseServerId,
      )
    : databases;

  return (
    <form onSubmit={form.onSubmit(handle)}>
      <Stack gap="md">
        <FormSection
          title="Identification"
          description="What this dump file is and where it lives on disk."
          icon={IconNotes}
        >
          <Stack gap="sm">
            <TextInput
              label="Name"
              placeholder="cust_42_2026-04-15.sql.gz"
              required
              leftSection={<IconFileText size={14} />}
              {...form.getInputProps("name")}
            />
            <TextInput
              label="File path"
              description="Absolute path on the gateway server, or S3 key."
              placeholder="D:\dumps\cust_42_2026-04-15.sql.gz"
              required
              {...form.getInputProps("filePath")}
            />
            <Textarea
              label="Description"
              placeholder="Optional context (run reason, source environment, etc.)"
              autosize
              minRows={2}
              maxRows={5}
              {...form.getInputProps("description")}
            />
          </Stack>
        </FormSection>

        <FormSection
          title="Target"
          description="The customer database this dump belongs to. Cannot be changed after creation."
          icon={IconDatabase}
        >
          <Stack gap="sm">
            <Select
              label="Database server"
              placeholder="Pick a server"
              required
              disabled={isEdit}
              leftSection={<IconServer2 size={14} />}
              data={servers.map((s) => ({ value: String(s.Id), label: s.Name }))}
              searchable
              {...form.getInputProps("databaseServerId")}
              onChange={(v) => {
                form.setFieldValue("databaseServerId", v ?? "");
                form.setFieldValue("databaseId", "");
              }}
            />
            <Select
              label="Database"
              placeholder={
                form.values.databaseServerId ? "Pick a database" : "Pick a server first"
              }
              required
              disabled={isEdit || !form.values.databaseServerId}
              leftSection={<IconDatabase size={14} />}
              data={visibleDatabases.map((d) => ({
                value: String(d.Id),
                label: d.DatabaseName,
              }))}
              searchable
              {...form.getInputProps("databaseId")}
            />
          </Stack>
        </FormSection>

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
