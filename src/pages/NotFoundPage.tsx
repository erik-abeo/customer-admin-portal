import { Button, Center, Container, Group, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconHome } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Center mih="70vh" className="app-fade-in">
      <Container size="sm">
        <Stack gap="md" align="center" ta="center">
          <Title
            order={1}
            fw={800}
            style={{
              fontSize: 96,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              background:
                "linear-gradient(135deg, var(--mantine-color-crystal-6), var(--mantine-color-crystal-9))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            404
          </Title>
          <Title order={2}>Page not found</Title>
          <Text c="dimmed" maw={420}>
            The page you tried to load doesn&apos;t exist in the portal. Check the URL
            or head back to the dashboard.
          </Text>
          <Group gap="xs" mt="xs">
            <Button
              variant="default"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => navigate(-1)}
            >
              Go back
            </Button>
            <Button component={Link} to="/" leftSection={<IconHome size={16} />}>
              Dashboard
            </Button>
          </Group>
        </Stack>
      </Container>
    </Center>
  );
}
