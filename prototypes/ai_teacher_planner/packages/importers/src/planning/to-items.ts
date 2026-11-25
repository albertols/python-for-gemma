import {
  type CourseId,
  type CurriculumPack,
  defaultDuration,
  defaultSlotUse,
  IMPORTED,
  type IsoDate,
  type SowItem,
} from "@planner/domain";
import type { ScheduleRow } from "../assessment-schedule/read-schedule.ts";
import type { ImportFinding } from "../calendar/read-calendar.ts";
import type { PlanningImport } from "./read-planning.ts";

const warn = (
  kind: ImportFinding["kind"],
  sheetRow: number | null,
  message: string,
): ImportFinding => ({
  kind,
  severity: "warning",
  sheetRow,
  date: null,
  message,
});

/**
 * The chapter numbers a schedule topic names: "Chapters 1-2", "Chapter 3",
 * "Ch 4, 6 and 7". After the word "chapter" when there is one, so that
 * "Unit 4 Chapter 23" is chapter 23 only.
 */
export function chapterNumbersIn(topic: string): string[] {
  const at = topic.search(/\bch(?:apters?|\.|\b)/i);
  const text = at < 0 ? topic : topic.slice(at).replace(/^ch\w*\.?/i, "");
  const numbers: string[] = [];
  for (const m of text.matchAll(/(\d+)(?:\s*(?:-|–|—|to)\s*(\d+))?/gi)) {
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    for (let n = from; n <= Math.max(from, Math.min(to, from + 100)); n++)
      numbers.push(String(n));
  }
  return numbers;
}

/**
 * Turns her planning sheet and assessment schedule into scheme items, in sheet
 * order, with origin `import`. A chapter is linked to the pack chapter of the
 * same number (and takes its id, so a second import keeps every id); one the
 * pack lacks is kept unlinked, with a finding. An assessment goes after the
 * last chapter it names. The board is the course's, not the group's.
 */
export function planningToItems(args: {
  courseId: CourseId;
  board: "IAL" | "IB" | "IGCSE";
  planning: PlanningImport;
  schedule: ScheduleRow[];
  pack: CurriculumPack;
  today: IsoDate;
}): { items: SowItem[]; findings: ImportFinding[] } {
  const { courseId, board, planning, schedule, pack, today } = args;
  const findings: ImportFinding[] = [];
  const base = {
    courseId,
    track: "core" as const,
    prerequisites: [],
    availableFrom: null,
    provenance: IMPORTED,
  };

  const used = new Set<string>();
  const unique = (id: string): string => {
    let candidate = id;
    for (let n = 2; used.has(candidate); n++) candidate = `${id}-${n}`;
    used.add(candidate);
    return candidate;
  };
  const chapters = planning.rows
    .filter((r) => r.kind === "chapter")
    .map((row) => {
      const linked = pack.chapters.find(
        (c) => row.number !== null && c.number === row.number,
      );
      if (linked === undefined)
        findings.push(
          warn(
            "unlinked-chapter",
            row.sheetRow,
            `Row ${row.sheetRow} (${row.number === null ? "no chapter number" : `chapter ${row.number}`}) matches no chapter in the pack, so it is not linked to any spec point.`,
          ),
        );
      const note = [row.countNote, row.extra]
        .filter((t) => t !== null)
        .join("; ");
      const item: SowItem = {
        ...base,
        id: unique(linked?.id ?? `ch${row.number ?? `row${row.sheetRow}`}`),
        order: 0,
        kind: "teaching",
        title: row.title,
        lessons: row.lessons ?? 0,
        packRefs: linked ? [linked.id] : [],
        note: note === "" ? null : note,
        assessment: null,
      };
      return { number: row.number, item };
    });

  // After which sheet position each assessment goes, in schedule order.
  const after = new Map<number, SowItem[]>();
  const taken = new Map<string, number>();
  schedule.forEach((row, i) => {
    const where = `Row ${i + 2} of the schedule`;
    const named = chapterNumbersIn(row.topicText);
    const found = chapters
      .map((c, at) => ({ c, at }))
      .filter(({ c }) => c.number !== null && named.includes(c.number));
    const missing = named.filter((n) => !chapters.some((c) => c.number === n));
    if (found.length === 0) {
      findings.push(
        warn(
          "unparseable-row",
          i + 2,
          `${where} names no chapter that is on the planning sheet, so the assessment was left out.`,
        ),
      );
      return;
    }
    if (missing.length > 0)
      findings.push(
        warn(
          "unparseable-row",
          i + 2,
          `${where} names chapter ${missing.join(", ")}, which is not on the planning sheet.`,
        ),
      );
    const last = found.reduce((a, b) => (b.at > a.at ? b : a));
    const n = (taken.get(last.c.item.id) ?? 0) + 1;
    taken.set(last.c.item.id, n);
    const text = `${row.type} ${row.topicText}`;
    const durationMinutes = defaultDuration(board, row.marks);
    const slotUse = /\bwhole[\s-]*lesson\b/i.test(text)
      ? "whole"
      : /\bin[\s-]*lesson\b/i.test(text)
        ? "in-lesson"
        : defaultSlotUse(durationMinutes);
    const item: SowItem = {
      ...base,
      id: `a-${last.c.item.id}${n === 1 ? "" : `-${n}`}`,
      order: 0,
      kind: "assessment",
      title: row.type === "" ? "Assessment" : row.type,
      lessons: 0,
      packRefs: [],
      note: null,
      assessment: {
        date: row.date.date,
        type: row.type,
        marks: row.marks,
        durationMinutes,
        slotUse,
        status:
          row.date.date !== null && row.date.date < today ? "sat" : "planned",
        covers: found.map(({ c }) => c.item.id),
      },
    };
    after.set(last.at, [...(after.get(last.at) ?? []), item]);
  });

  const items = chapters.flatMap((c, at) => [c.item, ...(after.get(at) ?? [])]);
  items.forEach((item, i) => {
    item.order = i + 1;
  });
  return { items, findings };
}
