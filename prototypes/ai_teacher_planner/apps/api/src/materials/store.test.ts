import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { zipSync } from "fflate";
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
    "photo.jpeg",
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
