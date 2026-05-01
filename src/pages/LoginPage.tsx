import {
  Alert,
  Anchor,
  Box,
  Button,
  Code,
  Container,
  Divider,
  Group,
  Image,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  IconAlertTriangle,
  IconArrowBigUpLine,
  IconFlask2,
  IconLock,
  IconShieldLock,
} from "@tabler/icons-react";
import axios from "axios";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/authContextValue";
import { safeRedirect } from "@/auth/redirectSafety";
import { env } from "@/config/env";

interface LoginValues {
  adminName: string;
  apiKey: string;
}

function buildProbeUrl(): string {
  const base = env.apiBaseUrl.replace(/\/+$/, "");
  const prefix = env.apiControllerPrefix.startsWith("/")
    ? env.apiControllerPrefix
    : `/${env.apiControllerPrefix}`;
  return `${base}${prefix}/get-all-database-server-info`;
}

export function LoginPage() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);

  const handleCapsCheck = (
    e: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>,
  ) => {
    if ("getModifierState" in e && typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  };

  const redirect = safeRedirect(searchParams.get("redirect"));

  const form = useForm<LoginValues>({
    initialValues: { adminName: "", apiKey: "" },
    validate: {
      adminName: (v) => (v.trim().length === 0 ? "Your admin name is required" : null),
      apiKey: (v) => (v.trim().length === 0 ? "API key is required" : null),
    },
  });

  if (isAuthenticated) {
    return <Navigate to={redirect} replace />;
  }

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitting(true);
    setServerError(null);
    try {
      await axios.get(buildProbeUrl(), {
        headers: { "api-key": values.apiKey.trim() },
        timeout: 15_000,
      });
      signIn(values.adminName, values.apiKey);
      navigate(redirect, { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          setServerError(
            "The ASP.NET service rejected that API key (HTTP 401). " +
              "Double-check the value of the api-key setting in its appsettings.json.",
          );
        } else if (err.response?.status === 403) {
          setServerError(
            "The ASP.NET service refused the request (HTTP 403). " +
              "The key may be valid but blocked for this client.",
          );
        } else if (err.code === "ERR_NETWORK") {
          setServerError(
            `Could not reach the API at ${env.apiBaseUrl}. ` +
              "Check your network and that the service is running.",
          );
        } else {
          setServerError(
            err.response
              ? `API error (HTTP ${err.response.status}): ${err.message}`
              : err.message,
          );
        }
      } else {
        setServerError("Unexpected error contacting the API.");
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Box className="login-shell">
      <Container size={460} px="md" py="xl" style={{ minHeight: "100vh" }}>
        <Stack
          gap="xl"
          justify="space-between"
          style={{ minHeight: "calc(100vh - 64px)" }}
        >
          <Stack gap="xl" mt={{ base: "md", sm: 56 }}>
            <Stack gap="xs" align="center">
              <Image
                src="/crystalpm-logo.png"
                alt="CrystalPM"
                h={108}
                w="auto"
                fit="contain"
                className="app-fade-in"
              />
              <Title
                order={1}
                ta="center"
                style={{ fontSize: 26, letterSpacing: "-0.01em" }}
              >
                {env.appName}
              </Title>
              <Text c="dimmed" size="sm" ta="center" maw={360}>
                Manage CrystalPM&apos;s remote MariaDB infrastructure — servers,
                customer databases, authorized users, and audit visibility.
              </Text>
            </Stack>

            <Paper className="login-card" p="xl" radius="lg" shadow="lg">
              <form onSubmit={handleSubmit} noValidate>
                <Stack gap="md">
                  <Group gap="xs" align="center">
                    <IconShieldLock size={18} stroke={1.6} />
                    <Text fw={600} size="sm">
                      Administrator sign-in
                    </Text>
                  </Group>

                  <Divider />

                  {env.demoMode && (
                    <Alert
                      color="violet"
                      variant="light"
                      icon={<IconFlask2 size={16} />}
                      title="Demo mode"
                    >
                      <Text size="xs">
                        The portal is running on in-memory fixtures. Sign in with{" "}
                        <Code>any name</Code> and <Code>any key</Code> — no real backend
                        will be contacted.
                      </Text>
                    </Alert>
                  )}

                  <TextInput
                    label="Your admin name"
                    description="Used to attribute administrative actions in the audit log."
                    placeholder={env.demoMode ? "demo.admin" : "erik.griffin"}
                    autoComplete="username"
                    size="md"
                    required
                    {...form.getInputProps("adminName")}
                  />
                  <PasswordInput
                    label="Management API key"
                    description={
                      env.demoMode ? (
                        <Text size="xs" c="dimmed">
                          Any non-empty value is accepted in demo mode.
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">
                          The <Code>api-key</Code> value from{" "}
                          <Code>ClientRemoteDatabaseAccessAPI</Code>&apos;s{" "}
                          <Code>appsettings.json</Code>.
                        </Text>
                      )
                    }
                    placeholder={
                      env.demoMode
                        ? "any-value-works-in-demo"
                        : "••••••••-••••-••••-••••-••••••••••••"
                    }
                    autoComplete="current-password"
                    size="md"
                    required
                    leftSection={<IconLock size={16} stroke={1.6} />}
                    {...form.getInputProps("apiKey")}
                    onKeyDown={handleCapsCheck}
                    onKeyUp={handleCapsCheck}
                    onClick={handleCapsCheck}
                    onBlur={() => setCapsLock(false)}
                  />

                  {capsLock && (
                    <Group gap={6} c="yellow.7" mt={-6}>
                      <IconArrowBigUpLine size={14} />
                      <Text size="xs" fw={500}>
                        Caps Lock is on
                      </Text>
                    </Group>
                  )}

                  {serverError && (
                    <Alert
                      color="red"
                      variant="light"
                      icon={<IconAlertTriangle size={16} />}
                      title="Sign-in failed"
                    >
                      {serverError}
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    loading={submitting}
                    fullWidth
                    size="md"
                    mt="xs"
                  >
                    {submitting ? "Verifying credentials…" : "Sign in"}
                  </Button>
                </Stack>
              </form>
            </Paper>

            <Text size="xs" c="dimmed" ta="center" px="md">
              Credentials live only in this browser tab&apos;s sessionStorage and are
              cleared when the tab closes or you sign out. The API key is never written
              to disk by this app. See the{" "}
              <Anchor
                href="https://github.com/CrystalPM/customer-admin-portal#authentication--security-model"
                target="_blank"
                rel="noreferrer noopener"
              >
                security model
              </Anchor>{" "}
              for details.
            </Text>
          </Stack>

          <Group justify="center" gap="xs">
            <Text size="xs" c="dimmed">
              © {new Date().getFullYear()} CrystalPM
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Text size="xs" c="dimmed">
              Internal admin tool — unauthorized access prohibited
            </Text>
          </Group>
        </Stack>
      </Container>
    </Box>
  );
}
