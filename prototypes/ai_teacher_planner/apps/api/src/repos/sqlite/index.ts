import type { Database } from "../../db/connection.ts";
import type { Repos } from "../ports.ts";
import { createAiRepo } from "./ai-repo.ts";
import { createCalendarRepo } from "./calendar-repo.ts";
import { createCorrectionRepo } from "./correction-repo.ts";
import { createCourseRepo } from "./course-repo.ts";
import { createDecisionRepo } from "./decision-repo.ts";
import { createDisruptionRepo } from "./disruption-repo.ts";
import { createEventRepo } from "./event-repo.ts";
import { createExamRepo } from "./exam-repo.ts";
import { createFactRepo } from "./fact-repo.ts";
import { createLessonNoteRepo } from "./lesson-note-repo.ts";
import { createPlanRepo } from "./plan-repo.ts";
import { createSchemeRepo } from "./scheme-repo.ts";
import { createSettingsRepo } from "./settings-repo.ts";
import { createTimetableRepo } from "./timetable-repo.ts";
import { createTodoRepo } from "./todo-repo.ts";

export function createRepos(db: Database): Repos {
  return {
    calendar: createCalendarRepo(db),
    timetable: createTimetableRepo(db),
    settings: createSettingsRepo(db),
    disruptions: createDisruptionRepo(db),
    corrections: createCorrectionRepo(db),
    events: createEventRepo(db),
    exams: createExamRepo(db),
    todos: createTodoRepo(db),
    lessonNotes: createLessonNoteRepo(db),
    ai: createAiRepo(db),
    courses: createCourseRepo(db),
    scheme: createSchemeRepo(db),
    decisions: createDecisionRepo(db),
    facts: createFactRepo(db),
    plans: createPlanRepo(db),
    transaction: (fn) => db.transaction(fn)(),
  };
}
