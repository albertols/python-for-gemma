import fs from "node:fs";
import { expect, test } from "vitest";

// tokens.css is the single source of the colours. This test reads it, so a
// colour cannot be changed without the contrast being checked again.
const css = fs.readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

type Theme = "dark" | "light";
const SELECTOR: Record<Theme, RegExp> = {
  dark: /:root\s*\{([^}]*)\}/,
  light: /:root\[data-theme="light"\]\s*\{([^}]*)\}/,
};

function tokens(theme: Theme): Record<string, string> {
  const block = SELECTOR[theme].exec(css)?.[1];
  if (!block) throw new Error(`no ${theme} block in tokens.css`);
  const found: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))
    found[m[1] as string] = m[2] as string;
  return found;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text-on-surface pair the app uses, and every group card, in both themes. */
const TEXT_PAIRS = [
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["card-foreground", "card"],
  ["muted-foreground", "card"],
  ["foreground", "muted"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["link", "background"],
  ["link", "card"],
  ["danger", "background"],
  ["danger", "card"],
  ["ai", "background"],
  ["ai", "card"],
] as const;
const GROUPS = ["g1", "g2", "g3", "g4", "g5", "g6"] as const;

function allColourPairs(): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const theme of ["dark", "light"] as const) {
    const t = tokens(theme);
    const get = (name: string) => {
      const v = t[name];
      if (!v) throw new Error(`${theme} theme has no --${name}`);
      return v;
    };
    for (const [fg, bg] of TEXT_PAIRS)
      out.push([`${theme}: ${fg} on ${bg}`, get(fg), get(bg)]);
    for (const g of GROUPS)
      out.push([
        `${theme}: ${g}-fg on ${g}-bg`,
        get(`${g}-fg`),
        get(`${g}-bg`),
      ]);
  }
  return out;
}

test.each(allColourPairs())(
  "%s has contrast of at least 4.5 to 1",
  (_name, fg, bg) => expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5),
);

test("the six group backgrounds differ from each other in both themes", () => {
  for (const theme of ["dark", "light"] as const) {
    const t = tokens(theme);
    const values = GROUPS.map((g) => t[`${g}-bg`]);
    expect(new Set(values).size).toBe(6);
  }
});
