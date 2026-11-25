import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { unzipSync } from "fflate";
import { ApiError } from "../errors.ts";

/** Each file may be at most this big (25 MB). */
export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
/** A picture she uploads for the AI to read may be at most this big (5 MB): the Messages API image limit. */
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const MAX_NAME_LENGTH = 200;
/** A half-written upload older than this was left by a crash. */
const PARTIAL_MAX_AGE_MS = 60 * 60 * 1000;
/** The zip part that names what an Office file is; a real one is a few hundred bytes. */
const MAX_TYPES_PART_BYTES = 1024 * 1024;

type Check =
  | { kind: "signature"; bytes: readonly number[] }
  | { kind: "office"; main: string };

/** What the planner accepts: the only place a type is added. The stored name and content type come from here, never from the upload. */
const TYPES = {
  pdf: {
    contentType: "application/pdf",
    check: { kind: "signature", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  },
  png: {
    contentType: "image/png",
    check: {
      kind: "signature",
      bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    },
  },
  jpg: {
    contentType: "image/jpeg",
    check: { kind: "signature", bytes: [0xff, 0xd8, 0xff] },
  },
  docx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    check: {
      kind: "office",
      main: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    },
  },
  xlsx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    check: {
      kind: "office",
      main: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    },
  },
  pptx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    check: {
      kind: "office",
      main: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    },
  },
} as const satisfies Record<string, { contentType: string; check: Check }>;

type Extension = keyof typeof TYPES;
const isExtension = (s: string): s is Extension => Object.hasOwn(TYPES, s);

/** Names that mean the same type; the file is stored under the first, whatever she called it. */
const ALIASES: Record<string, Extension> = { jpeg: "jpg" };

export const ACCEPTED_EXTENSIONS = Object.keys(TYPES) as Extension[];
const ACCEPTED_WORDS =
  "Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, PNG or JPG";

