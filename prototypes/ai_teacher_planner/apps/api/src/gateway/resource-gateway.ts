import fs from "node:fs/promises";
import path from "node:path";
import {
  CALENDAR_WORKBOOK_PATTERN,
  isAllowedSegments,
  isDeniedFolderName,
  leadsToAllowed,
  matchesGlob,
  normaliseRelPath,
  TIMETABLE_IMAGE_PATTERN,
} from "./allowlist.ts";

/** Thrown for anything off the allowlist. The message names only the requested path. */
export class ResourceDenied extends Error {
  readonly path: string;
  constructor(requested: string) {
    super(`Not allowed: ${JSON.stringify(requested)}`);
    this.name = "ResourceDenied";
    this.path = requested;
  }
}

export interface ResourceEntry {
  name: string;
  kind: "file" | "dir";
  modifiedAt: string;
  size: number;
}

export interface ResourceGateway {
  isAllowed(relPath: string): boolean;
  read(relPath: string): Promise<Uint8Array>;
  list(relDir: string): Promise<ResourceEntry[]>;
  find(pattern: "calendar-workbook" | "timetable-image"): Promise<string[]>;
}

export const MAX_READ_BYTES = 100 * 1024 * 1024;
const MAX_WALK_DEPTH = 32;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * Root-relative segments of `real`, or null when it is outside `rootReal`.
 * Both must already be resolved (no symlinks).
 */
export function insideRoot(rootReal: string, real: string): string[] | null {
  const rel = path.relative(rootReal, real);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
    return null;
  return rel === "" ? [] : rel.split(path.sep);
}

/**
 * The only code that reads the resources folder. Every call is checked against
 * the allowlist twice: on the requested path, and on the real path after
 * symlinks are resolved, which must also stay inside the root.
 */
export function createResourceGateway(
  rootDir: string,
  options: { maxBytes?: number } = {},
): ResourceGateway {
  const maxBytes = options.maxBytes ?? MAX_READ_BYTES;
  const rootReal = () => fs.realpath(rootDir);

  /** Resolve a requested path: its real absolute path and root-relative segments, or null if it escapes. */
  async function resolveReal(
    requested: string[],
  ): Promise<{ abs: string; segments: string[] } | null> {
    const root = await rootReal();
    const real = await fs.realpath(path.join(root, ...requested));
    const segments = insideRoot(root, real);
    return segments === null ? null : { abs: real, segments };
  }

  /** Does the directory hold, at any depth, a file that passes the full read check? */
  async function hasAllowedFile(
    requested: string[],
    abs: string,
    ancestors: Set<string>,
  ): Promise<boolean> {
    if (ancestors.has(abs) || requested.length > MAX_WALK_DEPTH) return false;
    ancestors.add(abs);
    try {
      for (const dirent of await fs.readdir(abs, { withFileTypes: true })) {
        const childRequested = [...requested, dirent.name];
        try {
          const real = await resolveReal(childRequested);
          if (real === null) continue;
          const stat = await fs.stat(real.abs);
          if (stat.isFile()) {
            if (
              isAllowedSegments(childRequested) &&
              isAllowedSegments(real.segments)
            )
              return true;
          } else if (
            stat.isDirectory() &&
            leadsToAllowed(childRequested) &&
            leadsToAllowed(real.segments) &&
            (await hasAllowedFile(childRequested, real.abs, ancestors))
          )
            return true;
        } catch {
          // A broken link or a vanished file is simply not counted.
        }
      }
      return false;
    } finally {
      ancestors.delete(abs);
    }
  }

  async function list(relDir: string): Promise<ResourceEntry[]> {
    const isRoot = relDir === "" || relDir === ".";
    const requested = isRoot ? [] : normaliseRelPath(relDir);
    if (requested === null) throw new ResourceDenied(relDir);
    try {
      const dir = await resolveReal(requested);
      if (dir === null) throw new ResourceDenied(relDir);
      if (!isRoot) {
        if (!leadsToAllowed(requested) || !leadsToAllowed(dir.segments))
          throw new ResourceDenied(relDir);
        if (!(await hasAllowedFile(requested, dir.abs, new Set())))
          throw new ResourceDenied(relDir);
      }
      const entries: ResourceEntry[] = [];
      for (const dirent of await fs.readdir(dir.abs, { withFileTypes: true })) {
        const childRequested = [...requested, dirent.name];
        try {
          const real = await resolveReal(childRequested);
          if (real === null) continue;
          const stat = await fs.stat(real.abs);
          let shown = false;
          if (stat.isFile())
            shown =
              isAllowedSegments(childRequested) &&
              isAllowedSegments(real.segments);
          else if (stat.isDirectory())
            shown =
              !isDeniedFolderName(dirent.name) &&
              leadsToAllowed(childRequested) &&
              leadsToAllowed(real.segments) &&
              (await hasAllowedFile(childRequested, real.abs, new Set()));
          if (!shown) continue;
          entries.push({
            name: dirent.name,
            kind: stat.isDirectory() ? "dir" : "file",
            modifiedAt: stat.mtime.toISOString(),
            size: stat.isDirectory() ? 0 : stat.size,
          });
        } catch {
          // A broken link or a vanished file is simply not listed.
        }
      }
      return entries.sort(byName);
    } catch (error) {
      if (error instanceof ResourceDenied) throw error;
      throw new ResourceDenied(relDir);
    }
  }

  return {
    isAllowed(relPath) {
      const segments = normaliseRelPath(relPath);
      return segments !== null && isAllowedSegments(segments);
    },

    async read(relPath) {
      const requested = normaliseRelPath(relPath);
      if (requested === null || !isAllowedSegments(requested))
        throw new ResourceDenied(relPath);
      try {
        const real = await resolveReal(requested);
        if (real === null || !isAllowedSegments(real.segments))
          throw new ResourceDenied(relPath);
        const stat = await fs.stat(real.abs);
        if (!stat.isFile() || stat.size > maxBytes)
          throw new ResourceDenied(relPath);
        return new Uint8Array(await fs.readFile(real.abs));
      } catch {
        // Missing, a directory, too big, unreadable: all look the same from outside.
        throw new ResourceDenied(relPath);
      }
    },

    list,

    async find(pattern) {
      const glob =
        pattern === "calendar-workbook"
          ? CALENDAR_WORKBOOK_PATTERN
          : TIMETABLE_IMAGE_PATTERN;
      return (await list(""))
        .filter((e) => e.kind === "file" && matchesGlob(glob, [e.name]))
        .map((e) => e.name);
    },
  };
}
