import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { AiError } from "./port.ts";
import {
  buildPrompt,
  descriptionOf,
  getSkill,
  jsonSchemaFor,
  PENDING_SKILL_TEXT,
  readSkillText,
  repoRoot,
  skillFileProblems,
  skills,
} from "./registry.ts";

const lessonCounts = getSkill("planner-suggest-lesson-counts");
const input = {
  courseTitle: "Synthetic Business",
  mode: "split",
  items: [{ id: "c1", title: "Chapter one", lessons: null }],
  unitTotals: [{ unitId: "u1", lessons: 12 }],
};
const registered = Object.values(skills).filter((s) => s !== undefined);
const withText = registered.filter((s) => !PENDING_SKILL_TEXT.includes(s.id));

describe("buildPrompt", () => {
  test("the prompt holds the skill text, then the input as JSON, then the extracted text, in that order", () => {
    const p = buildPrompt(
      lessonCounts,
      "SKILL-TEXT-MARK",
      input,
      "EXTRACTED-TEXT-MARK",
    );
    const a = p.indexOf("SKILL-TEXT-MARK");
    const b = p.indexOf(JSON.stringify(input, null, 2));
    const c = p.indexOf("EXTRACTED-TEXT-MARK");
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  test("with no extracted text the prompt ends after the input", () => {
    const p = buildPrompt(lessonCounts, "S", input, null);
    expect(p).toContain(JSON.stringify(input, null, 2));
    expect(p).not.toContain("Extracted text");
    expect(p.trimEnd().endsWith("```")).toBe(true);
  });

  test("second line of defence: a path into the resources folder is refused, however it is written", () => {
    // The real guard is that skills receive extracted text only; this catches a path that got into a field.
    // a caller that smuggles a path in an extra key: the input schema drops it
    const smuggled = {
      ...input,
      fileName: "scheme.xlsx",
      path: "/Users/x/prototypes/resources/year13/scheme.xlsx",
    };
    const p = buildPrompt(lessonCounts, "S", smuggled, "text");
    expect(p).not.toContain("prototypes/resources");
    expect(p).not.toContain("scheme.xlsx");
    const titled = (title: string) => ({
      ...input,
      items: [{ id: "c1", title, lessons: 1 }],
    });
    const refused = [
      "/Users/x/prototypes/resources/a",
      "Prototypes/Resources/a",
      "PROTOTYPES/resources",
      "prototypes//resources/a",
      "prototypes/./resources/a",
      "prototypes/x/../resources/a",
      "prototypes\\resources\\a",
      "../resources/a",
      "..\\resources\\a",
      "../../resources/a",
      "resources/year13/a.xlsx",
      "Resources/a",
    ];
    for (const title of refused)
      expect(
        () => buildPrompt(lessonCounts, "S", titled(title), null),
        title,
      ).toThrow(/resources/);
    for (const text of [
      "see prototypes/resources/a.pdf",
      "see ../resources/a.pdf",
      "line one\nresources/a.pdf",
      "PROTOTYPES\\Resources\\a",
    ])
      expect(() => buildPrompt(lessonCounts, "S", input, text), text).toThrow(
        /resources/,
      );
    // ordinary words are fine
    expect(() =>
      buildPrompt(
        lessonCounts,
        "S",
        titled("Human resources and finance"),
        "Use resources wisely",
      ),
    ).not.toThrow();
  });

  test("the configured resources folder, passed in, is refused too", () => {
    const root = "/Volumes/School Share/Teaching Files";
    const inTitle = {
      ...input,
      items: [{ id: "c1", title: `${root}/Y13/a.docx`, lessons: 1 }],
    };
    expect(() => buildPrompt(lessonCounts, "S", inTitle, null)).not.toThrow();
    expect(() =>
      buildPrompt(lessonCounts, "S", inTitle, null, { resourcesRoot: root }),
    ).toThrow(/resources/);
    expect(() =>
      buildPrompt(lessonCounts, "S", input, `at ${root.toUpperCase()}/x`, {
        resourcesRoot: `${root}/`,
      }),
    ).toThrow(/resources/);
  });

  test("an input that does not match the skill's schema is refused", () => {
    expect(() =>
      buildPrompt(lessonCounts, "S", { courseTitle: 3 }, null),
    ).toThrow();
  });
});

describe("registry", () => {
  test("getSkill for an unregistered id throws with the id in the message", () => {
    expect(() => getSkill("content-cover-lesson")).toThrow(
      /content-cover-lesson/,
    );
  });

  test("the first registered skill takes and returns the shapes in the contract", () => {
    expect(lessonCounts.model).toBe("sonnet");
    expect(lessonCounts.tools).toEqual([]);
    expect(lessonCounts.promptPath).toBe(
      ".claude/skills/planner-suggest-lesson-counts/SKILL.md",
    );
    expect(lessonCounts.input.safeParse(input).success).toBe(true);
    expect(
      lessonCounts.input.safeParse({ ...input, mode: "other" }).success,
    ).toBe(false);
    expect(
      lessonCounts.output.safeParse({
        suggestions: [{ itemId: "c1", lessons: 2, reason: "r", tricky: false }],
      }).success,
    ).toBe(true);
    for (const lessons of [-1, 1.5])
      expect(
        lessonCounts.output.safeParse({
          suggestions: [{ itemId: "c1", lessons, reason: "r", tricky: false }],
        }).success,
      ).toBe(false);
    expect(
      lessonCounts.input.safeParse({
        ...input,
        unitTotals: [{ unitId: "u1", lessons: 2.5 }],
      }).success,
    ).toBe(false);
    expect(
      lessonCounts.output.safeParse({ suggestions: [{ itemId: "c1" }] })
        .success,
    ).toBe(false);
  });

  test("jsonSchemaFor describes the Zod output", () => {
    const schema = jsonSchemaFor(lessonCounts) as {
      type: string;
      properties: { suggestions: { items: { required: string[] } } };
    };
    expect(schema.type).toBe("object");
    expect(schema.properties.suggestions.items.required.sort()).toEqual([
      "itemId",
      "lessons",
      "reason",
      "tricky",
    ]);
  });

  test("a skill's promptPath is read from the repo root, whatever the working directory", () => {
    const planner = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    expect(repoRoot()).toBe(resolve(planner, "../.."));
    expect(
      existsSync(
        resolve(repoRoot(), ".claude/skills/architecture-visual-docs/SKILL.md"),
      ),
    ).toBe(true);
    const here = process.cwd();
    try {
      process.chdir("/");
      // a skill whose text exists: borrow a real SKILL.md through a fake definition
      const real = {
        ...lessonCounts,
        promptPath: ".claude/skills/architecture-visual-docs/SKILL.md",
      };
      expect(descriptionOf(readSkillText(real))).toContain("diagrams");
    } finally {
      process.chdir(here);
    }
  });

  test("readSkillText refuses a path outside .claude/skills", () => {
    for (const promptPath of [
      "package.json",
      ".claude/skills/../settings.json",
      "../../.env",
      ".claude/skills/x/../../../outside.md",
    ])
      expect(
        () => readSkillText({ ...lessonCounts, promptPath }),
        promptPath,
      ).toThrow(/\.claude\/skills/);
  });

  test("descriptionOf reads the front-matter description", () => {
    expect(
      descriptionOf("---\nname: x\ndescription: Hello there.\n---\n# body"),
    ).toBe("Hello there.");
    expect(descriptionOf("no front matter")).toBe("");
  });

  test("the registry and the pending list agree with the files on disk", () => {
    // pending: no SKILL.md yet. Not pending: SKILL.md, matching schema.json, ruling-41 description.
    // Every planner-* and content-* SKILL.md on disk is checked too, registered or not.
    expect(skillFileProblems(repoRoot(), PENDING_SKILL_TEXT)).toEqual([]);
    expect(registered.length).toBeGreaterThan(0);
    expect(new Set(PENDING_SKILL_TEXT).size).toBe(PENDING_SKILL_TEXT.length);
    expect(withText.length + PENDING_SKILL_TEXT.length).toBe(registered.length);
    for (const id of PENDING_SKILL_TEXT) expect(skills[id]?.id).toBe(id);
    for (const s of registered)
      expect(s.promptPath).toBe(`.claude/skills/${s.id}/SKILL.md`);
  });

  describe("skillFileProblems catches what the pending list could hide", () => {
    const id = "planner-suggest-lesson-counts";
    const goodText = (d: string) =>
      `---\nname: ${id}\ndescription: ${d}\n---\nbody\n`;
    const APP =
      "Used by the AI Teacher Planner app (headless). Not for interactive use. Suggests counts.";
    const fakeRoot = (files: Record<string, string>) => {
      const root = mkdtempSync(join(tmpdir(), "planner-skills-"));
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), text);
      }
      return root;
    };

    test("a SKILL.md for a skill still in the pending list is a problem", () => {
      const root = fakeRoot({
        [`.claude/skills/${id}/SKILL.md`]: goodText(APP),
      });
      const problems = skillFileProblems(root, [id]);
      expect(problems.join("\n")).toMatch(
        /planner-suggest-lesson-counts.*PENDING_SKILL_TEXT/,
      );
    });

    test("a pending skill with no SKILL.md is fine", () => {
      expect(skillFileProblems(fakeRoot({}), [id])).toEqual([]);
    });

    test("a live skill with no SKILL.md, or a stale schema.json, is a problem", () => {
      expect(skillFileProblems(fakeRoot({}), []).join()).toMatch(/SKILL\.md/);
      const stale = fakeRoot({
        [`.claude/skills/${id}/SKILL.md`]: goodText(APP),
        [`.claude/skills/${id}/schema.json`]: "{}",
      });
      expect(skillFileProblems(stale, []).join()).toMatch(/schema\.json/);
      const current = fakeRoot({
        [`.claude/skills/${id}/SKILL.md`]: goodText(APP),
        [`.claude/skills/${id}/schema.json`]: JSON.stringify(
          jsonSchemaFor(lessonCounts),
        ),
      });
      expect(skillFileProblems(current, [])).toEqual([]);
    });

    test("a planner or content SKILL.md with an interactive-looking description is a problem, registered or not", () => {
      const root = fakeRoot({
        ".claude/skills/content-not-registered/SKILL.md":
          goodText("Make slides."),
        ".claude/skills/planner-run-and-verify/SKILL.md": goodText("Run it."),
        ".claude/skills/lesson-creator/SKILL.md": goodText("Anything."),
      });
      const problems = skillFileProblems(root, [id]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/content-not-registered.*description/);
    });
  });

  test("the ruling-41 description pattern can fail", () => {
    expect(descriptionOf("---\ndescription: Make slides.\n---\n")).not.toMatch(
      /^Used by the AI Teacher Planner app \(headless\)\./,
    );
  });

  test("an AiError carries its reason", () => {
    const e = new AiError("timeout");
    expect(e.reason).toBe("timeout");
    expect(e).toBeInstanceOf(Error);
  });
});
