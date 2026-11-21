import "@/global.css";

import { Platform } from "react-native";

export const AccentColor = "#04C1FF";
export const AppBackground = "#1A120A";

/** Exalto palette, taken from the Figma file. */
export const Palette = {
  bg: "#1A120A",
  surface: "#221A11",
  surface2: "#2E2419",
  sheetTop: "#241B12",
  sheetBottom: "#3C2E1E",
  line: "#3A2C20",
  text: "#F0E0D1",
  muted: "#958A7F",
  amber: "#F5C080",
  cyan: "#04C1FF",
  orange: "#EDA145",
  pill: "#5A4632",
  field: "#4A4038",
} as const;

/** Cyan → amber, used on borders, badges and accents. */
export const BrandGradient = ["#04C1FF", "#EDA145"] as const;

/** Plus Jakarta Sans faces, loaded in app/_layout.tsx. */
export const FontFamily = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

export function fontForWeight(weight?: string | number) {
  const w = Number(weight ?? 500);
  if (w >= 800) return FontFamily.extrabold;
  if (w >= 700) return FontFamily.bold;
  if (w >= 600) return FontFamily.semibold;
  if (w >= 500) return FontFamily.medium;
  return FontFamily.regular;
}

export const Colors = {
  light: {
    text: "#000000",
    background: "#ffffff",
    backgroundElement: "#F0F0F3",
    backgroundSelected: "#E0E1E6",
    textSecondary: "#60646C",
  },
  dark: {
    text: "#F0E0D1",
    background: AppBackground,
    backgroundElement: "#2E2419",
    backgroundSelected: "#3A2C20",
    textSecondary: "#958A7F",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MiniPlayerHeight = 64;
export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: 80 }) ?? 0;
export const MaxContentWidth = 800;
