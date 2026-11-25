import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

  test("the prompt never contains a file path from the resources folder", () => {
    // a caller that smuggles a path in an extra key: the input schema drops it
    const smuggled = {
      ...input,
      fileName: "scheme.xlsx",
      path: "/Users/x/prototypes/resources/year13/scheme.xlsx",
    };
    const p = buildPrompt(lessonCounts, "S", smuggled, "text");
    expect(p).not.toContain("prototypes/resources");
    expect(p).not.toContain("scheme.xlsx");
    // a path inside a permitted field is refused rather than sent
    const inTitle = {
      ...input,
      items: [
        {
          id: "c1",
          title: "../resources/x/prototypes/resources/a",
          lessons: 1,
        },
      ],
    };
    expect(() => buildPrompt(lessonCounts, "S", inTitle, null)).toThrow(
      /resources/,
    );
    expect(() =>
      buildPrompt(lessonCounts, "S", input, "see prototypes/resources/a.pdf"),
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
      expect(readSkillText(real)).toContain("Architecture Visual Docs");
    } finally {
      process.chdir(here);
    }
  });

  test("descriptionOf reads the front-matter description", () => {
    expect(
      descriptionOf("---\nname: x\ndescription: Hello there.\n---\n# body"),
    ).toBe("Hello there.");
    expect(descriptionOf("no front matter")).toBe("");
  });

  test("every registered skill has a SKILL.md and a schema.json that matches its Zod output", () => {
    // skills in PENDING_SKILL_TEXT are skipped: their SKILL.md task has not run
    for (const s of withText) {
      const dir = resolve(repoRoot(), dirname(s.promptPath));
      expect(existsSync(resolve(repoRoot(), s.promptPath)), s.id).toBe(true);
      const onDisk = JSON.parse(
        readFileSync(resolve(dir, "schema.json"), "utf8"),
      );
      expect(onDisk, s.id).toEqual(
        JSON.parse(JSON.stringify(jsonSchemaFor(s))),
      );
    }
  });

  test("every skill still pending is registered, so the list cannot hide a missing skill", () => {
    for (const id of PENDING_SKILL_TEXT) expect(skills[id]?.id).toBe(id);
    for (const s of registered)
      if (!PENDING_SKILL_TEXT.includes(s.id)) expect(withText).toContain(s);
  });

  test("every planner skill's description says it is for the app and not for interactive use", () => {
    for (const s of withText) {
      expect(descriptionOf(readSkillText(s)), s.id).toMatch(
        /^Used by the AI Teacher Planner app \(headless\)\. Not for interactive use\./,
      );
    }
    // the check itself can fail
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
