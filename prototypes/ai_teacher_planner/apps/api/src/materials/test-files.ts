// Small synthetic files for the upload tests: just enough bytes to pass (or fail) the checks.
import { strToU8, zipSync } from "fflate";

export const CT = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
} as const;

/** A zip holding a [Content_Types].xml that names `main` as its main part. */
export function ooxml(main: string, extra: Record<string, Uint8Array> = {}) {
  const types = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/main.xml" ContentType="${main}"/></Types>`;
  return zipSync({
    "[Content_Types].xml": strToU8(types),
    "main.xml": strToU8("<x/>"),
    ...extra,
  });
}

export const pdf = () => new TextEncoder().encode("%PDF-1.4\n%synthetic\n");
export const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const jpg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
export const text = (s: string) => new TextEncoder().encode(s);
export const plainZip = () => zipSync({ "a.txt": strToU8("hello") });

export const GOOD: Record<string, () => Uint8Array> = {
  pdf,
  png,
  jpg,
  docx: () => ooxml(CT.docx),
  xlsx: () => ooxml(CT.xlsx),
  pptx: () => ooxml(CT.pptx),
};
