import { Alert, Button, Container, Stack, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { ApiError } from "@/api/httpClient";

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let detail = "An unexpected error occurred while rendering this page.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail =
      typeof error.data === "string" ? error.data : "The page could not be loaded.";
  } else if (error instanceof ApiError) {
    title = `API error (${error.status || "network"})`;
    detail = error.message;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Page failed to load</Title>
        <Alert
          icon={<IconAlertTriangle size={18} />}
          title={title}
          color="red"
          variant="light"
        >
          {detail}
        </Alert>
        <Button
          variant="default"
          onClick={() => window.location.reload()}
          style={{ alignSelf: "flex-start" }}
        >
          Reload
        </Button>
      </Stack>
    </Container>
  );
}