const STORED_NAME = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${ACCEPTED_EXTENSIONS.join("|")})$`,
);
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

// Control characters, line and paragraph separators, zero-width marks and the
// bidirectional overrides that make "report-fdp.exe" look like "report-exe.pdf".
const HIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];
const hasHiddenCharacter = (s: string) =>
  [...s].some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return HIDDEN_RANGES.some(([from, to]) => code >= from && code <= to);
  });

export interface SavedMaterial {
  /** The id in the stored name. */
  id: string;
  /** `<uuid>.<ext>`, the only name used on disk. */
  storedName: string;
  contentType: string;
  size: number;
  /** The name she gave it, normalised. It is kept in the database and shown as text, never used as a path. */
  name: string;
}

export interface MaterialStore {
  /** The most bytes one file may have; the upload reader stops a body that passes it. */
  readonly maxBytes: number;
  /** "25 MB" or "10 MB": the limit in her words. */
  readonly maxWords: string;
  /** Streams one upload to disk, checks it, and keeps it only if every check passed. */
  save(input: { name: string; stream: Readable }): Promise<SavedMaterial>;
  /** The stream and the size of the file on disk. */
  open(storedName: string): { stream: fs.ReadStream; size: number };
  /**
   * For start-up: deletes `<uuid>.<ext>.part` files older than an hour (left by a crash)
   * and counts stored files that no database row names. Nothing else is touched.
   */
  sweep(input: { knownStoredNames: ReadonlySet<string>; now: Date }): {
    partialsRemoved: number;
    withoutRow: number;
  };
  /** Removes a stored file; one that is already gone is not an error. */
  remove(storedName: string): void;
  /** Deletes stored files (only `<uuid>.<ext>` names) last changed more than `maxAgeMs` before `now`; returns how many. */
  removeOlderThan(now: Date, maxAgeMs: number): number;
  /** The full path of a stored file, for code that reads it in the same process. */
  pathOf(storedName: string): string;
}

const refuse = (code: string, message: string, status: 413 | 422 = 422) =>
  new ApiError(status, code, message);

/** The name she gave, normalised, or a refusal. It is never joined to a path. */
export function checkedName(raw: string): string {
  const name = raw.normalize("NFC").trim();
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    /[\\/]/.test(name) ||
    hasHiddenCharacter(name) ||
    [...name].length > MAX_NAME_LENGTH
  )
    throw refuse(
      "material-name",
      "That file name cannot be used. Rename the file so its name has no slashes or hidden characters, and is under 200 characters.",
    );
  return name;
}

function extensionOf(
  name: string,
  accepts: readonly Extension[],
  words: string,
): Extension {
  const dot = name.lastIndexOf(".");
  const raw = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const ext = Object.hasOwn(ALIASES, raw) ? ALIASES[raw] : raw;
  if (!ext || !isExtension(ext) || !accepts.includes(ext))
    throw refuse("material-type", `Only ${words} files can be attached.`);
  return ext;
}

function wrongContent(ext: Extension) {
  return refuse(
    "material-content",
    `That file is not really a .${ext} file, so it was not attached.`,
  );
}

function startsWith(head: Uint8Array, bytes: readonly number[]): boolean {
  return bytes.every((b, i) => head[i] === b);
}

/** Reads the finished file and throws unless its bytes are what its extension says. */
function verify(file: string, ext: Extension): void {
  const check: Check = TYPES[ext].check;
  const fd = fs.openSync(file, "r");
  let head: Uint8Array;
  try {
    head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (check.kind === "signature") {
    if (!startsWith(head, check.bytes)) throw wrongContent(ext);
    return;
  }
  if (!startsWith(head, ZIP_SIGNATURE)) throw wrongContent(ext);
  const names: string[] = [];
  let relsCount = 0;
  let relsBytes = 0;
  let relsOverLimit = false;
  let parts: Record<string, Uint8Array>;
  try {
    // only the small types part is ever unpacked: everything else is skipped
    parts = unzipSync(new Uint8Array(fs.readFileSync(file)), {
      filter: (entry) => {
        names.push(entry.name);
        if (partName(entry.name).endsWith(".rels")) {
          relsCount += 1;
          relsBytes += entry.originalSize;
          // past the caps nothing more is inflated, and the file is refused below
          if (relsCount > MAX_RELS_PARTS || relsBytes > MAX_RELS_BYTES)
            relsOverLimit = true;
          return !relsOverLimit && entry.originalSize <= MAX_TYPES_PART_BYTES;
        }
        return (
          entry.name === "[Content_Types].xml" &&
          entry.originalSize <= MAX_TYPES_PART_BYTES
        );
      },
    });
  } catch {
    throw wrongContent(ext);
  }
  const types = parts["[Content_Types].xml"];
  if (!types || relsOverLimit) throw wrongContent(ext);
  const decoder = new TextDecoder();
  const relationships = Object.entries(parts)
    .filter(([name]) => name !== "[Content_Types].xml")
    .map(([, bytes]) => decoder.decode(bytes));
  // a .rels part too big to read is not read at all, so it is refused
  const relsSeen = names.filter((n) => partName(n).endsWith(".rels")).length;
  if (
    relationships.length !== relsSeen ||
    !isPlainOffice(names, decoder.decode(types), relationships, check.main)
  )
    throw wrongContent(ext);
}

/** A zip entry's name as the package reads it: no leading `/` or `./`, forward slashes, lower case. */
function partName(raw: string): string {
  let name = raw.replaceAll("\\", "/").toLowerCase();
  while (name.startsWith("/") || name.startsWith("./"))
    name = name.slice(name.startsWith("/") ? 1 : 2);
  return name;
}

/** An element's name without its namespace prefix, lower case. */
const localName = (qualified: string | undefined) =>
  (qualified ?? "").split(":").pop()?.toLowerCase() ?? "";

/** The .rels parts together: at most this many, and this many declared bytes. */
const MAX_RELS_PARTS = 500;
const MAX_RELS_BYTES = 5 * 1024 * 1024;

/** Relationship types that pull in something from outside the file when the target is external. */
const REMOTE_RELATIONSHIPS = new Set([
  "attachedtemplate",
  "oleobject",
  "frame",
  "subdocument",
  "package",
]);
const EMBEDDED_DOCUMENT = /\.(docx|xlsx|pptx)$/;

/** Printer settings are the one kind of binary part a document may hold. */
const PRINTER_SETTINGS =
  /^(word|xl|ppt)\/printersettings\/printersettings\d+\.bin$/;

/** Decodes character and entity references; null when one is unknown or the text is not well formed. */
function decodeXml(text: string): string | null {
  if (/&(?!(#x[0-9a-f]+|#[0-9]+|[a-z]+);)/i.test(text)) return null;
  let bad = false;
  const decoded = text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (_all, body: string) => {
      const named: Record<string, string> = {
        lt: "<",
        gt: ">",
        amp: "&",
        quot: '"',
        apos: "'",
      };
      try {
        if (body.startsWith("#x"))
          return String.fromCodePoint(parseInt(body.slice(2), 16));
        if (body.startsWith("#"))
          return String.fromCodePoint(parseInt(body.slice(1), 10));
      } catch {
        bad = true;
        return "";
      }
      const value = named[body.toLowerCase()];
      if (value === undefined) bad = true;
      return value ?? "";
    },
  );
  return bad ? null : decoded;
}

/** One start tag, quoted attribute values (which may hold a `>`) included. */
const TAG = /<([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Reads [Content_Types].xml as XML, not as text: every attribute value is decoded
 * first. The file is refused (fail closed) when anything is macro-enabled, ActiveX or
 * a VBA project, in any attribute or in any part name, when it holds an embedded OLE
 * object or a binary part other than printer settings, when the markup uses a
 * DOCTYPE, comment or CDATA section, or when no Override names the main type.
 */
function isPlainOffice(
  names: readonly string[],
  xml: string,
  relationships: readonly string[],
  main: string,
): boolean {
  if (/<!|<\?(?!xml\b)/i.test(xml.replace(/^\s*<\?xml[^>]*\?>/i, "")))
    return false;
  const seen = new Set<string>();
  for (const raw of names) {
    const name = partName(raw);
    if (seen.has(name)) return false; // two entries of one name: which one counts is a trick
    seen.add(name);
    if (/vbaproject|activex|macrosheet|dialogsheet/.test(name)) return false;
    if (/(^|\/)embeddings\/oleobject/.test(name)) return false;
    if (
      !name.endsWith("/") && // a directory entry holds nothing
      /(^|\/)embeddings\//.test(name) &&
      !EMBEDDED_DOCUMENT.test(name)
    )
      return false;
    if (
      /^(word|xl|ppt)\//.test(name) &&
      name.endsWith(".bin") &&
      !PRINTER_SETTINGS.test(name)
    )
      return false;
  }
  for (const rels of relationships) {
    if (/<!|<\?(?!xml\b)/i.test(rels.replace(/^\s*<\?xml[^>]*\?>/i, "")))
      return false;
    for (const tag of rels.matchAll(TAG)) {
      if (localName(tag[1]) !== "relationship") continue;
      const attributes = new Map<string, string>();
      for (const attribute of (tag[2] ?? "").matchAll(ATTRIBUTE)) {
        const value = decodeXml(attribute[2] ?? attribute[3] ?? "");
        if (value === null) return false;
        attributes.set((attribute[1] ?? "").toLowerCase(), value);
      }
      const type = (attributes.get("type") ?? "").toLowerCase();
      const kind = type.slice(type.lastIndexOf("/") + 1);
      if (
        (attributes.get("targetmode") ?? "").toLowerCase() === "external" &&
        REMOTE_RELATIONSHIPS.has(kind)
      )
        return false;
    }
  }
  let hasMain = false;
  for (const tag of xml.matchAll(TAG)) {
    const element = localName(tag[1]);
    for (const attribute of (tag[2] ?? "").matchAll(ATTRIBUTE)) {
      const value = decodeXml(attribute[2] ?? attribute[3] ?? "");
      if (value === null) return false;
      const lower = value.toLowerCase();
      if (/macro|vbaproject|activex/.test(lower)) return false;
      if (
        element === "override" &&
        attribute[1] === "ContentType" &&
        lower === main.toLowerCase()
      )
        hasMain = true;
    }
  }
  return hasMain;
}

interface StoreOptions {
  /** The types this store keeps (default: all of them). */
  accepts?: readonly Extension[];
  /** The words for them in a refusal. */
  words?: string;
  maxBytes?: number;
}

/** Pictures she uploads for Claude to read (data/uploads): PNG or JPEG, at most 10 MB. */
export function createPictureStore(dir: string): MaterialStore {
  return createMaterialStore(dir, {
    accepts: ["png", "jpg"],
    words: "PNG or JPG",
    maxBytes: MAX_PICTURE_BYTES,
  });
}

export function createMaterialStore(
  dir: string,
  options: StoreOptions = {},
): MaterialStore {
  const root = path.resolve(dir);
  const accepts = options.accepts ?? ACCEPTED_EXTENSIONS;
  const words = options.words ?? ACCEPTED_WORDS;
  const maxBytes = options.maxBytes ?? MAX_MATERIAL_BYTES;
  const maxWords = `${maxBytes / (1024 * 1024)} MB`;
  /** The path of a stored name, which must be exactly `<uuid>.<ext>` and stay inside the folder. */
  const pathOf = (storedName: string) => {
    if (!STORED_NAME.test(storedName))
      throw new Error("That is not a stored material.");
    const file = path.resolve(root, storedName);
    if (path.dirname(file) !== root)
      throw new Error("That is not a stored material.");
    return file;
  };
  return {
    maxBytes,
    maxWords,
    async save({ name: given, stream }) {
      const name = checkedName(given);
      const ext = extensionOf(name, accepts, words);
      const id = randomUUID();
      const storedName = `${id}.${ext}`;
      const final = pathOf(storedName);
      const partial = `${final}.part`;
      fs.mkdirSync(root, { recursive: true });
      let size = 0;
      // Counts as the bytes pass; the first byte over the limit stops the whole copy.
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length;
          if (size > maxBytes)
            done(
              refuse(
                "material-too-large",
                `That file is over ${maxWords}, so it was not attached.`,
                413,
              ),
            );
          else done(null, chunk);
        },
      });
      try {
        await pipeline(
          stream,
          counter,
          fs.createWriteStream(partial, { flags: "wx", mode: 0o600 }),
        );
        verify(partial, ext);
        fs.renameSync(partial, final);
      } catch (err) {
        fs.rmSync(partial, { force: true });
        throw err;
      }
      return {
        id,
        storedName,
        contentType: TYPES[ext].contentType,
        size,
        name,
      };
    },
    open(storedName) {
      const file = pathOf(storedName);
      const info = fs.lstatSync(file, { throwIfNoEntry: false });
      if (!info?.isFile())
        throw new ApiError(
          404,
          "material-missing",
          "That file is no longer on this computer. Attach it again.",
        );
      return { stream: fs.createReadStream(file), size: info.size };
    },
    sweep({ knownStoredNames, now }) {
      const result = { partialsRemoved: 0, withoutRow: 0 };
      if (!fs.existsSync(root)) return result;
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (entry.name.endsWith(".part")) {
          const stored = entry.name.slice(0, -".part".length);
          const file = path.join(root, entry.name);
          if (
            STORED_NAME.test(stored) &&
            now.getTime() - fs.statSync(file).mtimeMs > PARTIAL_MAX_AGE_MS
          ) {
            fs.rmSync(file, { force: true });
            result.partialsRemoved += 1;
          }
        } else if (
          STORED_NAME.test(entry.name) &&
          !knownStoredNames.has(entry.name)
        )
          result.withoutRow += 1;
      }
      return result;
    },
    remove(storedName) {
      fs.rmSync(pathOf(storedName), { force: true });
    },
    removeOlderThan(now, maxAgeMs) {
      if (!fs.existsSync(root)) return 0;
      let removed = 0;
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile() || !STORED_NAME.test(entry.name)) continue;
        const file = path.join(root, entry.name);
        if (now.getTime() - fs.statSync(file).mtimeMs > maxAgeMs) {
          fs.rmSync(file, { force: true });
          removed += 1;
        }
      }
      return removed;
    },
    pathOf,
  };
}
