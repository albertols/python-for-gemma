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
const MAX_NAME_LENGTH = 200;
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
  /** Streams one upload to disk, checks it, and keeps it only if every check passed. */
  save(input: { name: string; stream: Readable }): Promise<SavedMaterial>;
  open(storedName: string): fs.ReadStream;
  /** Removes a stored file; one that is already gone is not an error. */
  remove(storedName: string): void;
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

function extensionOf(name: string): Extension {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!isExtension(ext))
    throw refuse(
      "material-type",
      `Only ${ACCEPTED_WORDS} files can be attached.`,
    );
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
  let parts: Record<string, Uint8Array>;
  try {
    // only the small types part is ever unpacked: everything else is skipped
    parts = unzipSync(new Uint8Array(fs.readFileSync(file)), {
      filter: (entry) => {
        names.push(entry.name);
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
  if (!types) throw wrongContent(ext);
  const xml = new TextDecoder().decode(types);
  const hasMacros =
    names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n)) ||
    /macroEnabled|vbaProject/i.test(xml);
  if (hasMacros || !xml.includes(`"${check.main}"`)) throw wrongContent(ext);
}

export function createMaterialStore(dir: string): MaterialStore {
  const root = path.resolve(dir);
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
    async save({ name: given, stream }) {
      const name = checkedName(given);
      const ext = extensionOf(name);
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
          if (size > MAX_MATERIAL_BYTES)
            done(
              refuse(
                "material-too-large",
                "That file is over 25 MB, so it was not attached.",
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
      if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile())
        throw new ApiError(
          404,
          "material-missing",
          "That file is no longer on this computer. Attach it again.",
        );
      return fs.createReadStream(file);
    },
    remove(storedName) {
      fs.rmSync(pathOf(storedName), { force: true });
    },
  };
}
