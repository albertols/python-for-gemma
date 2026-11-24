import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { isDeniedFolderName, matchesGlob } from "./allowlist.ts";
import {
  createResourceGateway,
  insideRoot,
  ResourceDenied,
  type ResourceGateway,
} from "./resource-gateway.ts";

const CAL = "2026-27 Secondary Calendar ALL STAFF.xlsx";
const UNIT = "ial/1. Content/Y13 Content/Unit 4 Global Business";

let base: string;
let root: string;
let gw: ResourceGateway;

function put(rel: string, text = "x"): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-"));
  root = path.join(base, "resources");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(base, "secret.txt"), "outside the root");
  for (const rel of [
    CAL,
    "timetable.png",
    "calendar_tabs_1.png",
    "ial/Planning/Y13 Unit 4 Planning.xlsx",
    `${UNIT}/PLANNING/notes.docx`,
    `${UNIT}/Content/26 Topic/PP/26 TEACHER.pptx`,
    `${UNIT}/Unit 4 Assessments/marks.xlsx`,
    "igcse/1. Content/Y11 Content/Unit 3/30/Exam Practice/q1.docx",
    "ial/ial Specification & Textbook/IAL BUSINESS SPECIFICATION.pdf",
    "ial/ial Specification & Textbook/IAL Business Student Book 1 Edexcel.pdf",
    "ial/ial Mocks/mock.pdf",
    "ibdp/IA/IA 2026/student1/draft.docx",
    "ibdp/Scanned exams/paper.pdf",
    "ibdp/Planning/plan.docx",
    "ibdp/1. Content/Y12/PP/a.pptx",
    "ibdp/ibdp Textbook & Guide/Business Management Guide.pdf",
    "ibdp/ibdp Textbook & Guide/Textbook.pdf",
    "ibdp/ibdp Textbook & Guide/secret-sibling.txt",
    "igcse/Planning/Y11 IGCSE Assessment Schedule.docx",
    "ial/Planning/sub/f.xlsx",
    `${UNIT}/Unit 4 Assessments/studentA/notes.docx`,
    `${UNIT}/Unit 4 Assessments/studentB/PP/work.pptx`,
    `${UNIT}/Mock Exams/PP/a.pptx`,
    `${UNIT}/Feedback/Planning/a.docx`,
    `${UNIT}/Sample Answers/PP/a.pptx`,
    `${UNIT}/Sample Answer/Exam Practice/a.docx`,
    `${UNIT}/Reports/Planning/a.docx`,
    `${UNIT}/Scanned/PP/a.pdf`,
    `${UNIT}/EE/PP/a.pptx`,
    `${UNIT}/IA/PP/a.pptx`,
    `${UNIT}/IA 2026/PP/a.pptx`,
    `${UNIT}/IAs 2026/PP/a.pptx`,
  ])
    put(rel);
  put(`${UNIT}/PP/real.pptx`, "ok");
  fs.mkdirSync(path.join(root, `${UNIT}/Empty Folder`), { recursive: true });
  fs.mkdirSync(path.join(root, "ial/Planning/empty-dir"), { recursive: true });
  fs.symlinkSync(
    path.join(base, "secret.txt"),
    path.join(root, `${UNIT}/PP/link`),
  );
  fs.symlinkSync(
    path.join(base, "secret.txt"),
    path.join(root, "ial/Planning/link-out.txt"),
  );
  fs.mkdirSync(path.join(base, "elsewhere"));
  fs.writeFileSync(path.join(base, "elsewhere/a.txt"), "no");
  fs.symlinkSync(
    path.join(base, "elsewhere"),
    path.join(root, "ial/Planning/dir-out"),
  );
  // inside the root, allowed name, but pointing at a denied file
  fs.symlinkSync(
    path.join(root, "ibdp/Scanned exams/paper.pdf"),
    path.join(root, "ibdp/Planning/to-denied.pdf"),
  );
  gw = createResourceGateway(root);
});

afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

describe("glob matcher", () => {
  test.each([
    ["*.xlsx", ["a.xlsx"], true],
    ["*.xlsx", ["a", "b.xlsx"], false],
    ["a/**/b", ["a", "b"], true],
    ["a/**/b", ["a", "x", "y", "b"], true],
    ["a/**/b", ["a", "x"], false],
    ["a/**", ["a"], false],
    ["a/**", ["a", "x", "y"], true],
    ["{x,y}/z", ["Y", "Z"], true],
    ["{x,y}/z", ["w", "z"], false],
    ["a.b+c", ["aXb+c"], false],
    ["caf\u00e9/*", ["cafe\u0301", "x"], true],
  ])("%s on %j is %s", (pattern, segments, expected) =>
    expect(matchesGlob(pattern, segments)).toBe(expected),
  );
});

