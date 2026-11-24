import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The workspace root, prototypes/ai_teacher_planner. */
export const workspaceRoot = join(import.meta.dirname, "../..");

const domainSrc = join(workspaceRoot, "packages/domain/src");

/** Every non-test `.ts` file under `dir`, as absolute paths, sorted. */
function sourceFilesUnder(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
        found.push(path);
    }
  };
  walk(dir);
  return found.sort();
}

/** Every non-test `.ts` file under packages/domain/src, as absolute paths. */
export function domainSourceFiles(): string[] {
  return sourceFilesUnder(domainSrc);
}

/** Every non-test `.ts` file under `src/` of each package and app and under fixtures/src. */
export function workspaceSourceFiles(): string[] {
  return ["packages", "apps"]
    .flatMap((group) =>
      readdirSync(join(workspaceRoot, group), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== "node_modules")
        .map((e) => join(workspaceRoot, group, e.name, "src")),
    )
    .concat(join(workspaceRoot, "fixtures/src"))
    .flatMap((dir) => {
      try {
        return sourceFilesUnder(dir);
      } catch {
        return [];
      }
    })
    .sort();
}

export function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Module specifiers from static imports, re-exports, side-effect imports and dynamic import(). */
export function importSpecifiers(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
    /(?<!["'])\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((re) =>
    [...source.matchAll(re)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])),
  );
}
