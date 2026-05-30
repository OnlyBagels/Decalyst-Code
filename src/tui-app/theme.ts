export const theme = {
  user: "cyan",
  agent: "white",
  build: "green",
  system: "yellow",
  phaseActive: "blueBright",
  phaseDone: "green",
  phasePending: "gray",
  dim: "gray",
  accent: "cyanBright",
  error: "red",
  success: "green",
} as const;

export type ThemeKey = keyof typeof theme;
