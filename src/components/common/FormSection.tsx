import { Group, Stack, Text, ThemeIcon } from "@mantine/core";
import type { Icon } from "@tabler/icons-react";
import type { ReactNode } from "react";

interface FormSectionProps {
  title: string;
  description?: string;
  icon?: Icon;
  children: ReactNode;
}

/**
 * Standardized section header used inside form modals so every form has the
 * same rhythm, icon, title, and supporting description.
 */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
}: FormSectionProps) {
  return (
    <Stack gap="sm">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        {Icon && (
          <ThemeIcon variant="light" color="crystal" radius="md" size={28}>
            <Icon size={16} stroke={1.7} />
          </ThemeIcon>
        )}
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm">
            {title}
          </Text>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </Stack>
      </Group>
      {children}
    </Stack>
  );
}
