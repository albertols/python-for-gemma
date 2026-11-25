/**
 * A group's colour token (g1 to g6, in SEED_GROUPS order) as CSS variables.
 * The values are in tokens.css, per theme, and are checked for contrast there.
 */
export function groupColour(token: string): { bg: string; fg: string } {
  if (!/^g[1-6]$/.test(token))
    throw new Error(`Unknown group colour "${token}"`);
  return { bg: `var(--${token}-bg)`, fg: `var(--${token}-fg)` };
}
