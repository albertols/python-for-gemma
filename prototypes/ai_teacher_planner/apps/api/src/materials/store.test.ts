import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ApiError } from "../errors.ts";
import { createMaterialStore, MAX_MATERIAL_BYTES } from "./store.ts";
import {
  CT,
  GOOD,
  jpg,
  ooxml,
  pdf,
  plainZip,
  png,
  text,
} from "./test-files.ts";

let root: string;
let dir: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "planner-materials-"));
  dir = path.join(root, "materials");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const from = (bytes: Uint8Array) => Readable.from([Buffer.from(bytes)]);
const files = () => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
const refusal = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
};

test("each accepted type is stored as <uuid>.<ext> with its own content type, and the name is not used on disk", async () => {
  const store = createMaterialStore(dir);
  const types: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  for (const [ext, make] of Object.entries(GOOD)) {
    const bytes = make();
    const saved = await store.save({
      name: `Case study.${ext.toUpperCase()}`,
      stream: from(bytes),
    });
    expect(saved.storedName).toMatch(
      new RegExp(
        `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${ext}$`,
      ),
    );
    expect(saved.contentType).toBe(types[ext]);
    expect(saved.size).toBe(bytes.length);
    expect(saved.name).toBe(`Case study.${ext.toUpperCase()}`);
    expect(fs.readFileSync(path.join(dir, saved.storedName))).toEqual(
      Buffer.from(bytes),
    );
  }
  expect(files()).toHaveLength(6);
});

test("an extension that is not on the list is refused, whatever the bytes are", async () => {
  const store = createMaterialStore(dir);
  for (const name of [
    "logo.svg",
    "page.html",
    "page.htm",
    "macro.docm",
    "macro.xlsm",
    "macro.pptm",
    "tool.exe",
    "script.js",
    "notes.txt",
    "noextension",
    "trailingdot.",
    "report.pdf.exe",
    ".pdf",
  ]) {
    const err = await refusal(store.save({ name, stream: from(pdf()) }));
    expect(err.status, name).toBe(422);
    expect(err.code, name).toBe("material-type");
  }
  expect(files()).toEqual([]);
});

test("the first bytes must match the extension", async () => {
  const store = createMaterialStore(dir);
  const wrong: [string, Uint8Array][] = [
    ["a.pdf", png()],
    ["a.png", pdf()],
    ["a.jpg", png()],
    ["a.pdf", text("<html><script>alert(1)</script></html>")],
    ["a.png", text("<svg xmlns='http://www.w3.org/2000/svg'/>")],
    ["a.docx", text("just text")],
    ["a.docx", pdf()],
    ["a.pdf", new Uint8Array()],
  ];
  for (const [name, bytes] of wrong) {
    const err = await refusal(store.save({ name, stream: from(bytes) }));
    expect(err.code, name).toBe("material-content");
  }
  expect(files()).toEqual([]);
});

test("an Office file needs the zip signature and the right [Content_Types].xml part", async () => {
  const store = createMaterialStore(dir);
  const wrong: [string, Uint8Array][] = [
    ["a.docx", plainZip()],
    ["a.docx", ooxml(CT.xlsx)],
    ["a.xlsx", ooxml(CT.pptx)],
    ["a.pptx", ooxml(CT.docx)],
    // a macro-enabled workbook renamed to .xlsx
    ["a.xlsx", ooxml(CT.xlsm)],
    // the right main part, but a macro project inside
    [
      "a.xlsx",
      ooxml(CT.xlsx, {
        "xl/vbaProject.bin": new Uint8Array([1, 2, 3]),
      }),
    ],
    // a zip whose types part is not at the top
    ["a.docx", zipSync({ "sub/[Content_Types].xml": text(CT.docx) })],
  ];
  for (const [name, bytes] of wrong) {
    const err = await refusal(store.save({ name, stream: from(bytes) }));
    expect(err.code, name).toBe("material-content");
  }
  expect(files()).toEqual([]);
});

test("names that reach outside the folder, or hide their ending, are refused", async () => {
  const store = createMaterialStore(dir);
  for (const name of [
    "../evil.pdf",
    "..\\evil.pdf",
    "/etc/passwd.pdf",
    "C:\\Windows\\x.pdf",
    "a/b.pdf",
    "..",
    ".",
    "",
    "   ",
    "nul\u0000.pdf",
    "tab\t.pdf",
    "report\u202Etxt.pdf", // right-to-left override: shows as report fdp.txt
    "zero\u200Bwidth.pdf",
    `${"x".repeat(250)}.pdf`,
  ]) {
    const err = await refusal(store.save({ name, stream: from(pdf()) }));
    expect(err.code, JSON.stringify(name)).toBe("material-name");
  }
  expect(files()).toEqual([]);
  expect(fs.existsSync(path.join(root, "evil.pdf"))).toBe(false);
});

