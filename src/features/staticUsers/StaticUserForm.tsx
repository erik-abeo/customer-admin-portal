import {
  Alert,
  Button,
  Divider,
  Group,
  List,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconKey, IconShieldCheck, IconUser } from "@tabler/icons-react";

import type {
  CreateStaticDatabaseUserRequest,
  DatabaseInfoItem,
  DatabaseServerInfoItem,
  DatabaseServerPrivilegeInfo,
  GetStaticDatabaseUserDetailResponse,
  UpdateStaticDatabaseUserRequest,
} from "@/api/types";
import { FormSection } from "@/components/common/FormSection";
import { composeValidators, maxLength, notClearable } from "@/lib/validators";

import { PrivilegesEditor } from "./PrivilegesEditor";
import { whyPrivilegesIncomplete, withoutGrantOption } from "./privileges";

interface StaticUserFormValues {
  GenerateNewPassword: boolean;
  Description: string;
  Servers: DatabaseServerPrivilegeInfo[];
}

interface StaticUserFormProps {
  servers: DatabaseServerInfoItem[];
  databases: DatabaseInfoItem[];
  initial?: GetStaticDatabaseUserDetailResponse;
  initialServers?: DatabaseServerPrivilegeInfo[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (
    payload: CreateStaticDatabaseUserRequest | UpdateStaticDatabaseUserRequest,
  ) => Promise<void> | void;
  submitting?: boolean;
  /**
   * Why the service refused the last submit outright, shown in the form so the
   * operator can fix it without re-entering anything.
   */
  refusal?: { title: string; reasons: string[] } | null;
}

export function StaticUserForm({
  servers,
  databases,
  initial,
  initialServers,
  submitLabel,
  onCancel,
  onSubmit,
  submitting,
  refusal,
}: StaticUserFormProps) {
  const isEdit = Boolean(initial);

  const form = useForm<StaticUserFormValues>({
    initialValues: {
      GenerateNewPassword: false,
      Description: initial?.Description ?? "",
      Servers: initialServers ?? [],
    },
    validateInputOnBlur: true,
    validate: {
      // The service skips an empty description on update, so clearing it would
      // report success and leave the old text in place.
      Description: composeValidators(
        maxLength(500, "Description"),
        notClearable("Description", initial?.Description),
      ),
      Servers: (grids) =>
        grids.length === 0
          ? "Add at least one server with database privileges"
          : whyPrivilegesIncomplete(grids, servers, databases),
    },
  });

  const submit = form.onSubmit(async (values) => {
    if (isEdit && initial) {
      const payload: UpdateStaticDatabaseUserRequest = {
        Id: initial.Id,
        UserName: initial.UserName,
        GenerateNewPassword: values.GenerateNewPassword,
        NewDescription: values.Description.trim() || null,
        Servers: withoutGrantOption(values.Servers),
      };
      await onSubmit(payload);
    } else {
      // The service always generates the password and ignores one sent here, so
      // none is asked for. It comes back once in the create response.
      const payload: CreateStaticDatabaseUserRequest = {
        UserPassword: null,
        Description: values.Description.trim() || null,
        Servers: withoutGrantOption(values.Servers),
      };
      await onSubmit(payload);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <FormSection
          title="Identity"
          description={
            isEdit
              ? "The username is assigned by the portal and cannot be changed."
              : "A free-form description shown in the operator UI."
          }
          icon={IconUser}
        >
          {isEdit && initial && (
            <TextInput
              label="Username"
              value={initial.UserName}
              disabled
              styles={{
                input: { fontFamily: "var(--mantine-font-family-monospace)" },
              }}
            />
          )}
          <Textarea
            label="Description"
            placeholder="Read-replica polling for analytics"
            autosize
            minRows={2}
            {...form.getInputProps("Description")}
          />
        </FormSection>

        <Divider />

        <FormSection
          title="Password"
          description="The server generates a strong password and shows it once. It cannot be chosen here."
          icon={IconKey}
        >
          {isEdit ? (
            <Switch
              label="Rotate password on save"
              description="The new password is shown once, after saving."
              checked={form.values.GenerateNewPassword}
              onChange={(e) =>
                form.setFieldValue("GenerateNewPassword", e.currentTarget.checked)
              }
            />
          ) : (
            <Text size="sm" c="dimmed">
              A password is generated when the user is created and shown once in the
              next step.
            </Text>
          )}
        </FormSection>

        <Divider />

        <FormSection
          title="Server &amp; database privileges"
          description={
            isEdit
              ? "Change the databases and privileges on the servers this user is on. Servers cannot be added or removed after creation."
              : "Pick the servers, databases, and granular privileges this user should hold."
          }
          icon={IconShieldCheck}
        >
          <PrivilegesEditor
            servers={servers}
            databases={databases}
            value={form.values.Servers}
            onChange={(next) => form.setFieldValue("Servers", next)}
            lockServers={isEdit}
          />
          {form.errors.Servers && (
            <Text size="sm" c="red" role="alert">
              {form.errors.Servers}
            </Text>
          )}
        </FormSection>

        {refusal && (
          <Alert color="red" variant="light" title={refusal.title} role="alert">
            <List size="sm" spacing={2}>
              {refusal.reasons.map((reason) => (
                <List.Item key={reason}>{reason}</List.Item>
              ))}
            </List>
          </Alert>
        )}

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
