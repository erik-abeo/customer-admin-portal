import { notifications } from "@mantine/notifications";

import { ApiError } from "@/api/httpClient";

export const notifySuccess = (message: string, title = "Success") =>
  notifications.show({ title, message, color: "green" });

/**
 * A result somebody has to act on by hand. It stays up until dismissed, since
 * a toast that closes by itself is easy to miss and nothing retries the work.
 */
export const notifyWarning = (message: string, title = "Needs attention") =>
  notifications.show({ title, message, color: "yellow", autoClose: false });

export const notifyError = (error: unknown, fallbackTitle = "Action failed") => {
  const message =
    error instanceof ApiError
      ? `${error.message}${error.status ? ` (status ${error.status})` : ""}`
      : error instanceof Error
        ? error.message
        : "Unknown error";
  notifications.show({ title: fallbackTitle, message, color: "red" });
};