test("an accented or non-Latin name is kept as written, and Unicode is normalised", async () => {
  const store = createMaterialStore(dir);
  const saved = await store.save({
    name: "Le\u0301çon d'économie 経済.pdf", // a decomposed é
    stream: from(pdf()),
  });
  expect(saved.name).toBe("Léçon d'économie 経済.pdf");
  expect(saved.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
});

test("exactly 25 MB is accepted", async () => {
  const store = createMaterialStore(dir);
  const big = new Uint8Array(MAX_MATERIAL_BYTES);
  big.set(pdf());
  const saved = await store.save({ name: "big.pdf", stream: from(big) });
  expect(saved.size).toBe(MAX_MATERIAL_BYTES);
});

test("a body over 25 MB is stopped while it streams, not after it was all read", async () => {
  const store = createMaterialStore(dir);
  const chunk = Buffer.alloc(64 * 1024);
  chunk.set(pdf());
  let produced = 0;
  const endless = new Readable({
    read() {
      produced += chunk.length;
      // 200 MB on offer: if the store read it all, `produced` would reach this
      this.push(produced > 200 * 1024 * 1024 ? null : chunk);
    },
  });
  const err = await refusal(store.save({ name: "huge.pdf", stream: endless }));
  expect(err.status).toBe(413);
  expect(err.code).toBe("material-too-large");
  expect(produced).toBeLessThan(MAX_MATERIAL_BYTES + 8 * 1024 * 1024);
  expect(files()).toEqual([]); // no half-written file is left
});

test("the store only ever opens or removes files it made, inside its own folder", async () => {
  const store = createMaterialStore(dir);
  const saved = await store.save({ name: "a.pdf", stream: from(pdf()) });
  const outside = path.join(root, "secret.txt");
  fs.writeFileSync(outside, "keep me");
  for (const name of [
    "../secret.txt",
    `../${path.basename(root)}/secret.txt`,
    outside,
    "/etc/passwd",
    "..",
    "x.pdf",
    `${saved.storedName}/../../secret.txt`,
    "secret.txt",
    `${saved.id}.svg`,
  ]) {
    expect(() => store.open(name), name).toThrow(/not a stored material/);
    expect(() => store.remove(name), name).toThrow(/not a stored material/);
  }
  expect(fs.readFileSync(outside, "utf8")).toBe("keep me");
  expect(files()).toEqual([saved.storedName]);
  store.remove(saved.storedName);
  expect(files()).toEqual([]);
  store.remove(saved.storedName); // already gone: not an error
});

test("opening a stored name whose file is gone says so", async () => {
  const store = createMaterialStore(dir);
  const saved = await store.save({ name: "a.jpg", stream: from(jpg()) });
  fs.rmSync(path.join(dir, saved.storedName));
  expect(() => store.open(saved.storedName)).toThrow(
    /no longer on this computer/,
  );
});

const typesXml = (body: string) =>
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${body}</Types>`;
const docxWith = (types: string, parts: Record<string, Uint8Array> = {}) =>
  zipSync({
    "[Content_Types].xml": strToU8(typesXml(types)),
    "word/document.xml": strToU8("<x/>"),
    ...parts,
  });

test("the types part is parsed, not searched: character references, a decoy override and a binary macro part are refused", async () => {
  const store = createMaterialStore(dir);
  // the reviewer's probe: the real main part is macro-enabled, spelled with character references,
  // beside a decoy override that carries the plain docx type
  const probe = docxWith(
    `<Default Extension="bin" ContentType="application/vnd.ms-office.&#118;baProject"/>` +
      `<Override PartName="/decoy.xml" ContentType="${CT.docx}"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macro&#69;nabled.main+xml"/>`,
    { "word/macros.bin": new Uint8Array([1, 2, 3]) },
  );
  const refused: [string, Uint8Array][] = [
    ["probe.docx", probe],
    // hex reference and a named entity in a macro type
    [
      "hex.docx",
      docxWith(
        `<Override PartName="/word/document.xml" ContentType="${CT.docx}"/>` +
          `<Default Extension="bin" ContentType="application/vnd.ms-office.&#x76;baProject"/>`,
      ),
    ],
    // any content type that is macro-enabled, even when the main part is right
    [
      "mixed.docx",
      docxWith(
        `<Override PartName="/word/document.xml" ContentType="${CT.docx}"/>` +
          `<Override PartName="/other.xml" ContentType="${CT.xlsm}"/>`,
      ),
    ],
    // a macro sheet (Excel 4 macros) in a workbook
    [
      "sheet.xlsx",
      docxWith(
        `<Override PartName="/xl/workbook.xml" ContentType="${CT.xlsx}"/>` +
          `<Override PartName="/xl/macrosheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.macrosheet+xml"/>`,
      ),
    ],
    // a binary part under word/, with an innocent types part
    [
      "bin.docx",
      docxWith(
        `<Override PartName="/word/document.xml" ContentType="${CT.docx}"/>`,
        {
          "word/macros.bin": new Uint8Array([1]),
        },
      ),
    ],
    [
      "bin.pptx",
      zipSync({
        "[Content_Types].xml": strToU8(
          typesXml(
            `<Override PartName="/ppt/presentation.xml" ContentType="${CT.pptx}"/>`,
          ),
        ),
        "ppt/activeX/activeX1.bin": new Uint8Array([1]),
      }),
    ],
    // an embedded OLE object
    [
      "ole.docx",
      docxWith(
        `<Override PartName="/word/document.xml" ContentType="${CT.docx}"/>`,
        {
          "word/embeddings/oleObject1.bin": new Uint8Array([1]),
        },
      ),
    ],
    [
      "ole2.xlsx",
      zipSync({
        "[Content_Types].xml": strToU8(
          typesXml(
            `<Override PartName="/xl/workbook.xml" ContentType="${CT.xlsx}"/>`,
          ),
        ),
        "xl/embeddings/oleObject2.docx": new Uint8Array([1]),
      }),
    ],
    // the main type only as a Default (not an Override), or only inside an attribute that is not ContentType
    [
      "decoy.docx",
      docxWith(
        `<Override PartName="/x.xml" Other="${CT.docx}" ContentType="text/plain"/>`,
      ),
    ],
    // a DOCTYPE or entity declaration: refused rather than half-understood
    [
      "entity.docx",
      zipSync({
        "[Content_Types].xml": strToU8(
          `<?xml version="1.0"?><!DOCTYPE Types [<!ENTITY m "macro">]>` +
            typesXml(
              `<Override PartName="/word/document.xml" ContentType="${CT.docx}"/>`,
            ),
        ),
      }),
    ],
    // an entity the parser does not know
    [
      "unknown.docx",
      docxWith(
        `<Override PartName="/word/document.xml" ContentType="${CT.docx}&bogus;"/>`,
      ),
    ],
  ];
  for (const [name, bytes] of refused) {
    const err = await refusal(store.save({ name, stream: from(bytes) }));
    expect(err.code, name).toBe("material-content");
  }
  expect(files()).toEqual([]);
});

