import type { DutyEntry, TimetableEntry } from "@planner/domain";
import type { AiItemView } from "../../api/jobs.ts";

/** The suggested grid an AI item holds, and the cells Claude could not read. */
export interface GridSuggestion {
  versionId: string;
  entries: TimetableEntry[];
  duties: DutyEntry[];
  unsure: {
    week: "W1" | "W2";
    weekday: number;
    period: number;
    note: string;
  }[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** The suggestion in a timetable-grid item, or null when the item is another kind or not of that shape. */
export function gridOf(item: AiItemView): GridSuggestion | null {
  const d = item.data;
  if (
    item.kind !== "timetable-grid" ||
    !isObject(d) ||
    typeof d.versionId !== "string" ||
    !Array.isArray(d.entries) ||
    !Array.isArray(d.duties) ||
    !Array.isArray(d.unsure)
  )
    return null;
  return d as unknown as GridSuggestion;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** "Week 1, Tuesday, period 1": the words the editor's own cells use. */
export function cellName(c: {
  week: "W1" | "W2";
  weekday: number;
  period: number;
}): string {
  return `${c.week === "W1" ? "Week 1" : "Week 2"}, ${DAY_NAMES[c.weekday - 1] ?? `day ${c.weekday}`}, period ${c.period}`;
}

/** The most a picture may weigh: the Messages API image limit, the same as the server's check. */
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** Why this file cannot be sent, as a sentence, or null when it can. The server checks again. */
export function pictureProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (file.type !== "image/png" && file.type !== "image/jpeg")
    return "Choose a PNG or JPG picture.";
  if (file.size > MAX_PICTURE_BYTES)
    return "That picture is over 5 MB. Choose a smaller one, or a screenshot instead of a photo.";
  return null;
}
