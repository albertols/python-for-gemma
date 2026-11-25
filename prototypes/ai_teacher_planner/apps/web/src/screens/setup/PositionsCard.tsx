import { expandLessons, type Position, type SowItem } from "@planner/domain";
import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "../../api/client.ts";
import {
  type CourseRow,
  useConfig,
  useCourses,
  usePositions,
  useSavePositions,
  useScheme,
} from "../../api/queries.ts";
import { StatusLine, useAnnounce } from "../../components/PlanNotices.tsx";
import { ProposeButton } from "../../components/ProposalDialog.tsx";
import { Button } from "../../components/ui/button.tsx";

const FIELD =
  "rounded-md border border-border bg-background px-2 py-1 text-foreground";
/** The select's value for "nothing left to teach" (a null next lesson). */
const FINISHED = "";

interface Choice {
  next: string;
  done: string[];
}

/** "Supply, lesson 1 of 4". */
const lessonLabel = (title: string, index: number, of: number) =>
  `${title}, lesson ${index} of ${of}`;

/** The positions she stored, or each group's first lesson before she has said anything. */
function startingChoices(
  course: CourseRow,
  items: readonly SowItem[],
  overrides: Parameters<typeof expandLessons>[1],
  stored: readonly Position[],
): Record<string, Choice> {
  const out: Record<string, Choice> = {};
  for (const g of course.groups) {
    const mine = stored.find((p) => p.groupId === g.id);
    out[g.id] = mine
      ? { next: mine.nextLessonId ?? FINISHED, done: [...mine.doneItemIds] }
      : {
          next:
            expandLessons(items, overrides, g.id, g.track)[0]?.id ?? FINISHED,
          done: [],
        };
  }
  return out;
}

function messageOf(error: unknown): string[] {
  if (error instanceof ApiError) return [error.message, ...error.issues];
  return ["The planner could not be reached."];
}

