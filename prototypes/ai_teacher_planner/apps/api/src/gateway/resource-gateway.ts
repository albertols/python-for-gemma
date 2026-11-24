import fs from "node:fs/promises";
import path from "node:path";
import {
  CALENDAR_WORKBOOK_PATTERN,
  isAllowedSegments,
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

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * The only code that reads the resources folder. Every call is checked against
 * the allowlist twice: on the requested path, and on the real path after
 * symlinks are resolved, which must also stay inside the root.
 */
export function createResourceGateway(rootDir: string): ResourceGateway {
  const rootReal = () => fs.realpath(rootDir);

  /** Root-relative segments of a resolved path, or null if it escapes the root. */
  async function realSegments(absolute: string): Promise<string[] | null> {
    const real = await fs.realpath(absolute);
    const rel = path.relative(await rootReal(), real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return rel === "" ? [] : rel.split(path.sep);
  }

  /** Resolve a directory (root when `segments` is empty) and check it still leads somewhere allowed. */
  async function checkedDir(segments: string[]): Promise<string[] | null> {
    if (segments.length > 0 && !leadsToAllowed(segments)) return null;
    const real = await realSegments(path.join(rootDir, ...segments));
    if (real === null) return null;
    if (real.length > 0 && !leadsToAllowed(real)) return null;
    return real;
  }

  async function list(relDir: string): Promise<ResourceEntry[]> {
    const isRoot = relDir === "" || relDir === ".";
    const segments = isRoot ? [] : normaliseRelPath(relDir);
    if (segments === null) throw new ResourceDenied(relDir);
    try {
      if ((await checkedDir(segments)) === null)
        throw new ResourceDenied(relDir);
      const dirPath = path.join(rootDir, ...segments);
      const entries: ResourceEntry[] = [];
      for (const dirent of await fs.readdir(dirPath, { withFileTypes: true })) {
        const childPath = path.join(dirPath, dirent.name);
        const requested = [...segments, dirent.name];
        try {
          const real = await realSegments(childPath);
          if (real === null) continue;
          const stat = await fs.stat(childPath);
          const isDir = stat.isDirectory();
          const ok = isDir
            ? leadsToAllowed(requested) && leadsToAllowed(real)
            : stat.isFile() &&
              isAllowedSegments(requested) &&
              isAllowedSegments(real);
          if (!ok) continue;
          entries.push({
            name: dirent.name,
            kind: isDir ? "dir" : "file",
            modifiedAt: stat.mtime.toISOString(),
            size: isDir ? 0 : stat.size,
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
      const segments = normaliseRelPath(relPath);
      if (segments === null || !isAllowedSegments(segments))
        throw new ResourceDenied(relPath);
      try {
        const absolute = path.join(rootDir, ...segments);
        const real = await realSegments(absolute);
        if (real === null || !isAllowedSegments(real))
          throw new ResourceDenied(relPath);
        const bytes = await fs.readFile(path.join(await rootReal(), ...real));
        return new Uint8Array(bytes);
      } catch {
        // Missing, a directory, unreadable: all look the same from outside.
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
