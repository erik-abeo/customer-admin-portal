import {
  Button,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconDatabase, IconHash } from "@tabler/icons-react";

import type {
  CreateDatabaseInfoRequest,
  DatabaseInfoItem,
  DatabaseServerInfoItem,
  UpdateDatabaseInfoRequest,
} from "@/api/types";
import { FormSection } from "@/components/common/FormSection";

interface DatabaseFormValues {
  DatabaseServerId: number | null;
  DatabaseName: string;
  Description: string;
  CrystalPmId: number | "";
}

interface DatabaseFormProps {
  servers: DatabaseServerInfoItem[];
  initial?: DatabaseInfoItem;
  defaultServerId?: number;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (
    payload: CreateDatabaseInfoRequest | UpdateDatabaseInfoRequest,
  ) => Promise<void> | void;
  submitting?: boolean;
}

export function DatabaseForm({
  servers,
  initial,
  defaultServerId,
  submitLabel,
  onCancel,
  onSubmit,
  submitting,
}: DatabaseFormProps) {
  const form = useForm<DatabaseFormValues>({
    initialValues: {
      DatabaseServerId:
        initial?.DatabaseServerId ?? defaultServerId ?? servers[0]?.Id ?? null,
      DatabaseName: initial?.DatabaseName ?? "",
      Description: initial?.Description ?? "",
      CrystalPmId: initial?.CrystalPmId ?? "",
    },
    validate: {
      DatabaseServerId: (v) => (v == null ? "Server is required" : null),
      DatabaseName: (v) => (v.trim().length === 0 ? "Database name is required" : null),
      CrystalPmId: (v) =>
        v === "" || Number.isNaN(Number(v)) ? "CrystalPM ID is required" : null,
    },
  });

  const submit = form.onSubmit(async (values) => {
    const base = {
      DatabaseServerId: values.DatabaseServerId as number,
      DatabaseName: values.DatabaseName.trim(),
      Description: values.Description.trim() || null,
      CrystalPmId: Number(values.CrystalPmId),
    };
    if (initial) {
      const payload: UpdateDatabaseInfoRequest = { Id: initial.Id, ...base };
      await onSubmit(payload);
    } else {
      const payload: CreateDatabaseInfoRequest = base;
      await onSubmit(payload);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <FormSection
          title="Database"
          description="Where the database lives and the schema name to create."
          icon={IconDatabase}
        >
          <Select
            label="Database server"
            description="The MariaDB instance that will host this database."
            required
            data={servers.map((s) => ({
              value: String(s.Id),
              label: `${s.Name} (${s.LocalServerAddress}:${s.ServerPort})`,
            }))}
            value={
              form.values.DatabaseServerId !== null
                ? String(form.values.DatabaseServerId)
                : null
            }
            onChange={(v) =>
              form.setFieldValue("DatabaseServerId", v === null ? null : Number(v))
            }
            error={form.errors.DatabaseServerId as string | undefined}
            searchable
          />
          <TextInput
            label="Database name"
            placeholder="cpm_42"
            required
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            {...form.getInputProps("DatabaseName")}
          />
          <Textarea
            label="Description"
            placeholder="Customer Acme Optical, primary"
            autosize
            minRows={2}
            {...form.getInputProps("Description")}
          />
        </FormSection>

        <Divider />

        <FormSection
          title="CrystalPM linkage"
          description="The numeric customer identifier used inside the CrystalPM client."
          icon={IconHash}
        >
          <NumberInput
            label="CrystalPM ID"
            placeholder="42"
            required
            min={0}
            w={200}
            {...form.getInputProps("CrystalPmId")}
          />
        </FormSection>

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onCancel} disabled={submitting}>
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
