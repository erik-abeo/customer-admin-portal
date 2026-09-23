import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  FileButton,
  Group,
  List,
  NumberInput,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  IconCertificate,
  IconCheck,
  IconKey,
  IconLock,
  IconNetwork,
  IconPlugConnected,
  IconServer2,
  IconShieldLock,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";

import type {
  CreateDatabaseServerInfoRequest,
  DatabaseServerInfoItem,
  ProbeDatabaseServerResponse,
  UpdateDatabaseServerInfoRequest,
} from "@/api/types";
import { FormSection } from "@/components/common/FormSection";
import { notifyError } from "@/lib/notify";
import { useProbeDatabaseServer } from "@/features/databaseServers/queries";
import {
  canSubmitServer,
  changedSecrets,
  connectionChanged,
  effectiveConnection,
  probeSslMode,
} from "./registration";
import {
  composeValidators,
  hostname,
  maxLength,
  notClearable,
  port,
  required,
} from "@/lib/validators";

export interface DatabaseServerFormValues {
  Name: string;
  Description: string;
  LocalServerAddress: string;
  RemoteServerAddress: string;
  ServerPort: number;
  AdminUserName: string;
  RootUserPassword: string;
  Certificate: string;
  SecurityGroupId: string;
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
  AdminUserName: initial?.AdminUserName ?? "root",
  RootUserPassword: "",
  Certificate: initial?.Certificate ?? "",
  SecurityGroupId: initial?.SecurityGroupId ?? "",
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
      Description: composeValidators(
        maxLength(500, "Description"),
        notClearable("Description", initial?.Description),
      ),
      LocalServerAddress: composeValidators(
        required("Local server address"),
        hostname("Local server address"),
      ),
      RemoteServerAddress: composeValidators(
        hostname("Remote server address"),
        notClearable("Remote server address", initial?.RemoteServerAddress),
      ),
      ServerPort: port("Server port"),
      AdminUserName: composeValidators(
        required("Administrator username"),
        maxLength(64, "Administrator username"),
      ),
      // The server's existing administrator password, not one the portal chooses, so it is
      // taken as it is: a complexity rule here would refuse a real server whose password
      // does not meet it. The probe is what proves it works. Edit mode: empty keeps the
      // stored one.
      RootUserPassword: (v) => {
        if (!isEdit && v.length === 0) return "Administrator password is required";
        return maxLength(256, "Administrator password")(v);
      },
      // The API needs a CA certificate to administer the server at all, and refuses to
      // register one without it. Asked for here so the operator hears it from the form,
      // not from a validation error after submitting. On edit the field is prefilled
      // with the stored one, and a blank is sent as "keep", so clearing it would
      // report success and leave the old certificate: it cannot be cleared.
      Certificate: (v) =>
        !isEdit && v.trim().length === 0
          ? "A CA certificate is required. For RDS, use the AWS global bundle."
          : notClearable("Certificate", initial?.Certificate)(v),
    },
  });

  const probe = useProbeDatabaseServer();
  const [probed, setProbed] = useState<{
    for: string;
    result: ProbeDatabaseServerResponse;
  } | null>(null);

  // What saving would connect with: on edit, blank password and certificate
  // fields keep the stored ones. A result describes exactly the connection it was
  // run with. Once any part of that changes it describes a different server, so it
  // stops showing rather than vouching for something nobody has checked.
  const connection = effectiveConnection(form.values, initial);
  const probeInputs = JSON.stringify(connection);
  const probeResult = probed?.for === probeInputs ? probed.result : null;
  const changesConnection = initial ? connectionChanged(form.values, initial) : true;
  // An acknowledgement belongs to the connection it was given for, like a probe
  // result, so changing any connection field again withdraws it.
  const [savingAnywayFor, setSavingAnywayFor] = useState<string | null>(null);
  const savingWithoutPassingProbe = savingAnywayFor === probeInputs;
  const canSubmit = canSubmitServer(
    isEdit,
    changesConnection,
    probeResult,
    savingWithoutPassingProbe,
  );
  const offerSaveAnyway =
    isEdit && changesConnection && probeResult?.IsSupported !== true;

  // The probe needs somewhere to connect and something to connect as. On edit
  // the stored password is used when the field is left blank.
  const canProbe =
    connection.Host.length > 0 &&
    connection.User.length > 0 &&
    connection.Password.length > 0;

  const runProbe = async () => {
    setProbed(null);
    const inputs = probeInputs;
    try {
      const result = await probe.mutateAsync({
        Host: connection.Host,
        Port: connection.Port,
        User: connection.User,
        Password: connection.Password,
        // VerifyCA whenever there is a certificate, because that is what the
        // installer is handed at redemption: the probe then proves the
        // certificate being registered, not only that TLS negotiates.
        SslMode: probeSslMode(connection),
        CertificatePem: connection.CertificatePem || null,
      });
      setProbed({ for: inputs, result });
    } catch (e) {
      // An unreachable or unsuitable server is reported in the body, so reaching
      // here means the request itself failed (the API was unreachable, the key
      // was refused, or it answered 500). Nothing else reports it, so it is
      // shown here, and the panel is cleared so a stale pass is not left up.
      notifyError(e, "Probe failed");
      setProbed(null);
    }
  };

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
    if (!canSubmit) return;
    const base = {
      Name: values.Name.trim(),
      Description: values.Description.trim() || null,
      LocalServerAddress: values.LocalServerAddress.trim(),
      RemoteServerAddress: values.RemoteServerAddress.trim() || null,
      ServerPort: values.ServerPort,
      AdminUserName: values.AdminUserName.trim(),
    };
    if (initial) {
      const payload: UpdateDatabaseServerInfoRequest = {
        Id: initial.Id,
        ...base,
        // Only what the operator typed; null keeps the stored value.
        ...changedSecrets(values, initial),
        // The service clears the group on an empty string and ignores null, so a
        // cleared field is sent as "" to actually remove it.
        SecurityGroupId: values.SecurityGroupId.trim(),
      };
      await onSubmit(payload);
    } else {
      const payload: CreateDatabaseServerInfoRequest = {
        ...base,
        // Required on create, and the validator above has already refused a blank one.
        Certificate: values.Certificate.trim(),
        SecurityGroupId: values.SecurityGroupId.trim() || null,
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
              description="Address clients connect to. Optional: when blank, clients are given the local address."
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
          <TextInput
            label="Administrator username"
            description="Not always root. AWS RDS reserves that name, so an RDS server uses whatever master username it was given."
            placeholder="root"
            required
            {...form.getInputProps("AdminUserName")}
          />
          <PasswordInput
            label={isEdit ? "Rotate administrator password" : "Administrator password"}
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
          title="AWS security group"
          description="Ingress rules on this group are opened for client addresses that are authorized to reach the server."
          icon={IconShieldLock}
        >
          <TextInput
            label="Security group ID"
            description="Leave blank when the server is not behind one."
            placeholder="sg-0abc1234def56789"
            {...form.getInputProps("SecurityGroupId")}
          />
        </FormSection>

        <Divider />

        <FormSection
          title="Server check"
          description="Connects and reports what this server is. Nothing is saved and it can be run as often as you like."
          icon={IconPlugConnected}
        >
          <Group gap="sm" align="center">
            <Button
              variant="default"
              onClick={runProbe}
              loading={probe.isPending}
              disabled={!canProbe}
              leftSection={<IconPlugConnected size={16} />}
            >
              Test connection
            </Button>
            {!canProbe && (
              <Text size="xs" c="dimmed">
                Enter an address, username and password to run a check.
              </Text>
            )}
          </Group>

          {probeResult && (
            <Stack gap="xs" mt="xs">
              <Group gap="xs">
                <Badge color={probeResult.IsSupported ? "teal" : "red"} variant="light">
                  {probeResult.Engine}
                  {probeResult.EngineVersion ? ` ${probeResult.EngineVersion}` : ""}
                </Badge>
                {probeResult.TlsInUse && (
                  <Badge color="teal" variant="outline">
                    TLS
                  </Badge>
                )}
              </Group>

              {/*
                IsSupported is the gate, not Success: Success only means the probe
                ran to completion. A server can be reached and still be unusable.
              */}
              <Alert
                variant="light"
                color={probeResult.IsSupported ? "teal" : "red"}
                icon={
                  probeResult.IsSupported ? (
                    <IconCheck size={14} />
                  ) : (
                    <IconX size={14} />
                  )
                }
                p="xs"
              >
                <Text size="xs">{probeResult.Message}</Text>
              </Alert>

              {/*
                Rendered in the order the checks ran, so a rejected server says
                which gate it failed rather than only that it was rejected.
              */}
              <List spacing={4} size="xs" center>
                {probeResult.Checks.map((check) => (
                  <List.Item
                    key={check.Name}
                    icon={
                      <ThemeIcon
                        size={16}
                        radius="xl"
                        color={check.Passed ? "teal" : "red"}
                        variant="light"
                      >
                        {check.Passed ? <IconCheck size={11} /> : <IconX size={11} />}
                      </ThemeIcon>
                    }
                  >
                    {check.Detail}
                  </List.Item>
                ))}
              </List>
            </Stack>
          )}
        </FormSection>

        <Divider />

        <FormSection
          title="TLS certificate"
          description="The CA certificate the server's TLS certificate is issued under. For RDS, the AWS global bundle. Handed to CrystalPM clients with their credentials."
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

        {offerSaveAnyway && (
          <Checkbox
            label="Save without a passing probe. Use this only when the server is known to be reachable and a probe cannot pass yet, such as a new CA staged before the certificate rotates."
            checked={savingWithoutPassingProbe}
            onChange={(event) =>
              setSavingAnywayFor(event.currentTarget.checked ? probeInputs : null)
            }
          />
        )}

        {!canSubmit && (
          <Text size="xs" c="dimmed" ta="right" id="server-register-hint">
            {isEdit
              ? "This changes how the service connects to the server. Run a probe that passes before saving."
              : "Run a probe that passes before registering."}{" "}
            It checks the service can reach this server and administer it, which every
            migration onto it will need.
          </Text>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={!canSubmit}
            aria-describedby={canSubmit ? undefined : "server-register-hint"}
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
