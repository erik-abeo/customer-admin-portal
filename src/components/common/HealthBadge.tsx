import { Badge, type BadgeProps, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconLoader2 } from "@tabler/icons-react";

export type HealthStatus = "ok" | "loading" | "error";

interface HealthBadgeProps extends Omit<
  BadgeProps,
  "children" | "color" | "leftSection"
> {
  status: HealthStatus;
  okLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
  /** Tooltip body shown on hover for additional context. */
  tooltip?: string;
}

const COPY: Record<
  HealthStatus,
  { color: string; label: string; icon: React.ReactNode }
> = {
  ok: {
    color: "teal",
    label: "All systems operational",
    icon: <IconCheck size={12} />,
  },
  loading: {
    color: "gray",
    label: "Checking…",
    icon: <IconLoader2 size={12} className="spin" />,
  },
  error: {
    color: "red",
    label: "Service degraded",
    icon: <IconAlertTriangle size={12} />,
  },
};

export function HealthBadge({
  status,
  okLabel,
  loadingLabel,
  errorLabel,
  tooltip,
  ...rest
}: HealthBadgeProps) {
  const { color, label: defaultLabel, icon } = COPY[status];
  const label =
    status === "ok"
      ? (okLabel ?? defaultLabel)
      : status === "loading"
        ? (loadingLabel ?? defaultLabel)
        : (errorLabel ?? defaultLabel);

  const badge = (
    <Badge
      color={color}
      variant="light"
      size="lg"
      radius="sm"
      leftSection={icon}
      {...rest}
    >
      {label}
    </Badge>
  );

  if (!tooltip) return badge;
  return (
    <Tooltip label={tooltip} multiline w={260} withArrow>
      {badge}
    </Tooltip>
  );
}
