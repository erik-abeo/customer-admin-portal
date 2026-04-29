import { notifications } from "@mantine/notifications";

import { ApiError } from "@/api/httpClient";

export const notifySuccess = (message: string, title = "Success") =>
  notifications.show({ title, message, color: "green" });

export const notifyError = (error: unknown, fallbackTitle = "Action failed") => {
  const message =
    error instanceof ApiError
      ? `${error.message}${error.status ? ` (status ${error.status})` : ""}`
      : error instanceof Error
        ? error.message
        : "Unknown error";
  notifications.show({ title: fallbackTitle, message, color: "red" });
};
