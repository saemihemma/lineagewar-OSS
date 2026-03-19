/** Typed constants mirroring the CSS custom properties in index.css */

export const tokens = {
  bg: {
    terminal: "#020503",
    panel: "#06110c",
  },
  mint: {
    base: "#caf5de",
    dim: "#6e9f8d",
  },
  orange: {
    base: "#dd5807",
    dim: "#8f3a05",
  },
  yellow: {
    base: "#f2c94c",
    dim: "#9a7c2c",
  },
  neutral: "#4f6b60",
  border: {
    panel: "#2a3a33",
    active: "#caf5de",
    grid: "#0f1e18",
    inactive: "#1b2b24",
    edge: "#6e9f8d",
  },
  text: {
    base: "#caf5de",
    muted: "#6e9f8d",
    dim: "#3d5c50",
  },
} as const;

/** Tribe ID → color token */
export function tribeColor(tribeId: number | undefined): string {
  if (tribeId === 1) return "var(--tribe-a)";
  if (tribeId === 2) return "var(--tribe-b)";
  return "var(--mint-dim)";
}

/** Tribe A accent (used as default "team A" reference) */
export const TRIBE_A_COLOR = "var(--tribe-a)";
export const TRIBE_B_COLOR = "var(--tribe-b)";
