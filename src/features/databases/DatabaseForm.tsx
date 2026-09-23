import {
  Alert,
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
import { useState } from "react";
import { IconDatabase, IconHash } from "@tabler/icons-react";

import type {
  CreateDatabaseInfoRequest,
  DatabaseInfoItem,
  DatabaseServerInfoItem,
  UpdateDatabaseInfoRequest,
} from "@/api/types";
import { databasesApi } from "@/api/databases";
import { FormSection } from "@/components/common/FormSection";
import {
  whyDatabaseCannotRelocate,
  whyDatabaseEditIsStale,
} from "@/features/databases/editGuard";
import {
  composeValidators,
  identifier,
  maxLength,
  notClearable,
  required,
} from "@/lib/validators";

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
  const [refusal, setRefusal] = useState<string | null>(null);
  // The service changes a server or name only while the database is active, so
  // outside that only the description and customer id are editable.
  const relocationLocked = initial ? whyDatabaseCannotRelocate(initial.Status) : null;
  const [checking, setChecking] = useState(false);

  const form = useForm<DatabaseFormValues>({
    initialValues: {
      DatabaseServerId:
        initial?.DatabaseServerId ?? defaultServerId ?? servers[0]?.Id ?? null,
      DatabaseName: initial?.DatabaseName ?? "",
      Description: initial?.Description ?? "",
      CrystalPmId: initial?.CrystalPmId ?? "",
    },
    validateInputOnBlur: true,
    validate: {
      DatabaseServerId: (v) => (v == null ? "Server is required" : null),
      DatabaseName: composeValidators(
        required("Database name"),
        identifier("Database name"),
      ),
      Description: composeValidators(
        maxLength(500, "Description"),
        notClearable("Description", initial?.Description),
      ),
      CrystalPmId: (v) => {
        if (v === "" || v === null) return "CrystalPM ID is required";
        const n = Number(v);
        if (!Number.isFinite(n)) return "CrystalPM ID must be a number";
        if (!Number.isInteger(n)) return "CrystalPM ID must be a whole number";
        if (n < 0) return "CrystalPM ID must be 0 or greater";
        return null;
      },
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
      // Re-read first: the form was filled from the row as it was when Edit
      // was clicked, and saving it after a move or another edit would put the
      // old server or name back. The service refuses this too.
      setRefusal(null);
      setChecking(true);
      try {
        const current = await databasesApi.get(initial.Id);
        const stale = whyDatabaseEditIsStale(initial, current.DatabaseInfo, base);
        if (stale) {
          setRefusal(stale);
          return;
        }
      } catch (error) {
        setRefusal(
          `Could not check the database before saving: ${(error as Error).message}`,
        );
        return;
      } finally {
        setChecking(false);
      }
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
            disabled={relocationLocked !== null}
          />
          <TextInput
            label="Database name"
            placeholder="cpm_42"
            required
            disabled={relocationLocked !== null}
            description={
              relocationLocked
                ? `The server and name cannot be changed while this database is ${relocationLocked}.`
                : undefined
            }
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

        {refusal && (
          <Alert color="red" variant="light" role="alert">
            {refusal}
          </Alert>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting || checking}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
