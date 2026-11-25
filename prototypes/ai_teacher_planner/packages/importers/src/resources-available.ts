import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The one real file the golden test may read. It is on the app's allowlist. */
export const CALENDAR_WORKBOOK_NAME =
  "2026-27 Secondary Calendar ALL STAFF.xlsx";

// packages/importers/src -> the app folder, prototypes/ai_teacher_planner
const APP_DIR = fileURLToPath(new URL("../../../", import.meta.url));

/** PLANNER_RESOURCES_DIR, or `../resources` beside the app folder. */
export function resourcesDir(): string {
  return resolve(APP_DIR, process.env.PLANNER_RESOURCES_DIR ?? "../resources");
}

export function calendarWorkbookPath(): string {
  return resolve(resourcesDir(), CALENDAR_WORKBOOK_NAME);
}

/** True when the school's calendar workbook is where we expect it. */
export function resourcesAvailable(): boolean {
  return existsSync(calendarWorkbookPath());
}