test("a valid Office file is accepted whatever quotes its writer used, with printer settings and an embedded image", async () => {
  const store = createMaterialStore(dir);
  const single = docxWith(
    `<Override PartName='/word/document.xml' ContentType='${CT.docx}'/>`,
  );
  const spaced = docxWith(
    `<Default Extension = "png" ContentType = "image/png" /><Override PartName="/word/document.xml"\n ContentType="${CT.docx}"/>`,
  );
  const withPrinter = zipSync({
    "[Content_Types].xml": strToU8(
      typesXml(
        `<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="${CT.xlsx}"/>`,
      ),
    ),
    "xl/printerSettings/printerSettings1.bin": new Uint8Array([1, 2]),
    "xl/media/image1.png": new Uint8Array([1]),
  });
  for (const [name, bytes] of [
    ["single.docx", single],
    ["spaced.docx", spaced],
    ["printer.xlsx", withPrinter],
  ] as const) {
    const saved = await store.save({ name, stream: from(bytes) });
    expect(saved.storedName, name).toMatch(/\.(docx|xlsx)$/);
  }
});

test(".jpeg is accepted like .jpg, checked the same way and stored as .jpg", async () => {
  const store = createMaterialStore(dir);
  const saved = await store.save({
    name: "Phone photo.JPEG",
    stream: from(jpg()),
  });
  expect(saved.storedName).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  expect(saved.contentType).toBe("image/jpeg");
  expect(saved.name).toBe("Phone photo.JPEG");
  const plain = await store.save({ name: "a.jpg", stream: from(jpg()) });
  expect(plain.storedName).toMatch(/\.jpg$/);
  for (const bytes of [png(), pdf(), text("<html>")]) {
    const err = await refusal(
      store.save({ name: "fake.jpeg", stream: from(bytes) }),
    );
    expect(err.code).toBe("material-content");
  }
});

