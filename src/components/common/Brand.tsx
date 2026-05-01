import { Group, Image, Text } from "@mantine/core";

import { env } from "@/config/env";

interface BrandProps {
  /** Render only the logo, no wordmark text. */
  iconOnly?: boolean;
  /** Pixel height of the logo image. */
  height?: number;
  /** Label used by screen readers. */
  ariaLabel?: string;
}

/**
 * CrystalPM wordmark + the portal name. The "side" variant is a horizontal
 * full-color logo sourced from the main crystalpm repository and shipped in
 * /public, so it works on both the light and dark color schemes without a
 * filter trick.
 */
export function Brand({
  iconOnly = false,
  height = 32,
  ariaLabel = "CrystalPM Customer Admin Portal",
}: BrandProps) {
  return (
    <Group gap="sm" wrap="nowrap" aria-label={ariaLabel}>
      <Image
        src="/crystalpm-logo-side.png"
        alt="CrystalPM"
        h={height}
        w="auto"
        fit="contain"
      />
      {!iconOnly && (
        <Text fw={600} lh={1.1} visibleFrom="xs">
          {env.appName}
        </Text>
      )}
    </Group>
  );
}
