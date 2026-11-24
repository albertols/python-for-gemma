/**
 * The allowlist and its glob matcher. Pure: no file access here.
 *
 * Paths are relative to the resources root, split into segments, and compared
 * without regard to letter case. A pattern supports `*` (within one segment),
 * `**` (any number of whole segments) and `{a,b,c}` (alternatives).
 */

export const ALLOWLIST: readonly string[] = [
  "*Secondary Calendar*.xlsx",
  "timetable.png",
  "{ial,ibdp,igcse}/Planning/**",
  "{ial,ibdp,igcse}/1. Content/**/Planning/**",
  "{ial,ibdp,igcse}/1. Content/**/PP/**",
  "{ial,ibdp,igcse}/1. Content/**/Exam Practice/**",
  "ial/ial Specification & Textbook/IAL BUSINESS SPECIFICATION.pdf",
  "ibdp/ibdp Textbook & Guide/Business Management Guide.pdf",
  "ibdp/ibdp Textbook & Guide/Business Management Syllabus.pdf",
  "igcse/igcse Textbook and Specification/IGCSE spec.pdf",
];

/**
 * Folder names that are never allowed, whatever the patterns say. The
 * patterns `**\/PP/**`, `**\/Planning/**` and `**\/Exam Practice/**` would
 * otherwise reach student work filed under assessment, mock, feedback, report,
 * scanned-paper, extended-essay or internal-assessment folders. Narrowing only.
 * Applies to directory segments, never to a file's own name (assessment
 * schedules in Planning folders must stay readable). Compared after NFC and
 * lower-casing.
 */
export const DENIED_FOLDER_NAMES = {
  contains: [
    "assessment",
    "mock",
    "feedback",
    "sample answer",
    "report",
    "scanned",
  ],
  equals: ["ee", "ia"],
  startsWith: ["ia ", "ias "],
} as const;

export function isDeniedFolderName(name: string): boolean {
  const n = fold(name);
  return (
    DENIED_FOLDER_NAMES.contains.some((w) => n.includes(w)) ||
    DENIED_FOLDER_NAMES.equals.some((w) => n === w) ||
    DENIED_FOLDER_NAMES.startsWith.some((w) => n.startsWith(w))
  );
}

export const CALENDAR_WORKBOOK_PATTERN = "*Secondary Calendar*.xlsx";
export const TIMETABLE_IMAGE_PATTERN = "timetable.png";

/** Expand `{a,b}` groups (not nested) into every plain pattern. */
export function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf("{");
  const close = open === -1 ? -1 : pattern.indexOf("}", open);
  if (open === -1 || close === -1) return [pattern];
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  return pattern
    .slice(open + 1, close)
    .split(",")
    .flatMap((alt) => expandBraces(head + alt + tail));
}

/** Canonical form for comparison: composed Unicode, lower case. */
function fold(text: string): string {
  return text.normalize("NFC").toLowerCase();
}

function segmentRegex(segment: string): RegExp {
  const body = fold(segment)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${body}$`);
}

/**
 * Does the pattern (as segments) accept the path (as segments)?
 * `partial`: the path may stop early, as a directory that could lead to a match.
 * A trailing `**` needs at least one segment, so `Planning/**` is not `Planning`.
 */
function matchSegments(
  pattern: readonly string[],
  path: readonly string[],
  partial: boolean,
): boolean {
  const [head, ...rest] = pattern;
  if (head === undefined) return path.length === 0;
  if (head === "**") {
    if (rest.length === 0) return path.length > 0 || partial;
    for (let skip = 0; skip <= path.length; skip++)
      if (matchSegments(rest, path.slice(skip), partial)) return true;
    return false;
  }
  const [first, ...others] = path;
  if (first === undefined) return partial;
  return (
    segmentRegex(head).test(fold(first)) && matchSegments(rest, others, partial)
  );
}

function compile(patterns: readonly string[]): string[][] {
  return patterns.flatMap(expandBraces).map((p) => p.split("/"));
}

const COMPILED = compile(ALLOWLIST);

/** Does one glob match this path (segments, root-relative)? */
export function matchesGlob(pattern: string, segments: string[]): boolean {
  return compile([pattern]).some((p) => matchSegments(p, segments, false));
}

/** Is this file path on the allowlist? */
export function isAllowedSegments(segments: string[]): boolean {
  return (
    segments.length > 0 &&
    !segments.slice(0, -1).some(isDeniedFolderName) &&
    COMPILED.some((p) => matchSegments(p, segments, false))
  );
}

/** Could something allowed live at or beneath this directory? */
export function leadsToAllowed(segments: string[]): boolean {
  return (
    !segments.some(isDeniedFolderName) &&
    COMPILED.some((p) => matchSegments(p, segments, true))
  );
}

/**
 * Split a requested path into clean segments, or null when it must be refused:
 * empty, absolute, a drive letter, a backslash, a NUL byte, or any `..` segment.
 * `.` and doubled slashes are dropped.
 */
export function normaliseRelPath(rel: string): string[] | null {
  if (rel === "" || rel.includes("\0") || rel.includes("\\")) return null;
  if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) return null;
  const parts = rel.split("/");
  if (parts.includes("..")) return null;
  const segments = parts.filter((s) => s !== "" && s !== ".");
  return segments.length === 0 ? null : segments;
}
