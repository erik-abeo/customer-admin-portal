import {
  Alert,
  Button,
  Divider,
  FileButton,
  Group,
  NumberInput,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  IconCertificate,
  IconKey,
  IconLock,
  IconNetwork,
  IconServer2,
} from "@tabler/icons-react";
import { useState } from "react";

import type {
  CreateDatabaseServerInfoRequest,
  DatabaseServerInfoItem,
  UpdateDatabaseServerInfoRequest,
} from "@/api/types";
import { FormSection } from "@/components/common/FormSection";
import {
  composeValidators,
  hostname,
  maxLength,
  port,
  required,
  strongPassword,
} from "@/lib/validators";

export interface DatabaseServerFormValues {
  Name: string;
  Description: string;
  LocalServerAddress: string;
  RemoteServerAddress: string;
  ServerPort: number;
  RootUserPassword: string;
  Certificate: string;
}

interface DatabaseServerFormProps {
  initial?: DatabaseServerInfoItem;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (
    payload: CreateDatabaseServerInfoRequest | UpdateDatabaseServerInfoRequest,
  ) => Promise<void> | void;
  submitting?: boolean;
}

const emptyValues = (initial?: DatabaseServerInfoItem): DatabaseServerFormValues => ({
  Name: initial?.Name ?? "",
  Description: initial?.Description ?? "",
  LocalServerAddress: initial?.LocalServerAddress ?? "",
  RemoteServerAddress: initial?.RemoteServerAddress ?? "",
  ServerPort: initial?.ServerPort ?? 3309,
  RootUserPassword: "",
  Certificate: initial?.Certificate ?? "",
});

export function DatabaseServerForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
  submitting,
}: DatabaseServerFormProps) {
  const isEdit = initial !== undefined;
  const [certFileName, setCertFileName] = useState<string | null>(null);

  const form = useForm<DatabaseServerFormValues>({
    initialValues: emptyValues(initial),
    validateInputOnBlur: true,
    validate: {
      Name: composeValidators(required("Name"), maxLength(64, "Name")),
      Description: maxLength(500, "Description"),
      LocalServerAddress: composeValidators(
        required("Local server address"),
        hostname("Local server address"),
      ),
      RemoteServerAddress: hostname("Remote server address"),
      ServerPort: port("Server port"),
      RootUserPassword: (v) => {
        if (!isEdit) {
          if (v.length === 0) return "Root password is required";
          return strongPassword("Root password")(v);
        }
        // Edit mode: empty means "keep existing"; only validate when set.
        if (v.length > 0) return strongPassword("Root password")(v);
        return null;
      },
    },
  });

  const handleCertFile = async (file: File | null) => {
    if (!file) {
      setCertFileName(null);
      return;
    }
    const text = await file.text();
    form.setFieldValue("Certificate", text);
    setCertFileName(file.name);
  };

  const submit = form.onSubmit(async (values) => {
    const base = {
      Name: values.Name.trim(),
      Description: values.Description.trim() || null,
      LocalServerAddress: values.LocalServerAddress.trim(),
      RemoteServerAddress: values.RemoteServerAddress.trim() || null,
      ServerPort: values.ServerPort,
      Certificate: values.Certificate.trim() || null,
    };
    if (initial) {
      const payload: UpdateDatabaseServerInfoRequest = {
        Id: initial.Id,
        ...base,
        RootUserPassword:
          values.RootUserPassword.length > 0
            ? values.RootUserPassword
            : initial.RootUserPassword,
      };
      await onSubmit(payload);
    } else {
      const payload: CreateDatabaseServerInfoRequest = {
        ...base,
        RootUserPassword: values.RootUserPassword,
      };
      await onSubmit(payload);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <FormSection
          title="Identification"
          description="Human-readable name and a short description for the operator UI."
          icon={IconServer2}
        >
          <TextInput
            label="Name"
            placeholder="db-east-1"
            required
            {...form.getInputProps("Name")}
          />
          <Textarea
            label="Description"
            placeholder="Production cluster, us-east-1"
            autosize
            minRows={2}
            {...form.getInputProps("Description")}
          />
        </FormSection>

        <Divider />

        <FormSection
          title="Connection"
          description="Network addresses and port the portal will use to reach this MariaDB server."
          icon={IconNetwork}
        >
          <Group grow align="flex-start">
            <TextInput
              label="Local server address"
              description="Hostname or IP reachable from the gateway server"
              placeholder="db-east-1.internal"
              required
              {...form.getInputProps("LocalServerAddress")}
            />
            <TextInput
              label="Remote server address"
              description="Public address used by external clients (optional)"
              placeholder="db-east-1.crystalpm.com"
              {...form.getInputProps("RemoteServerAddress")}
            />
          </Group>
          <NumberInput
            label="Server port"
            min={1}
            max={65535}
            required
            w={160}
            {...form.getInputProps("ServerPort")}
          />
        </FormSection>

        <Divider />

        <FormSection
          title="Root credentials"
          description={
            isEdit
              ? "Leave the field blank to keep the existing root password."
              : "Initial root user password used by the portal to provision databases."
          }
          icon={IconKey}
        >
          <PasswordInput
            label={isEdit ? "Rotate root user password" : "Root user password"}
            description={
              isEdit ? "Leave blank to keep the existing password." : undefined
            }
            placeholder={isEdit ? "••••••••" : ""}
            autoComplete="new-password"
            required={!isEdit}
            {...form.getInputProps("RootUserPassword")}
          />
          {isEdit && (
            <Alert variant="light" color="gray" icon={<IconLock size={14} />} p="xs">
              <Text size="xs">
                The current password is never displayed by this portal.
              </Text>
            </Alert>
          )}
        </FormSection>

        <Divider />

        <FormSection
          title="TLS certificate"
          description="Optional CA certificate trusted by the portal when connecting over TLS."
          icon={IconCertificate}
        >
          <Group gap="sm">
            <FileButton onChange={handleCertFile} accept=".pem,.crt,.cer,.txt">
              {(props) => (
                <Button variant="default" {...props}>
                  Browse for certificate file…
                </Button>
              )}
            </FileButton>
            <Text size="sm" c="dimmed">
              {certFileName ??
                (form.values.Certificate ? "Certificate present" : "None loaded")}
            </Text>
          </Group>
          <Textarea
            label="Certificate (PEM)"
            placeholder="-----BEGIN CERTIFICATE-----"
            autosize
            minRows={3}
            maxRows={8}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            {...form.getInputProps("Certificate")}
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