describe("isAllowed", () => {
  test.each([
    CAL,
    "timetable.png",
    "TIMETABLE.PNG",
    "ial/Planning/Y13 Unit 4 Planning.xlsx",
    `${UNIT}/PLANNING/notes.docx`,
    `${UNIT}/Content/26 Topic/PP/26 TEACHER.pptx`,
    "igcse/1. Content/Y11 Content/Unit 3/30/Exam Practice/q1.docx",
    "ial/ial Specification & Textbook/IAL BUSINESS SPECIFICATION.pdf",
    "ibdp/ibdp Textbook & Guide/Business Management Syllabus.pdf",
    "igcse/igcse Textbook and Specification/IGCSE spec.pdf",
  ])("allows %s", (p) => expect(gw.isAllowed(p)).toBe(true));

  test.each([
    "ibdp/IA/IA 2026/student1/draft.docx",
    "ibdp/Scanned exams/paper.pdf",
    `${UNIT}/Unit 4 Assessments/marks.xlsx`,
    "ial/ial Specification & Textbook/IAL Business Student Book 1 Edexcel.pdf",
    "ial/Planning/../ial Mocks/mock.pdf",
    "../outside.txt",
    "/etc/hosts",
    "calendar_tabs_1.png",
    "",
    "ial/Planning",
    "ial/Planning/x\0.txt",
    "/ial/Planning/Y13 Unit 4 Planning.xlsx",
    "ibdp\\Scanned exams\\2026 Secondary Calendar.xlsx",
    "C:2026 Secondary Calendar.xlsx",
    "C:ial/Planning/x.xlsx",
    "ial/Planning/sub/../Y13 Unit 4 Planning.xlsx",
    `${UNIT}/Unit 4 Assessments/studentB/PP/work.pptx`,
  ])("refuses %j", async (p) => {
    expect(gw.isAllowed(p)).toBe(false);
    await expect(gw.read(p)).rejects.toBeInstanceOf(ResourceDenied);
  });
});

describe("deny list on folder names", () => {
  test("a file named for an assessment in an allowed folder is still allowed", () =>
    expect(
      gw.isAllowed("igcse/Planning/Y11 IGCSE Assessment Schedule.docx"),
    ).toBe(true));

  test.each([
    ["assessment", `${UNIT}/Unit 4 Assessments/studentB/PP/work.pptx`],
    ["mock", `${UNIT}/Mock Exams/PP/a.pptx`],
    ["feedback", `${UNIT}/Feedback/Planning/a.docx`],
    ["sample answer", `${UNIT}/Sample Answers/PP/a.pptx`],
    ["report", `${UNIT}/Reports/Planning/a.docx`],
    ["scanned", `${UNIT}/Scanned/PP/a.pdf`],
    ["equals ee", `${UNIT}/EE/PP/a.pptx`],
    ["equals ia", `${UNIT}/IA/PP/a.pptx`],
    ["starts with ia ", `${UNIT}/IA 2026/PP/a.pptx`],
    ["starts with ias ", `${UNIT}/IAs 2026/PP/a.pptx`],
  ])("%s is refused by isAllowed and read", async (_rule, p) => {
    expect(gw.isAllowed(p)).toBe(false);
    await expect(gw.read(p)).rejects.toBeInstanceOf(ResourceDenied);
  });

  test("names near the rules are not caught", () => {
    for (const ok of ["ial", "IAS", "Eeyore", "iambic", "Planning", "ee2"])
      expect(isDeniedFolderName(ok), ok).toBe(false);
  });

  test("a real path through a denied folder is refused", async () => {
    fs.symlinkSync(
      path.join(root, `${UNIT}/Mock Exams`),
      path.join(root, "ial/Planning/via-mock"),
    );
    await expect(
      gw.read("ial/Planning/via-mock/PP/a.pptx"),
    ).rejects.toBeInstanceOf(ResourceDenied);
    fs.rmSync(path.join(root, "ial/Planning/via-mock"));
  });
});

describe("insideRoot", () => {
  test("accepts the root and paths beneath it", () => {
    expect(insideRoot("/r", "/r")).toEqual([]);
    expect(insideRoot("/r", "/r/a/b")).toEqual(["a", "b"]);
    expect(insideRoot("/r", "/r/..hidden/x")).toEqual(["..hidden", "x"]);
  });
  test("refuses siblings, parents and look-alike prefixes", () => {
    expect(insideRoot("/r", "/")).toBeNull();
    expect(insideRoot("/r", "/other")).toBeNull();
    expect(insideRoot("/r", "/r2/a")).toBeNull();
    expect(insideRoot("/r/x", "/r")).toBeNull();
  });
});