/** One course: each group's next lesson and what it taught out of order, then a proposal. */
function CoursePositions({
  course,
  today,
}: {
  course: CourseRow;
  today: string;
}) {
  const scheme = useScheme(course.id, true);
  const stored = usePositions(course.id, true);
  const save = useSavePositions(course.id);
  const [draft, setDraft] = useState<Record<string, Choice> | null>(null);
  const note = useAnnounce();

  if (scheme.error || stored.error)
    return <p className="text-danger">The positions could not be loaded.</p>;
  if (!scheme.data || !stored.data)
    return <p className="text-muted-foreground">Loading the positions...</p>;
  const { items, overrides } = scheme.data;
  if (items.every((i) => i.kind === "assessment"))
    return (
      <p>
        This course has no scheme of work yet.{" "}
        <Link to={`/scheme/${course.id}`} className="text-link underline">
          Open the scheme of work
        </Link>
      </p>
    );
  const saved = stored.data;
  const choices = draft ?? startingChoices(course, items, overrides, saved);
  const known = course.groups.every((g) =>
    saved.some((p) => p.groupId === g.id),
  );
  const dirty = draft !== null;
  const teachable = items
    .filter((i) => i.kind !== "assessment")
    .sort((a, b) => a.order - b.order);
  const change = (groupId: string, next: Partial<Choice>) => {
    save.reset();
    const base = choices[groupId] ?? { next: FINISHED, done: [] };
    setDraft({ ...choices, [groupId]: { ...base, ...next } });
  };
  const submit = () => {
    const positions: Position[] = course.groups.map((g) => {
      const c = choices[g.id] ?? { next: FINISHED, done: [] };
      const nextLessonId = c.next === FINISHED ? null : c.next;
      const doneItemIds = [...c.done].sort();
      const was = saved.find((p) => p.groupId === g.id);
      // a group she did not change keeps the day she first said it
      const same =
        was &&
        was.nextLessonId === nextLessonId &&
        [...was.doneItemIds].sort().join() === doneItemIds.join();
      return {
        groupId: g.id,
        nextLessonId,
        doneItemIds,
        asOf: same ? was.asOf : today,
      };
    });
    save.mutate(positions, {
      onSuccess: () => {
        setDraft(null);
        // the Save button stays where it is, so the focus stays on it
        note.say("Positions saved.", { focus: false });
      },
    });
  };

  return (
    <div className="space-y-3">
      {known ? null : (
        <p className="font-medium">Tell the planner where each group is.</p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {course.groups.map((g) => {
          const lessons = expandLessons(items, overrides, g.id, g.track);
          const choice = choices[g.id] ?? { next: FINISHED, done: [] };
          const titles = new Map(items.map((i) => [i.id, i.title]));
          const unknown =
            choice.next !== FINISHED &&
            !lessons.some((l) => l.id === choice.next);
          return (
            <fieldset
              key={g.id}
              className="min-w-0 rounded-md border border-border p-3"
            >
              <legend className="px-1 font-semibold">{g.id}</legend>
              <label className="flex flex-col text-sm">
                Next lesson for {g.id}
                <select
                  className={FIELD}
                  value={choice.next}
                  onChange={(e) => change(g.id, { next: e.target.value })}
                >
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {lessonLabel(
                        titles.get(l.itemId) ?? l.itemId,
                        l.index,
                        l.of,
                      )}
                    </option>
                  ))}
                  {unknown ? (
                    <option value={choice.next}>
                      {choice.next} (no longer in the scheme)
                    </option>
                  ) : null}
                  <option value={FINISHED}>
                    Nothing left: the scheme is finished
                  </option>
                </select>
              </label>
              <details className="mt-2 text-sm">
                <summary>Taught out of order ({choice.done.length})</summary>
                <ul className="mt-1 space-y-1">
                  {teachable.map((i) => (
                    <li key={i.id}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={choice.done.includes(i.id)}
                          onChange={(e) =>
                            change(g.id, {
                              done: e.target.checked
                                ? [...choice.done, i.id]
                                : choice.done.filter((d) => d !== i.id),
                            })
                          }
                        />
                        {i.title}
                        <span className="sr-only">
                          {" "}
                          already taught by {g.id}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={(!dirty && known) || save.isPending}
          onClick={submit}
        >
          Save positions
        </Button>
        {dirty ? (
          <Button type="button" onClick={() => setDraft(null)}>
            Discard changes
          </Button>
        ) : null}
        <ProposeButton
          courseId={course.id}
          disabled={!known || dirty}
          onAccepted={(label) =>
            note.say(`Accepted "${label}". The board shows the plan.`)
          }
        >
          Ask for a plan
        </ProposeButton>
        <StatusLine announce={note} />
      </div>
      {!known || dirty ? (
        <p className="text-sm text-muted-foreground">
          A plan can be asked for once the positions are saved.
        </p>
      ) : null}
      {save.error ? (
        <div role="alert" className="text-danger">
          <p className="font-medium">{messageOf(save.error)[0]}</p>
          <ul className="list-disc pl-5">
            {messageOf(save.error)
              .slice(1)
              .map((m) => (
                <li key={m}>{m}</li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where each group is, per course: its next lesson in the scheme and anything
 * taught out of order. The planner never guesses this, so a course gets no
 * plan until it is saved.
 */
export function PositionsCard() {
  const courses = useCourses();
  const config = useConfig();
  const today = config.data?.today;
  return (
    <section
      aria-labelledby="positions-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="positions-title" className="text-lg font-semibold">
        Where each group is
      </h2>
      <p className="mt-1 text-muted-foreground">
        For each group, the next lesson to teach. Lessons before it are declared
        as taught, at topic level.
      </p>
      {courses.error ? (
        <p className="mt-2 text-danger">The courses could not be loaded.</p>
      ) : !courses.data || !today ? (
        <p className="mt-2 text-muted-foreground">Loading the courses...</p>
      ) : (
        <div className="mt-4 space-y-6">
          {courses.data.map((c) => (
            <div key={c.id}>
              <h3 className="mb-2 font-semibold">{c.title}</h3>
              {c.pack === "locked" ? (
                <CoursePositions course={c} today={today} />
              ) : (
                <p className="text-muted-foreground">
                  Lock the curriculum pack first.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
