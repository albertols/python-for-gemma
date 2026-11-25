// The only file that imports pdfjs-dist. It uses the legacy build, which runs in Node,
// and no worker: the library then parses on the main thread.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfPageText {
  number: number;
  text: string;
}

/** The text of each page, in the order it was drawn, one line per line of the page. */
export async function extractPdfText(
  data: Uint8Array,
): Promise<{ pages: PdfPageText[] }> {
  // pdfjs takes over (and detaches) the bytes it is given, so give it a copy.
  const loading = getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let doc: Awaited<typeof loading.promise>;
  try {
    doc = await loading.promise;
  } catch {
    throw new Error("This file could not be read as a PDF.");
  }
  try {
    const pages: PdfPageText[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : "";
      }
      pages.push({ number, text: text.trim() });
      page.cleanup();
    }
    return { pages };
  } finally {
    await loading.destroy();
  }
}
