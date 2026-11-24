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

const PAGE_SURFACES = ["background", "card", "muted"];
const NON_TEXT = ["border"];
const isGroup = (name: string) => /^g\d+-(bg|fg)$/.test(name);

/** The colour the focus outline uses, read from tokens.css so it is checked too. */
const focusColour = /outline:\s*\d+px solid var\(--([a-z0-9-]+)\)/.exec(
  css,
)?.[1];

/**
 * The pairs come from the token names, so a new token is checked without
 * editing this test:
 * - a text colour (any token that is not a surface, border or group colour) must
 *   reach 4.5:1 on every page surface;
 * - X-foreground must reach 4.5:1 on the surface X (primary is a button surface);
 * - the border and the focus outline must reach 3:1 on every page surface;
 * - each group's fg on its bg must reach 4.5:1.
 */
function pairsFor(theme: Theme) {
  const t = tokens(theme);
  const names = Object.keys(t);
  const surfaces = [...PAGE_SURFACES, "primary"];
  const textColours = names.filter(
    (n) =>
      !surfaces.includes(n) &&
      !NON_TEXT.includes(n) &&
      !isGroup(n) &&
      n !== "primary-foreground",
  );
  const text: [string, string, string, number][] = [];
  const need = (name: string) => {
    const v = t[name];
    if (!v) throw new Error(`${theme} theme has no --${name}`);
    return v;
  };
  for (const fg of textColours)
    for (const bg of PAGE_SURFACES)
      text.push([`${theme}: ${fg} on ${bg}`, need(fg), need(bg), 4.5]);
  for (const s of surfaces) {
    const fg = s === "background" ? "foreground" : `${s}-foreground`;
    text.push([`${theme}: ${fg} on ${s}`, need(fg), need(s), 4.5]);
  }
  for (const g of new Set(names.filter(isGroup).map((n) => n.split("-")[0]))) {
    text.push([
      `${theme}: ${g}-fg on ${g}-bg`,
      need(`${g}-fg`),
      need(`${g}-bg`),
      4.5,
    ]);
  }
  const nonText = [...NON_TEXT, ...(focusColour ? [focusColour] : [])];
  for (const n of nonText)
    for (const bg of PAGE_SURFACES)
      text.push([`${theme}: ${n} (non-text) on ${bg}`, need(n), need(bg), 3]);
  return text;
}

const allPairs = (["dark", "light"] as const).flatMap(pairsFor);

test("the focus outline colour was found in tokens.css", () =>
  expect(focusColour).toBeDefined());

test("there are at least the pairs we expect", () =>
  expect(allPairs.length).toBeGreaterThan(40));

test.each(allPairs)("%s reaches its contrast", (_name, fg, bg, min) =>
  expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min),
);

test("the six group backgrounds differ from each other in both themes", () => {
  for (const theme of ["dark", "light"] as const) {
    const t = tokens(theme);
    const values = ["g1", "g2", "g3", "g4", "g5", "g6"].map(
      (g) => t[`${g}-bg`],
    );
    expect(new Set(values).size).toBe(6);
  }
});
