import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  /** Optional eyebrow above the title (e.g. "Database server"). */
  eyebrow?: string;
}

/**
 * Standardized page header used at the top of every route. Keeps padding,
 * spacing, and typography consistent across the portal.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  eyebrow,
}: PageHeaderProps) {
  return (
    <Stack gap="sm" mb="lg">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          separator={<IconChevronRight size={12} stroke={2} />}
          separatorMargin="xs"
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            if (isLast || !crumb.to) {
              return (
                <Text key={`${crumb.label}-${idx}`} size="sm" c="dimmed">
                  {crumb.label}
                </Text>
              );
            }
            return (
              <Anchor
                key={`${crumb.label}-${idx}`}
                component={Link}
                to={crumb.to}
                size="sm"
                c="dimmed"
              >
                {crumb.label}
              </Anchor>
            );
          })}
        </Breadcrumbs>
      )}

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <Stack gap={4} style={{ minWidth: 0 }}>
          {eyebrow && (
            <Text size="xs" tt="uppercase" fw={600} c="crystal.6">
              {eyebrow}
            </Text>
          )}
          <Title order={1} style={{ fontSize: 26, lineHeight: 1.2 }}>
            {title}
          </Title>
          {description && (
            <Text c="dimmed" size="sm" maw={720}>
              {description}
            </Text>
          )}
        </Stack>
        {actions && (
          <Group gap="xs" wrap="nowrap">
            {actions}
          </Group>
        )}
      </Group>

      <div className="page-header-rule" />
    </Stack>
  );
}