test("open reports the size of the file on disk", async () => {
  const store = createMaterialStore(dir);
  const saved = await store.save({ name: "a.pdf", stream: from(pdf()) });
  fs.appendFileSync(path.join(dir, saved.storedName), "more");
  const opened = store.open(saved.storedName);
  expect(opened.size).toBe(pdf().length + 4);
  // read it to the end so the file is closed before the folder goes
  let length = 0;
  for await (const chunk of opened.stream) length += (chunk as Buffer).length;
  expect(length).toBe(opened.size);
});

test("the start-up sweep removes old .part files, counts files with no row, and touches nothing else", async () => {
  const store = createMaterialStore(dir);
  const known = await store.save({ name: "a.pdf", stream: from(pdf()) });
  const orphan = await store.save({ name: "b.pdf", stream: from(pdf()) });
  const uuid = "11111111-2222-3333-4444-555555555555";
  const now = new Date("2026-11-25T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const put = (name: string, age: number) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, "x");
    fs.utimesSync(p, ago(age), ago(age));
  };
  put(`${uuid}.pdf.part`, 2 * 3600_000);
  put(`${uuid.replace("1", "2")}.png.part`, 30 * 60_000);
  put("notes.txt", 5 * 3600_000);
  put("old.part", 5 * 3600_000); // not one of ours by name: left alone
  const result = store.sweep({
    knownStoredNames: new Set([known.storedName]),
    now,
  });
  expect(result).toEqual({ partialsRemoved: 1, withoutRow: 1 });
  expect(files().sort()).toEqual(
    [
      known.storedName,
      orphan.storedName,
      `${uuid.replace("1", "2")}.png.part`,
      "notes.txt",
      "old.part",
    ].sort(),
  );
  // a folder that does not exist yet is fine
  expect(
    createMaterialStore(path.join(root, "nope")).sweep({
      knownStoredNames: new Set(),
      now,
    }),
  ).toEqual({
    partialsRemoved: 0,
    withoutRow: 0,
  });
});

const MAIN = `<Override PartName="/word/document.xml" ContentType="${CT.docx}"/>`;
const rels = (body: string) =>
  strToU8(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`,
  );
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

test("under embeddings/ only .docx, .xlsx and .pptx are allowed, whatever the case", async () => {
  const store = createMaterialStore(dir);
  for (const entry of [
    "word/embeddings/Microsoft_Word_97_-_2003_Document.doc",
    "word/embeddings/sheet.XLS",
    "ppt/embeddings/slides.ppt",
    "word/embeddings/data.bin",
    "word/embeddings/macro.docm",
    "xl/embeddings/macro.XLSM",
    "ppt/embeddings/macro.pptm",
    "word/embeddings/noextension",
    "word/embeddings/sub/evil.exe",
  ]) {
    const err = await refusal(
      store.save({
        name: "a.docx",
        stream: from(docxWith(MAIN, { [entry]: new Uint8Array([1]) })),
      }),
    );
    expect(err.code, entry).toBe("material-content");
  }
  expect(files()).toEqual([]);
  for (const entry of [
    "word/embeddings/Microsoft_Excel_Sheet1.xlsx",
    "word/embeddings/Table.XLSX",
    "ppt/embeddings/deck.pptx",
  ])
    await store.save({
      name: "ok.docx",
      stream: from(docxWith(MAIN, { [entry]: new Uint8Array([1]) })),
    });
});

test("two entries with the same name, in any case, are refused", async () => {
  const store = createMaterialStore(dir);
  const types = strToU8(typesXml(MAIN));
  // fflate's zipSync cannot write duplicates, so the second entry is added to the bytes by hand
  const dup = (a: string, b: string) => {
    const first = zipSync({ [a]: types, "word/document.xml": strToU8("<x/>") });
    return appendEntry(first, b, types);
  };
  for (const [a, b] of [
    ["[Content_Types].xml", "[Content_Types].xml"],
    ["[Content_Types].xml", "[content_types].xml"],
    ["word/document.xml", "WORD/Document.xml"],
  ] as const) {
    const bytes =
      a === "word/document.xml"
        ? appendEntry(docxWith(MAIN), b, strToU8("<y/>"))
        : dup(a, b);
    const err = await refusal(
      store.save({ name: "dup.docx", stream: from(bytes) }),
    );
    expect(err.code, `${a} / ${b}`).toBe("material-content");
  }
  expect(files()).toEqual([]);
  // the hand-made zip itself is sound: with a name that is not a repeat it is accepted
  const sound = appendEntry(docxWith(MAIN), "word/other.xml", strToU8("<y/>"));
  expect(
    (await store.save({ name: "sound.docx", stream: from(sound) })).storedName,
  ).toMatch(/\.docx$/);
});

test("an xl/macrosheets part covered only by a Default xml type is refused, as are dialog sheets", async () => {
  const store = createMaterialStore(dir);
  for (const entry of [
    "xl/macrosheets/sheet1.xml",
    "xl/dialogsheets/sheet1.xml",
  ]) {
    const bytes = zipSync({
      "[Content_Types].xml": strToU8(
        typesXml(
          `<Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT.xlsx}"/>`,
        ),
      ),
      [entry]: strToU8("<x/>"),
    });
    const err = await refusal(
      store.save({ name: "a.xlsx", stream: from(bytes) }),
    );
    expect(err.code, entry).toBe("material-content");
  }
});