describe("read", () => {
  test("an allowed directory is refused, not read", async () => {
    expect(gw.isAllowed("ial/Planning/sub")).toBe(true);
    await expect(gw.read("ial/Planning/sub")).rejects.toBeInstanceOf(
      ResourceDenied,
    );
  });

  test("a file over the size cap is refused", async () => {
    const small = createResourceGateway(root, { maxBytes: 1 });
    expect(
      await small.read("ial/Planning/Y13 Unit 4 Planning.xlsx"),
    ).toHaveLength(1);
    const tiny = createResourceGateway(root, { maxBytes: 0 });
    await expect(
      tiny.read("ial/Planning/Y13 Unit 4 Planning.xlsx"),
    ).rejects.toBeInstanceOf(ResourceDenied);
  });

  test("returns the bytes of an allowed file", async () =>
    expect(
      new TextDecoder().decode(await gw.read(`${UNIT}/PP/real.pptx`)),
    ).toBe("ok"));

  test("a missing allowed file is a denial, not a filesystem error", async () =>
    await expect(gw.read("ial/Planning/none.xlsx")).rejects.toBeInstanceOf(
      ResourceDenied,
    ));

  test("a symlink inside an allowed folder that points outside is refused", async () => {
    await expect(gw.read(`${UNIT}/PP/link`)).rejects.toBeInstanceOf(
      ResourceDenied,
    );
    await expect(gw.read("ial/Planning/link-out.txt")).rejects.toBeInstanceOf(
      ResourceDenied,
    );
    await expect(gw.read("ial/Planning/dir-out/a.txt")).rejects.toBeInstanceOf(
      ResourceDenied,
    );
  });

  test("a symlink to a denied file inside the root is refused", async () =>
    await expect(gw.read("ibdp/Planning/to-denied.pdf")).rejects.toBeInstanceOf(
      ResourceDenied,
    ));

  test("the denial message does not echo file contents or siblings", async () => {
    const asked = "ibdp/ibdp Textbook & Guide/Textbook.pdf";
    const error = await gw.read(asked).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResourceDenied);
    const { message, path: p } = error as ResourceDenied;
    expect(p).toBe(asked);
    expect(message).toContain(asked);
    expect(message).not.toContain("secret-sibling");
    expect(message).not.toContain(base);
    expect(message).not.toContain("Business Management Guide");
  });
});

describe("list", () => {
  test("hides what is not allowed", async () =>
    expect((await gw.list("ibdp")).map((e) => e.name)).toEqual([
      "1. Content",
      "Planning",
      "ibdp Textbook & Guide",
    ]));

  test("inside a specification folder, only the listed PDFs show", async () =>
    expect(
      (await gw.list("ibdp/ibdp Textbook & Guide")).map((e) => e.name),
    ).toEqual(["Business Management Guide.pdf"]));

  test("the root shows the calendar, the timetable and the course folders", async () =>
    expect((await gw.list("")).map((e) => e.name)).toEqual([
      CAL,
      "ial",
      "ibdp",
      "igcse",
      "timetable.png",
    ]));

  test("entries carry kind, size and an ISO modified time", async () => {
    const entry = (await gw.list("ial/Planning")).find(
      (e) => e.name === "Y13 Unit 4 Planning.xlsx",
    );
    expect(entry).toMatchObject({ kind: "file", size: 1 });
    expect(entry?.modifiedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  test("links that leave the root or reach denied files are not listed", async () => {
    expect((await gw.list("ial/Planning")).map((e) => e.name)).toEqual([
      "Y13 Unit 4 Planning.xlsx",
      "sub",
    ]);
    expect((await gw.list("ibdp/Planning")).map((e) => e.name)).toEqual([
      "plan.docx",
    ]);
  });

  test("folders with nothing allowed beneath them are never shown or listed", async () => {
    const names = (await gw.list(UNIT)).map((e) => e.name);
    expect(names).toEqual(["Content", "PLANNING", "PP"]);
    for (const dir of [
      `${UNIT}/Unit 4 Assessments`,
      `${UNIT}/Unit 4 Assessments/studentA`,
      `${UNIT}/Empty Folder`,
      "ial/Planning/empty-dir",
    ])
      await expect(gw.list(dir)).rejects.toBeInstanceOf(ResourceDenied);
    expect(
      (await gw.list("ial/1. Content/Y13 Content")).map((e) => e.name),
    ).toEqual(["Unit 4 Global Business"]);
  });

  test("a link from an allowed folder to a denied folder shows nothing", async () => {
    fs.symlinkSync(
      path.join(root, "ibdp/IA/IA 2026"),
      path.join(root, "ial/Planning/to-ia"),
    );
    expect((await gw.list("ial/Planning")).map((e) => e.name)).not.toContain(
      "to-ia",
    );
    await expect(gw.list("ial/Planning/to-ia")).rejects.toBeInstanceOf(
      ResourceDenied,
    );
    fs.rmSync(path.join(root, "ial/Planning/to-ia"));
  });

  test("a folder whose own name is denied is never shown", async () =>
    expect((await gw.list("ial/Planning")).map((e) => e.name)).not.toContain(
      "via-mock",
    ));

  test("a denied or escaping directory is refused", async () => {
    for (const dir of ["ibdp/IA", "..", "/etc", "ial/Planning/dir-out"])
      await expect(gw.list(dir)).rejects.toBeInstanceOf(ResourceDenied);
  });
});

describe("find", () => {
  test("finds the calendar workbook, and every match when there are two", async () => {
    expect(await gw.find("calendar-workbook")).toEqual([CAL]);
    const second = "2027-28 Secondary Calendar DRAFT.xlsx";
    put(second);
    expect(await gw.find("calendar-workbook")).toEqual([CAL, second]);
    fs.rmSync(path.join(root, second));
  });

  test("finds the timetable image", async () =>
    expect(await gw.find("timetable-image")).toEqual(["timetable.png"]));
});
