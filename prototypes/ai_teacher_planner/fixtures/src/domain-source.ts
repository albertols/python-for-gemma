import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const domainSrc = join(import.meta.dirname, "../../packages/domain/src");

/** Every non-test `.ts` file under packages/domain/src, as absolute paths. */
export function domainSourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
        found.push(path);
    }
  };
  walk(domainSrc);
  return found.sort();
}

export function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Module specifiers from static imports, re-exports, side-effect imports and dynamic import(). */
export function importSpecifiers(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((re) =>
    [...source.matchAll(re)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])),
  );
}
