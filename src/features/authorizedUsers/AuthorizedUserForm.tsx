import {
  Button,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconDatabase, IconShieldCheck, IconUser } from "@tabler/icons-react";

import type {
  AuthorizedUserInfoItem,
  CreateUserRequest,
  DatabaseInfoItem,
  DatabaseMapping,
  DatabaseServerInfoItem,
  UpdateUserRequest,
} from "@/api/types";
import { FormSection } from "@/components/common/FormSection";

import { DatabaseMappingsEditor } from "./DatabaseMappingsEditor";

interface AuthorizedUserFormValues {
  Email: string;
  Password: string;
  UseStaticHost: boolean;
  StaticHost: string;
  DatabaseMappings: DatabaseMapping[];
}

interface AuthorizedUserFormProps {
  servers: DatabaseServerInfoItem[];
  databases: DatabaseInfoItem[];
  initial?: AuthorizedUserInfoItem;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (payload: CreateUserRequest | UpdateUserRequest) => Promise<void> | void;
  submitting?: boolean;
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function AuthorizedUserForm({
  servers,
  databases,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
  submitting,
}: AuthorizedUserFormProps) {
  const isEdit = Boolean(initial);

  const form = useForm<AuthorizedUserFormValues>({
    initialValues: {
      Email: initial?.Email ?? "",
      Password: "",
      UseStaticHost: initial?.UseStaticHost ?? false,
      StaticHost: initial?.StaticHost ?? "",
      DatabaseMappings: initial?.DatabaseMappings ?? [],
    },
    validate: {
      Email: (v) => (isValidEmail(v) ? null : "Valid email is required"),
      Password: (v) => {
        if (isEdit) return null;
        return v.length < 8 ? "Password must be at least 8 characters" : null;
      },
      StaticHost: (v, all) =>
        all.UseStaticHost && v.trim().length === 0
          ? "Static host is required when enabled"
          : null,
    },
  });

  const submit = form.onSubmit(async (values) => {
    const trimmedHost = values.StaticHost.trim();
    if (isEdit && initial) {
      const payload: UpdateUserRequest = {
        UserId: String(initial.Id),
        Email: values.Email.trim(),
        Password: values.Password.length > 0 ? values.Password : null,
        UseStaticHost: values.UseStaticHost,
        StaticHost: values.UseStaticHost ? trimmedHost : null,
        DatabaseMappings: values.DatabaseMappings,
      };
      await onSubmit(payload);
    } else {
      const payload: CreateUserRequest = {
        Email: values.Email.trim(),
        Password: values.Password,
        UseStaticHost: values.UseStaticHost,
        StaticHost: values.UseStaticHost ? trimmedHost : null,
        DatabaseMappings: values.DatabaseMappings,
      };
      await onSubmit(payload);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <FormSection
          title="Account"
          description="Email and password for the customer's Supertokens login."
          icon={IconUser}
        >
          <TextInput
            label="Email"
            placeholder="user@example.com"
            required
            autoComplete="email"
            {...form.getInputProps("Email")}
          />
          <PasswordInput
            label={isEdit ? "New password" : "Password"}
            description={
              isEdit
                ? "Leave blank to keep the existing password."
                : "Minimum 8 characters."
            }
            required={!isEdit}
            autoComplete="new-password"
            {...form.getInputProps("Password")}
          />
        </FormSection>

        <Divider />

        <FormSection
          title="Host restriction"
          description="Optionally pin this user to a fixed host or IP."
          icon={IconShieldCheck}
        >
          <Group align="flex-start" grow>
            <Switch
              label="Use static host"
              description="Restrict this user to logging in from a fixed IP/hostname"
              checked={form.values.UseStaticHost}
              onChange={(e) =>
                form.setFieldValue("UseStaticHost", e.currentTarget.checked)
              }
            />
            <TextInput
              label="Static host"
              placeholder="203.0.113.10"
              disabled={!form.values.UseStaticHost}
              {...form.getInputProps("StaticHost")}
            />
          </Group>
        </FormSection>

        <Divider />

        <FormSection
          title="Database access"
          description="Map this user to one or more customer databases."
          icon={IconDatabase}
        >
          <DatabaseMappingsEditor
            servers={servers}
            databases={databases}
            value={form.values.DatabaseMappings}
            onChange={(next) => form.setFieldValue("DatabaseMappings", next)}
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
