/**
 * PDFs written by hand, with no library. Every word is INVENTED: this is not an exam
 * board's specification. A real PDF is just numbered objects, a cross-reference table
 * of their byte offsets, and a trailer; plain ASCII text is all these files carry.
 */

const escapeText = (line: string) =>
  line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** One page's content stream: each line moved down the page, in the order given. */
function contentStream(lines: readonly string[]): string {
  const body = lines
    .map((line, i) => `${i === 0 ? "" : "0 -18 Td "}(${escapeText(line)}) Tj`)
    .join("\n");
  return lines.length === 0 ? "" : `BT /F1 12 Tf 56 760 Td\n${body}\nET`;
}

/** A PDF with one page per entry; an empty page has no text layer at all. */
export function pdfWithPages(
  pages: readonly (readonly string[])[],
): Uint8Array {
  // Objects: 1 catalog, 2 page tree, 3 font, then a page and a content stream per page.
  const pageObj = (n: number) => 4 + n * 2;
  const bodies: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, n) => `${pageObj(n)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  pages.forEach((lines, n) => {
    const stream = contentStream(lines);
    bodies.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObj(n) + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  // plain ASCII, so one byte per character (the domain package has no TextEncoder)
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff);
}

/** The lines of the two synthetic specification pages. */
export const specPages: readonly (readonly string[])[] = [
  [
    "Invented Board Economics Specification",
    "Unit 1 Markets and prices",
    "1.1 Demand and the demand curve",
    "1.2 Supply and the supply curve",
    "1.3 Price and equilibrium",
    "Unit 2 Firms and costs",
  ],
  [
    "1.4 Elasticity of demand (higher level only)",
    "2.1 Short run and long run costs",
  ],
];

/** Two pages. Unit 1 is in scope; point 1.4 is higher level only; Unit 2 is out of scope. */
export function syntheticSpecPdf(): Uint8Array {
  return pdfWithPages(specPages);
}

/** One page with no text layer, like a scan. */
export function syntheticScannedPdf(): Uint8Array {
  return pdfWithPages([[]]);
}
