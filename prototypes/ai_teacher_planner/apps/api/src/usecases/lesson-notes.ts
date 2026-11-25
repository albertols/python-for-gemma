import { lessonsFor } from "@planner/domain";
import { ApiError } from "../errors.ts";
import type { SavedMaterial } from "../materials/store.ts";
import type {
  Repos,
  StoredLessonNote,
  StoredMaterial,
} from "../repos/ports.ts";

export const MAX_LESSON_NOTE_CHARACTERS = 2000;

const key = (groupId: string, lessonId: string) =>
  `${groupId}\u0000${lessonId}`;
/** A content lesson's id: the scheme item and the lesson's number, such as `ch3#2`. */
const CONTENT_LESSON = /^[^#]{1,80}#[1-9][0-9]{0,3}$/;

/** What the browser is told about one attached file. The stored name never leaves the server. */
export interface MaterialView {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}
export interface LessonNoteView {
  groupId: string;
  lessonId: string;
  text: string;
  materials: MaterialView[];
}
export interface RemovedLessonNote extends LessonNoteView {
  title: string;
}

export const materialView = (m: StoredMaterial): MaterialView => ({
  id: m.id,
  name: m.name,
  contentType: m.contentType,
  size: m.size,
  createdAt: m.createdAt,
});

const viewOf = (
  groupId: string,
  lessonId: string,
  note: StoredLessonNote | null,
): LessonNoteView => ({
  groupId,
  lessonId,
  text: note?.text ?? "",
  materials: (note?.materials ?? []).map(materialView),
});

/**
 * Notes and files belong to content lessons only. A spare lesson's id changes on
 * every re-plan, so it is refused; so is an id that is not a lesson's, and a group
 * that does not exist.
 */
export function checkedLesson(repos: Repos, groupId: string, lessonId: string) {
  if (lessonId.startsWith("flex:"))
    throw new ApiError(
      422,
      "spare-lesson",
      "A spare lesson has no notes. Notes go on the lessons from the scheme of work.",
    );
  if (!CONTENT_LESSON.test(lessonId))
    throw new ApiError(
      422,
      "invalid-lesson",
      "That is not the id of a lesson from the scheme of work.",
    );
  if (!repos.timetable.groups().some((g) => g.id === groupId))
    throw new ApiError(404, "no-such-group", "There is no such group.");
}

/** Every content lesson in the plans' heads, with its name. */
function lessonsInPlans(repos: Repos): Map<string, string> {
  const named = new Map<string, string>();
  for (const head of repos.plans.heads()) {
    const items = new Map(
      repos.scheme.items(head.planId).map((i) => [i.id, i]),
    );
    const overrides = repos.scheme.overrides(head.planId);
    for (const p of head.snapshot.placements) {
      if (p.lessonId.startsWith("flex:")) continue;
      const [itemId = "", n = ""] = p.lessonId.split("#");
      const item = items.get(itemId);
      const of = item ? lessonsFor(item, overrides, p.groupId) : null;
      named.set(
        key(p.groupId, p.lessonId),
        item
          ? `${item.title}, lesson ${n}${of === null ? "" : ` of ${of}`}`
          : p.lessonId,
      );
    }
  }
  return named;
}

/** The lesson's name now, else the one stored with its note, else its id. */
function titleOf(repos: Repos, groupId: string, lessonId: string): string {
  return (
    lessonsInPlans(repos).get(key(groupId, lessonId)) ??
    repos.lessonNotes.get(groupId, lessonId)?.title ??
    lessonId
  );
}

export function readNote(repos: Repos, groupId: string, lessonId: string) {
  checkedLesson(repos, groupId, lessonId);
  return viewOf(groupId, lessonId, repos.lessonNotes.get(groupId, lessonId));
}

export function writeNote(
  repos: Repos,
  groupId: string,
  lessonId: string,
  rawText: string,
  now: Date,
) {
  checkedLesson(repos, groupId, lessonId);
  if ([...rawText].length > MAX_LESSON_NOTE_CHARACTERS)
    throw new ApiError(
      422,
      "invalid-note",
      "A plan can be at most 2,000 characters.",
    );
  // stored as typed; only blank space at the ends goes, and a blank note is no note
  const text = rawText.trim();
  repos.lessonNotes.saveText(
    groupId,
    lessonId,
    text,
    titleOf(repos, groupId, lessonId),
    now.toISOString(),
  );
  return viewOf(groupId, lessonId, repos.lessonNotes.get(groupId, lessonId));
}

export function attachMaterial(
  repos: Repos,
  groupId: string,
  lessonId: string,
  file: SavedMaterial,
  now: Date,
): MaterialView {
  const material: StoredMaterial = {
    id: file.id,
    groupId,
    lessonId,
    name: file.name,
    storedName: file.storedName,
    contentType: file.contentType,
    size: file.size,
    createdAt: now.toISOString(),
  };
  repos.lessonNotes.addMaterial(material, titleOf(repos, groupId, lessonId));
  return materialView(material);
}

export function findMaterial(repos: Repos, id: string): StoredMaterial {
  const m = repos.lessonNotes.material(id);
  if (!m) throw new ApiError(404, "no-such-material", "There is no such file.");
  return m;
}

/** What the board needs to draw a paper clip: one row per lesson that has a note or a file. */
export function summary(repos: Repos) {
  return repos.lessonNotes.list().map((n) => ({
    groupId: n.groupId,
    lessonId: n.lessonId,
    hasNote: n.text !== "",
    materials: n.materials.length,
  }));
}

/** Notes and files for lessons the plans no longer hold (taken out of the scheme). They are kept. */
export function removedFromPlan(repos: Repos): RemovedLessonNote[] {
  const inPlan = lessonsInPlans(repos);
  return repos.lessonNotes
    .list()
    .filter((n) => !inPlan.has(key(n.groupId, n.lessonId)))
    .map((n) => ({ ...viewOf(n.groupId, n.lessonId, n), title: n.title }));
}
