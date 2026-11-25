import { isDeepStrictEqual } from "node:util";
import type { CourseId, IsoDate, SowItem } from "@planner/domain";
import {
  type ImportFinding,
  planningToItems,
  readAssessmentSchedule,
  readPlanningSheet,
  type ScheduleRow,
} from "@planner/importers";
import { ApiError } from "../errors.ts";
import {
  ResourceDenied,
  type ResourceGateway,
} from "../gateway/resource-gateway.ts";
import type { PackStore, Repos } from "../repos/ports.ts";
import { courseOrThrow, requireLockedPack } from "./plan-inputs.ts";

const BOARD_FOLDER = { IAL: "ial", IB: "ibdp", IGCSE: "igcse" } as const;

export interface ImportSources {
  /** Planning sheets (.xlsx) of the course's board folder. */
  planning: string[];
  /** Assessment schedules (.docx) of the course's board folder. */
  schedules: string[];
}
export interface ItemChange {
  id: string;
  title: string;
  change: "added" | "removed" | "changed";
}
export interface SchemePreview {
  items: SowItem[];
  findings: ImportFinding[];
  changes: ItemChange[];
}

/** The course's planning files, through the gateway: its board's folder only. */
async function planningFilesOf(
  gateway: ResourceGateway,
  repos: Repos,
  courseId: CourseId,
): Promise<string[]> {
  const folder = BOARD_FOLDER[courseOrThrow(repos, courseId).board];
  return (await gateway.find("planning-files")).filter(
    (name) => name.split("/")[0]?.toLowerCase() === folder,
  );
}

export async function importSources(
  gateway: ResourceGateway,
  repos: Repos,
  courseId: CourseId,
): Promise<ImportSources> {
  const files = await planningFilesOf(gateway, repos, courseId);
  const ext = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();
  return {
    planning: files.filter((f) => ext(f) === ".xlsx"),
    schedules: files.filter((f) => ext(f) === ".docx"),
  };
}

/** The academic year the calendar's terms start in; without terms, the one `today` is in (July starts it). */
function academicYearOf(repos: Repos, today: IsoDate) {
  const first = repos.settings
    .terms()
    .map((t) => t.firstPupilDay)
    .sort()[0];
  const start = first
    ? Number(first.slice(0, 4))
    : Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
  return { start, end: start + 1 };
}

function changesBetween(
  stored: readonly SowItem[],
  imported: readonly SowItem[],
): ItemChange[] {
  const old = new Map(stored.map((i) => [i.id, i]));
  const kept = new Set(imported.map((i) => i.id));
  const withoutOrder = ({ order: _order, ...rest }: SowItem) => rest;
  return [
    ...imported.flatMap((i): ItemChange[] => {
      const before = old.get(i.id);
      if (before === undefined)
        return [{ id: i.id, title: i.title, change: "added" }];
      return isDeepStrictEqual(withoutOrder(before), withoutOrder(i))
        ? []
        : [{ id: i.id, title: i.title, change: "changed" }];
    }),
    ...stored
      .filter((i) => !kept.has(i.id))
      .map(
        (i): ItemChange => ({ id: i.id, title: i.title, change: "removed" }),
      ),
  ];
}

async function readThroughGateway(
  gateway: ResourceGateway,
  file: string,
): Promise<Uint8Array> {
  try {
    return await gateway.read(file);
  } catch (error) {
    if (error instanceof ResourceDenied)
      throw new ApiError(
        422,
        "unreadable-file",
        "That file could not be read.",
      );
    throw error;
  }
}

/**
 * A preview of her planning sheet (and assessment schedule) as a scheme of
 * work: the items it would make, what the files raise, and what would change
 * in the stored scheme. Nothing is stored; she accepts it by saving the items.
 * Refused (422) when a file is not one of the course's planning files or
 * cannot be read as what it should be, and (409) until the pack is locked.
 */
export async function importScheme(
  deps: { repos: Repos; packs: PackStore; gateway: ResourceGateway },
  courseId: CourseId,
  request: { planningFile: string; scheduleFile: string | null },
  today: IsoDate,
): Promise<SchemePreview> {
  const { repos, packs, gateway } = deps;
  const course = courseOrThrow(repos, courseId);
  requireLockedPack(packs, courseId);
  const pack = packs.locked(courseId);
  if (pack === null)
    throw new ApiError(409, "pack-not-locked", "Lock the pack first.");
  const sources = await importSources(gateway, repos, courseId);
  const chosen: [string, string[]][] = [
    [request.planningFile, sources.planning],
    ...(request.scheduleFile === null
      ? []
      : [[request.scheduleFile, sources.schedules] as [string, string[]]]),
  ];
  for (const [file, allowed] of chosen)
    if (!allowed.includes(file))
      throw new ApiError(
        422,
        "not-a-planning-file",
        "That file is not one of the planning files for this course.",
      );

  const planning = await readPlanningSheet(
    await readThroughGateway(gateway, request.planningFile),
  );
  const schedule: { rows: ScheduleRow[]; findings: ImportFinding[] } =
    request.scheduleFile === null
      ? { rows: [], findings: [] }
      : await readAssessmentSchedule(
          await readThroughGateway(gateway, request.scheduleFile),
          academicYearOf(repos, today),
        );
  const refused = [...planning.findings, ...schedule.findings].filter(
    (f) => f.severity === "error",
  );
  if (refused.length > 0)
    throw new ApiError(
      422,
      "unreadable-planning-file",
      "That file could not be read as a planning sheet or an assessment schedule.",
      refused.map((f) => f.message),
    );

  const made = planningToItems({
    courseId,
    board: course.board,
    planning,
    schedule: schedule.rows,
    pack,
    today,
  });
  return {
    items: made.items,
    findings: [...planning.findings, ...schedule.findings, ...made.findings],
    changes: changesBetween(repos.scheme.items(courseId), made.items),
  };
}
