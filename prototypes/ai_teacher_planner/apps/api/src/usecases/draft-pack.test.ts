import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AiError,
  type BuildCurriculumPackInput,
  type BuildCurriculumPackOutput,
  buildCurriculumPack,
} from "@planner/ai";
import { FakeAiProvider } from "@planner/ai/fake";
import { packIssues } from "@planner/domain";
import {
  pdfWithPages,
  specPages,
  syntheticScannedPdf,
  syntheticSpecPdf,
} from "@planner/fixtures";
import { curriculumPackSchema, extractPdfText } from "@planner/importers";
import { describe, expect, test } from "vitest";
import { ApiError } from "../errors.ts";
import {
  createResourceGateway,
  ResourceDenied,
} from "../gateway/resource-gateway.ts";
import {
  fakeGateway,
  SYNTHETIC_SPEC_PATH,
  syntheticGateway,
  TEXTBOOK_PATH,
} from "../test-support.ts";
import { draftPack } from "./draft-pack.ts";

const SKILL = "planner-build-curriculum-pack";
const args = {
  courseId: "syn-econ",
  specPath: SYNTHETIC_SPEC_PATH,
  chapters: [
    { number: "1", title: "Demand" },
    { number: "2", title: "Supply" },
    { number: "6", title: "Costs" },
  ],
  unitsInScope: ["Unit 1"],
};

/** What a good model would answer for the two-page synthetic specification. */
function goodOutput(): BuildCurriculumPackOutput {
  const point = (
    n: number,
    unitId: string,
    code: string,
    title: string,
    page: number,
    level: "core" | "hl-only" = "core",
  ) => ({ id: `sp${n}`, unitId, code, title, level, page });
  return {
    units: [
      { id: "u1", code: "Unit 1", title: "Markets and prices", inScope: true },
      { id: "u2", code: "Unit 2", title: "Firms and costs", inScope: false },
    ],
    specPoints: [
      point(1, "u1", "1.1", "Demand and the demand curve", 1),
      point(2, "u1", "1.2", "Supply and the supply curve", 1),
      point(3, "u1", "1.3", "Price and equilibrium", 1),
      point(4, "u1", "1.4", "Elasticity of demand", 2, "hl-only"),
      point(5, "u2", "2.1", "Short run and long run costs", 2),
    ],
    chapters: [
      {
        number: "1",
        unitId: "u1",
        links: [
          {
            specPointId: "sp1",
            reason:
              '"Demand" in the chapter title matches "1.1 Demand and the demand curve"',
          },
        ],
      },
      {
        number: "2",
        unitId: "u1",
        links: [
          {
            specPointId: "sp2",
            reason:
              '"Supply" in the chapter title matches "1.2 Supply and the supply curve"',
          },
        ],
      },
      { number: "6", unitId: null, links: [] },
    ],
    unsure: [
      { about: "6", note: "Costs is only in Unit 2, which is out of scope." },
    ],
  };
}

/** The input of the n-th call the fake received. */
function inputOf(fake: FakeAiProvider, n: number): BuildCurriculumPackInput {
  const call = fake.calls[n];
  if (!call) throw new Error(`The fake had no call ${n}`);
  return call.input as BuildCurriculumPackInput;
}

const fakeWith = (...answers: BuildCurriculumPackOutput[]) => {
  let n = 0;
  return new FakeAiProvider({
    [SKILL]: () => answers[Math.min(n++, answers.length - 1)],
  });
};

/** The chapter list with chapter 2 linked to a spec point that does not exist. */
function brokenOutput(): BuildCurriculumPackOutput {
  const out = goodOutput();
  out.chapters[1] = {
    number: "2",
    unitId: "u1",
    links: [{ specPointId: "sp9", reason: '"Supply" matches "1.2 Supply"' }],
  };
  return out;
}

