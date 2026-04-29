import {
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  type MantineColorsTuple,
  Modal,
  NavLink,
  Notification,
  Paper,
  Table,
  Text,
  TextInput,
  Title,
  createTheme,
  rem,
} from "@mantine/core";

/**
 * CrystalPM brand color — a refined indigo-blue tuned to sit between
 * Mantine's `indigo` and `blue` so it pairs well with both the marketing
 * site and the existing CrystalPM client brand assets. Generated against
 * Mantine's 10-shade scale (lightest → darkest).
 */
const crystal: MantineColorsTuple = [
  "#eef3ff",
  "#dde4ff",
  "#b6c5ff",
  "#8ea4ff",
  "#6f88ff",
  "#5a78ff",
  "#4f70ff", // primary (shade 6)
  "#4260e6",
  "#3855cd",
  "#2a45ad",
];

/** Cool neutral gray used for surfaces, borders, and muted text. */
const slate: MantineColorsTuple = [
  "#f7f8fa",
  "#eceef2",
  "#d6dae2",
  "#bcc1cd",
  "#a4abbb",
  "#8c95a8",
  "#737d92",
  "#5d6577",
  "#484e5d",
  "#2f3340",
];

export const theme = createTheme({
  primaryColor: "crystal",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  cursorType: "pointer",
  focusRing: "auto",

  colors: {
    crystal,
    slate,
  },

  white: "#ffffff",
  black: "#11131a",

  fontFamily:
    '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',

  fontSmoothing: true,
  lineHeights: {
    xs: "1.45",
    sm: "1.5",
    md: "1.55",
    lg: "1.6",
    xl: "1.6",
  },

  headings: {
    fontFamily:
      '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: "700",
    sizes: {
      h1: { fontSize: rem(32), lineHeight: "1.2", fontWeight: "700" },
      h2: { fontSize: rem(24), lineHeight: "1.25", fontWeight: "700" },
      h3: { fontSize: rem(20), lineHeight: "1.3", fontWeight: "600" },
      h4: { fontSize: rem(17), lineHeight: "1.35", fontWeight: "600" },
      h5: { fontSize: rem(15), lineHeight: "1.4", fontWeight: "600" },
      h6: { fontSize: rem(13), lineHeight: "1.4", fontWeight: "600" },
    },
  },

  shadows: {
    xs: "0 1px 2px rgba(15, 23, 42, 0.06)",
    sm: "0 2px 4px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
    md: "0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04)",
    lg: "0 12px 32px rgba(15, 23, 42, 0.12), 0 4px 8px rgba(15, 23, 42, 0.06)",
    xl: "0 24px 64px rgba(15, 23, 42, 0.16), 0 8px 16px rgba(15, 23, 42, 0.08)",
  },

  radius: {
    xs: rem(4),
    sm: rem(6),
    md: rem(10),
    lg: rem(14),
    xl: rem(20),
  },

  components: {
    Container: Container.extend({
      defaultProps: {
        size: "xl",
      },
    }),
    Paper: Paper.extend({
      defaultProps: {
        radius: "md",
      },
    }),
    Card: Card.extend({
      defaultProps: {
        radius: "md",
        withBorder: true,
        padding: "lg",
      },
    }),
    Button: Button.extend({
      defaultProps: {
        radius: "md",
      },
      styles: {
        root: { fontWeight: 500, letterSpacing: "0.01em" },
      },
    }),
    Anchor: Anchor.extend({
      defaultProps: {
        underline: "hover",
      },
    }),
    Badge: Badge.extend({
      defaultProps: {
        radius: "sm",
      },
      styles: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          letterSpacing: "0.01em",
        },
      },
    }),
    Title: Title.extend({
      styles: {
        root: { letterSpacing: "-0.01em" },
      },
    }),
    Text: Text.extend({
      defaultProps: {
        // Tabular numbers across the board so columns of IDs/counts align.
        // Single-purpose pages can opt out via inline style.
      },
    }),
    NavLink: NavLink.extend({
      defaultProps: {
        variant: "filled",
      },
      styles: {
        root: {
          borderRadius: rem(8),
          marginBottom: rem(2),
          fontWeight: 500,
        },
        label: { fontSize: rem(14) },
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: {
        radius: "md",
      },
    }),
    Table: Table.extend({
      defaultProps: {
        striped: false,
        highlightOnHover: true,
        verticalSpacing: "sm",
        horizontalSpacing: "md",
      },
      styles: (mantineTheme) => ({
        th: {
          fontWeight: 600,
          fontSize: rem(12),
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: mantineTheme.colors.gray[6],
        },
      }),
    }),
    Modal: Modal.extend({
      defaultProps: {
        radius: "md",
        centered: true,
        overlayProps: { backgroundOpacity: 0.55, blur: 4 },
      },
    }),
    Notification: Notification.extend({
      defaultProps: {
        radius: "md",
        withBorder: true,
      },
    }),
  },

  other: {
    /** Reusable surface gradients for hero / login / decorative areas. */
    gradients: {
      hero: "linear-gradient(135deg, rgba(79, 112, 255, 0.18) 0%, rgba(170, 130, 255, 0.10) 50%, rgba(79, 112, 255, 0.06) 100%)",
      heroDark:
        "linear-gradient(135deg, rgba(79, 112, 255, 0.22) 0%, rgba(60, 30, 160, 0.18) 50%, rgba(20, 22, 36, 0.4) 100%)",
    },
  },
});