test("part names are read without a leading / or ./ before every rule", async () => {
  const store = createMaterialStore(dir);
  for (const entry of [
    "/word/x.bin",
    "./word/x.bin",
    "/./word/embeddings/x.doc",
    "/xl/macrosheets/s.xml",
    "./word/vbaProject.bin",
  ]) {
    const err = await refusal(
      store.save({
        name: "a.docx",
        stream: from(docxWith(MAIN, { [entry]: new Uint8Array([1]) })),
      }),
    );
    expect(err.code, entry).toBe("material-content");
  }
});

test("a remote template, OLE link, frame, subdocument or package is refused; an external hyperlink is fine", async () => {
  const store = createMaterialStore(dir);
  for (const type of [
    "attachedTemplate",
    "oleObject",
    "frame",
    "subDocument",
    "package",
  ]) {
    const bytes = docxWith(MAIN, {
      "word/_rels/settings.xml.rels": rels(
        `<Relationship Id="rId1" Type="${REL}/${type}" Target="https://evil.example/t.dotm" TargetMode="External"/>`,
      ),
    });
    const err = await refusal(
      store.save({ name: "a.docx", stream: from(bytes) }),
    );
    expect(err.code, type).toBe("material-content");
  }
  // single quotes, lower-case mode, a character reference in the type: still refused
  for (const rel of [
    `<Relationship Id='r' Type='${REL}/attachedTemplate' Target='http://x/y' TargetMode='External'/>`,
    `<Relationship Id="r" Type="${REL}/attachedTemplate" Target="http://x/y" TargetMode="external"/>`,
    `<Relationship Id="r" Type="${REL}/attached&#84;emplate" Target="http://x/y" TargetMode="External"/>`,
  ]) {
    const bytes = docxWith(MAIN, { "_rels/.rels": rels(rel) });
    const err = await refusal(
      store.save({ name: "a.docx", stream: from(bytes) }),
    );
    expect(err.code, rel).toBe("material-content");
  }
  expect(files()).toEqual([]);
  const fine = docxWith(MAIN, {
    "word/_rels/document.xml.rels": rels(
      `<Relationship Id="rId1" Type="${REL}/hyperlink" Target="https://example.org" TargetMode="External"/>` +
        `<Relationship Id="rId2" Type="${REL}/oleObject" Target="embeddings/x.xlsx"/>`,
    ),
  });
  expect(
    (await store.save({ name: "fine.docx", stream: from(fine) })).storedName,
  ).toMatch(/\.docx$/);
});

/** Adds one more local-file entry (stored, not compressed) to a zip, even when the name is already there. */
function appendEntry(
  zip: Uint8Array,
  name: string,
  data: Uint8Array,
): Uint8Array {
  const buf = Buffer.from(zip);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  const nameBytes = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(cdOffset, 42);
  const head = buf.subarray(0, cdOffset);
  const cd = buf.subarray(cdOffset, cdOffset + cdSize);
  const newLocalOffset = head.length;
  central.writeUInt32LE(newLocalOffset, 42);
  const tail = Buffer.from(buf.subarray(eocd));
  const newCdOffset =
    newLocalOffset + local.length + nameBytes.length + data.length;
  tail.writeUInt16LE(count + 1, 8);
  tail.writeUInt16LE(count + 1, 10);
  tail.writeUInt32LE(cdSize + central.length + nameBytes.length, 12);
  tail.writeUInt32LE(newCdOffset, 16);
  return new Uint8Array(
    Buffer.concat([
      head,
      local,
      nameBytes,
      Buffer.from(data),
      cd,
      central,
      nameBytes,
      tail,
    ]),
  );
}
function crc32(data: Uint8Array): number {
  let c = ~0;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