describe("draftPack", () => {
  test("reads the specification through the gateway and sends text, not a path", async () => {
    const fake = fakeWith(goodOutput());
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fake },
      args,
    );

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.attachments).toEqual([]);
    expect(fake.calls[0]?.text).toBeNull();
    const sent = JSON.stringify(fake.calls[0]?.input);
    expect(sent).not.toContain("Specification &");
    expect(sent).not.toContain("ial/");
    const input = inputOf(fake, 0);
    expect(input.pages.map((p) => p.number)).toEqual([1, 2]);
    expect(input.pages[0]?.text).toContain("1.1 Demand and the demand curve");
    expect(input.unitsInScope).toEqual(["Unit 1"]);
    expect(input.chapters).toEqual(args.chapters);

    // the pack she is shown: a valid, unlocked draft
    const { pack } = result;
    expect(curriculumPackSchema.safeParse(pack).success).toBe(true);
    expect(packIssues(pack)).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(pack.courseId).toBe("syn-econ");
    expect(pack.source).toEqual({
      fileName: "IAL BUSINESS SPECIFICATION.pdf",
      pages: 2,
    });
    expect(pack.lockedAt).toBeNull();
    expect(pack.hash).toBeNull();
    expect(pack.specPoints.map((p) => [p.code, p.level, p.page])).toEqual([
      ["1.1", "core", 1],
      ["1.2", "core", 1],
      ["1.3", "core", 1],
      ["1.4", "hl-only", 2],
      ["2.1", "core", 2],
    ]);
    // every chapter she gave appears, with her title; the chapter page is not in a specification
    expect(
      pack.chapters.map((c) => [c.number, c.title, c.specPointIds, c.page]),
    ).toEqual([
      ["1", "Demand", ["sp1"], null],
      ["2", "Supply", ["sp2"], null],
      ["6", "Costs", [], null],
    ]);
    expect(result.meta.skillId).toBe(SKILL);
  });

  test("link reasons and doubts are kept for her review, and the stored pack carries neither", async () => {
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fakeWith(goodOutput()) },
      args,
    );
    expect(result.review.linkReasons).toEqual([
      {
        chapterNumber: "1",
        specPointId: "sp1",
        reason:
          '"Demand" in the chapter title matches "1.1 Demand and the demand curve"',
      },
      {
        chapterNumber: "2",
        specPointId: "sp2",
        reason:
          '"Supply" in the chapter title matches "1.2 Supply and the supply curve"',
      },
    ]);
    expect(result.review.unsure).toEqual([
      { about: "6", note: "Costs is only in Unit 2, which is out of scope." },
    ]);
    expect(JSON.stringify(result.pack)).not.toContain("matches");
    expect(JSON.stringify(result.pack)).not.toContain("unsure");
  });

  test("a chapter whose points are all higher level only is a higher level chapter", async () => {
    const out = goodOutput();
    out.chapters.push({
      number: "7",
      unitId: "u1",
      links: [
        {
          specPointId: "sp4",
          reason: '"Elasticity" matches "1.4 Elasticity of demand"',
        },
      ],
    });
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fakeWith(out) },
      {
        ...args,
        chapters: [...args.chapters, { number: "7", title: "Elasticity" }],
      },
    );
    const by = (n: string) => result.pack.chapters.find((c) => c.number === n);
    expect(by("7")?.hlOnly).toBe(true);
    expect(by("1")?.hlOnly).toBe(false);
    expect(by("6")?.hlOnly).toBe(false);
  });

  test("a path the gateway refuses is never sent to a model", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "draft-pack-"));
    try {
      const root = path.join(base, "resources");
      for (const rel of [SYNTHETIC_SPEC_PATH, TEXTBOOK_PATH]) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(
          path.join(root, rel),
          pdfWithPages([["Invented text"]]),
        );
      }
      const gateway = createResourceGateway(root);
      const fake = fakeWith(goodOutput());
      // the specification is on the allowlist, the textbook beside it is not
      await expect(
        draftPack({ gateway, ai: fake }, { ...args, specPath: TEXTBOOK_PATH }),
      ).rejects.toBeInstanceOf(ResourceDenied);
      expect(fake.calls).toEqual([]);
      await expect(
        draftPack(
          { gateway, ai: fake },
          { ...args, specPath: "../../etc/passwd" },
        ),
      ).rejects.toBeInstanceOf(ResourceDenied);
      expect(fake.calls).toEqual([]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test("a draft that breaks pack rules is returned with its issues, for her to fix in review", async () => {
    // wrong on the first try and on the one repair attempt
    const fake = fakeWith(brokenOutput(), brokenOutput());
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fake },
      args,
    );

    expect(fake.calls).toHaveLength(2);
    expect(result.issues).toContain(
      "Chapter ch2 links to spec point sp9, which does not exist.",
    );
    // the draft itself comes back, broken link and all: nothing is dropped or patched silently
    expect(
      result.pack.chapters.find((c) => c.number === "2")?.specPointIds,
    ).toEqual(["sp9"]);
    expect(result.pack.specPoints).toHaveLength(5);

    // the repair attempt was given the problems and the previous answer, and nothing else new
    const repair = inputOf(fake, 1).repair;
    expect(repair?.problems).toEqual(result.issues);
    expect(repair?.previous).toEqual(brokenOutput());
    expect(inputOf(fake, 0).repair).toBeUndefined();
  });

  test("one repair attempt that fixes the draft leaves no issues", async () => {
    const fake = fakeWith(brokenOutput(), goodOutput());
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fake },
      args,
    );
    expect(fake.calls).toHaveLength(2);
    expect(result.issues).toEqual([]);
    expect(
      result.pack.chapters.find((c) => c.number === "2")?.specPointIds,
    ).toEqual(["sp2"]);
  });

  test("a spec point on a page the specification does not have is an issue, repaired once", async () => {
    const out = goodOutput();
    const fake = fakeWith(out, out);
    out.specPoints = out.specPoints.map((p) =>
      p.code === "1.4" ? { ...p, page: 9 } : p,
    );
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fake },
      args,
    );
    expect(fake.calls).toHaveLength(2);
    expect(result.issues).toEqual([
      "Spec point 1.4 is on page 9, which is not a page of this specification.",
    ]);
  });

  test("a draft that fails the pack schema gets the schema's own issues, once", async () => {
    // every unit out of scope leaves a chapter with no link nowhere to sit: its unit id would be empty
    const out = goodOutput();
    out.units = out.units.map((u) => ({ ...u, inScope: false }));
    const fake = fakeWith(out, out);
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fake },
      args,
    );
    expect(fake.calls).toHaveLength(2);
    expect(result.issues).toContain(
      "chapters.2.unitId: Too small: expected string to have >=1 characters",
    );
    expect(result.issues).toContain(
      "Chapter ch6 is in unit , which does not exist.",
    );
    expect(result.pack.chapters[2]?.unitId).toBe("");
  });

  test("a code that is not on the page it names is an issue: codes must come from the text", async () => {
    const out = goodOutput();
    out.specPoints = out.specPoints.map((p) =>
      p.code === "1.3" ? { ...p, code: "1.9" } : p,
    );
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fakeWith(out) },
      args,
    );
    expect(result.issues).toEqual([
      "Spec point 1.9 is not written on page 1 of the specification.",
    ]);
  });

  test("a chapter the model made up, or left out, is an issue", async () => {
    const out = goodOutput();
    out.chapters = [
      ...out.chapters.slice(0, 1),
      { number: "99", unitId: "u1", links: [] },
    ];
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fakeWith(out) },
      args,
    );
    expect(result.issues).toContain(
      'The model returned a chapter "99" that is not in her list.',
    );
    expect(result.issues).toContain('The model did not return chapter "2".');
    // her list still gives the chapters, unlinked
    expect(result.pack.chapters.map((c) => c.number)).toEqual(["1", "2", "6"]);
  });

  test("a failed repair attempt keeps the first draft and says so", async () => {
    let n = 0;
    const fake = new FakeAiProvider({
      [SKILL]: () => {
        if (n++ === 0) return brokenOutput();
        throw new Error("boom");
      },
    });
    const result = await draftPack(
      { gateway: await syntheticGateway(), ai: fake },
      args,
    );
    expect(fake.calls).toHaveLength(2);
    expect(result.issues[0]).toContain("sp9");
    expect(result.issues.at(-1)).toBe(
      "A second attempt to fix these problems did not work.",
    );
    expect(
      result.pack.chapters.find((c) => c.number === "2")?.specPointIds,
    ).toEqual(["sp9"]);
  });

  test("when the AI is unavailable the error reaches her as it is", async () => {
    const fake = new FakeAiProvider({}, { fail: "signed-out" });
    await expect(
      draftPack({ gateway: await syntheticGateway(), ai: fake }, args),
    ).rejects.toMatchObject({ reason: "signed-out" });
    await expect(
      draftPack({ gateway: await syntheticGateway(), ai: fake }, args),
    ).rejects.toBeInstanceOf(AiError);
  });

  test("more than 150 pages is refused: this is a specification, not a textbook", async () => {
    const pages = Array.from({ length: 151 }, (_, i) => [
      `Page ${i + 1} of an invented book`,
    ]);
    const fake = fakeWith(goodOutput());
    const gateway = fakeGateway({ [SYNTHETIC_SPEC_PATH]: pdfWithPages(pages) });
    const refused = await draftPack({ gateway, ai: fake }, args).catch(
      (e) => e,
    );
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({ status: 422, code: "spec-too-long" });
    expect(refused.message).toContain("151");
    expect(fake.calls).toEqual([]);
  });

  test("exactly 150 pages is accepted", async () => {
    // the real two pages first, so the draft is clean, then filler
    const pages = [
      ...specPages,
      ...Array.from({ length: 148 }, (_, i) => [
        `Page ${i + 3} of an invented book`,
      ]),
    ];
    const fake = fakeWith(goodOutput());
    const gateway = fakeGateway({ [SYNTHETIC_SPEC_PATH]: pdfWithPages(pages) });
    const result = await draftPack({ gateway, ai: fake }, args);
    expect(result.pack.source.pages).toBe(150);
    expect(fake.calls).toHaveLength(1);
  });

  test("a scan with no text layer is refused with a sentence she can act on, before any model call", async () => {
    const fake = fakeWith(goodOutput());
    const gateway = fakeGateway({
      [SYNTHETIC_SPEC_PATH]: syntheticScannedPdf(),
    });
    const refused = await draftPack({ gateway, ai: fake }, args).catch(
      (e) => e,
    );
    expect(refused).toMatchObject({ status: 422, code: "spec-no-text" });
    expect(refused.message).toMatch(/no text/i);
    expect(fake.calls).toEqual([]);
  });
});

test("the input file the controller feeds to pnpm ai:try is the synthetic specification, as extracted", async () => {
  const file = path.join(
    import.meta.dirname,
    "../../../../fixtures/build-curriculum-pack.input.json",
  );
  const input = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(input.pages).toEqual((await extractPdfText(syntheticSpecPdf())).pages);
  expect(buildCurriculumPack.input.safeParse(input).success).toBe(true);
});
