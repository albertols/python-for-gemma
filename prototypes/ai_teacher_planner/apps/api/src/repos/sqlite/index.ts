import type { Database } from "../../db/connection.ts";
import type { Repos } from "../ports.ts";
import { createCalendarRepo } from "./calendar-repo.ts";
import { createCorrectionRepo } from "./correction-repo.ts";
import { createDisruptionRepo } from "./disruption-repo.ts";
import { createEventRepo } from "./event-repo.ts";
import { createExamRepo } from "./exam-repo.ts";
import { createSettingsRepo } from "./settings-repo.ts";
import { createTimetableRepo } from "./timetable-repo.ts";

export function createRepos(db: Database): Repos {
  return {
    calendar: createCalendarRepo(db),
    timetable: createTimetableRepo(db),
    settings: createSettingsRepo(db),
    disruptions: createDisruptionRepo(db),
    corrections: createCorrectionRepo(db),
    events: createEventRepo(db),
    exams: createExamRepo(db),
    transaction: (fn) => db.transaction(fn)(),
  };
}
