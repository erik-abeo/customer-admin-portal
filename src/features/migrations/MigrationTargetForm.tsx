import {
  Alert,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  IconAlertTriangle,
  IconDatabase,
  IconServer2,
  IconUser,
} from "@tabler/icons-react";

import type {
  CreateMigrationSessionRequest,
  DatabaseInfoItem,
  DatabaseServerInfoItem,
} from "@/api/types";
import { FormSection } from "@/components/common/FormSection";
import {
  DEFAULT_EXPIRY_MINUTES,
  describeTarget,
  isSafeDatabaseName,
  selectServer,
  toCreateRequest,
  visibleDatabases as visibleDatabasesFor,
  type MigrationTargetSelection,
  type TargetMode,
} from "@/features/migrations/migrationTarget";
import { composeValidators, maxLength, required } from "@/lib/validators";

interface MigrationTargetFormProps {
  servers: DatabaseServerInfoItem[];
  databases: DatabaseInfoItem[];
  submitting?: boolean;
  onCancel: () => void;
  /** Receives the request plus the plain-language destination for the confirm step. */
  onSubmit: (request: CreateMigrationSessionRequest, targetDescription: string) => void;
}

/**
 * Picks the destination for a customer's migration.
 *
 * The three behaviours here are carried over from the upload modal removed in
 * `4a24044`, recoverable at `git show c9a9ed1:src/pages/DumpsPage.tsx`: the
 * server must be picked before the database, changing the server clears the
 * database, and the destination is stated back before anything is committed to.
 * They were the safety floor for misrouting a dump, and misrouting a stream is
 * the same mistake with the same consequence.
 */
export function MigrationTargetForm({
  servers,
  databases,
  submitting,
  onCancel,
  onSubmit,
}: MigrationTargetFormProps) {
  const form = useForm<MigrationTargetSelection>({
    initialValues: {
      Mode: "provision",
      DatabaseServerId: "",
      DatabaseId: "",
      DatabaseName: "",
      CrystalPmId: "",
      ExpiresInMinutes: DEFAULT_EXPIRY_MINUTES,
    },
    validateInputOnBlur: true,
    validate: {
      DatabaseServerId: required("Database server"),
      DatabaseId: (value, values) =>
        values.Mode === "existing" && !value ? "Select the target database" : null,
      DatabaseName: (value, values) => {
        if (values.Mode !== "provision") return null;
        const trimmed = value.trim();
        if (trimmed.length === 0) return "Enter a name for the new database";
        if (!isSafeDatabaseName(trimmed)) {
          return "Use letters, digits and underscores, starting with a letter";
        }
        return composeValidators(maxLength(64, "Database name"))(trimmed);
      },
      CrystalPmId: (value) => {
        const parsed = Number(value);
        if (!value && value !== 0) return "Enter the CrystalPM customer id";
        if (!Number.isInteger(parsed) || parsed < 1) return "Must be a positive whole number";
        return null;
      },
    },
  });

  const selectedServerId = form.values.DatabaseServerId;

  // Filtered to the chosen server. Showing the whole fleet and trusting the
  // operator to pick correctly is exactly the mistake this form exists to
  // prevent. See migrationTarget.ts for the rules and their tests.
  const visibleDatabases = visibleDatabasesFor(databases, selectedServerId);

  const submit = form.onSubmit((values) => {
    onSubmit(toCreateRequest(values), describeTarget(values, servers, databases));
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <Alert
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
          title="This key authorises an overwrite"
        >
          <Text size="sm">
            The installer that redeems this key will stream a customer&apos;s database
            into the destination chosen here. The portal does <b>not</b> infer the
            target from anything the installer knows, because streaming one
            customer&apos;s records over another&apos;s is irreversible.
          </Text>
        </Alert>

        <FormSection
          title="Customer"
          description="Which CrystalPM customer is being moved."
          icon={IconUser}
        >
          <NumberInput
            label="CrystalPM customer id"
            placeholder="1042"
            required
            min={1}
            allowDecimal={false}
            w={220}
            {...form.getInputProps("CrystalPmId")}
          />
        </FormSection>

        <FormSection
          title="Destination"
          description="The server first, then the database on it."
          icon={IconServer2}
        >
          <Select
            label="Database server"
            placeholder="Pick a server"
            required
            searchable
            leftSection={<IconServer2 size={14} />}
            data={servers.map((s) => ({ value: String(s.Id), label: s.Name }))}
            value={form.values.DatabaseServerId}
            error={form.errors.DatabaseServerId}
            onChange={(value) => {
              // Delegates so the rule that clears the database lives in one
              // tested place rather than in this handler.
              form.setValues((current) => selectServer(current as MigrationTargetSelection, value));
            }}
          />

          <SegmentedControl
            fullWidth
            value={form.values.Mode}
            onChange={(value) => form.setFieldValue("Mode", value as TargetMode)}
            data={[
              { label: "Create a new database", value: "provision" },
              { label: "Use an existing database", value: "existing" },
            ]}
          />

          {form.values.Mode === "existing" ? (
            <Select
              label="Target database"
              placeholder={selectedServerId ? "Pick a database" : "Pick a server first"}
              required
              searchable
              disabled={!selectedServerId}
              leftSection={<IconDatabase size={14} />}
              data={visibleDatabases.map((d) => ({
                value: String(d.Id),
                label: `${d.DatabaseName}${d.CrystalPmId ? ` (CPM #${d.CrystalPmId})` : ""}`,
              }))}
              {...form.getInputProps("DatabaseId")}
            />
          ) : (
            <TextInput
              label="New database name"
              description="Created on redemption, not now, so an unused key leaves nothing behind."
              placeholder="easyopti_1042"
              required
              leftSection={<IconDatabase size={14} />}
              {...form.getInputProps("DatabaseName")}
            />
          )}

          {form.values.Mode === "existing" &&
            selectedServerId &&
            visibleDatabases.length === 0 && (
              <Text size="xs" c="dimmed">
                No databases are registered on this server yet. Create one instead.
              </Text>
            )}
        </FormSection>

        <FormSection
          title="Key lifetime"
          description="How long the operator has to redeem it before it stops working."
          icon={IconDatabase}
        >
          <NumberInput
            label="Expires in (minutes)"
            min={5}
            max={1440}
            allowDecimal={false}
            w={220}
            {...form.getInputProps("ExpiresInMinutes")}
          />
        </FormSection>

        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Review destination
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
