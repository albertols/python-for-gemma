import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type CourseRow,
  type PlanStatusData,
  useCourses,
  usePlanStatuses,
  useUndoPlan,
} from "../api/queries.ts";
import { ProposeButton } from "./ProposalDialog.tsx";
import { Button } from "./ui/button.tsx";

export const ACCEPTED = "Plan accepted.";
export const STATUS_FAILED = "Could not load the plan status.";
export const undone = (label: string) =>
  `Undid: ${label}. It stays in the plan's history; cancelled lessons and what you logged are kept.`;

/**
 * A line that says what just happened and takes the focus, so the keyboard
 * lands on the result even when the button that did it has gone.
 */
export function useAnnounce(): {
  ref: RefObject<HTMLParagraphElement | null>;
  text: string | null;
  say: (text: string, opts?: { focus?: boolean }) => void;
} {
  const ref = useRef<HTMLParagraphElement>(null);
  const [said, setSaid] = useState<{
    text: string;
    focus: boolean;
    n: number;
  } | null>(null);
  useEffect(() => {
    if (said?.focus) ref.current?.focus();
  }, [said]);
  const say = useCallback(
    (text: string, opts: { focus?: boolean } = {}) =>
      setSaid((s) => ({ text, focus: opts.focus ?? true, n: (s?.n ?? 0) + 1 })),
    [],
  );
  return { ref, text: said?.text ?? null, say };
}

/**
 * The status line itself. It is always in the page (a live region announces
 * only what changes inside it); it is a status only while it says something,
 * so a page with nothing to say has no empty status.
 */
export function StatusLine({
  announce,
  fallback = null,
  className = "",
}: {
  announce: {
    ref: RefObject<HTMLParagraphElement | null>;
    text: string | null;
  };
  /** Said when nothing has happened yet, such as a status that could not be loaded. */
  fallback?: string | null;
  className?: string;
}) {
  const text = announce.text ?? fallback;
  return (
    <p
      ref={announce.ref}
      tabIndex={-1}
      aria-live="polite"
      role={text ? "status" : undefined}
      className={`rounded-sm focus:outline-2 focus:outline-offset-2 focus:outline-foreground ${className}`}
    >
      {text}
    </p>
  );
}

/** Each course that has an accepted plan, with its status once loaded, and whether any status failed to load. */
export function usePlans(only?: string): {
  plans: { course: CourseRow; status: PlanStatusData | undefined }[];
  failed: boolean;
} {
  const courses = useCourses();
  const withPlan = (courses.data ?? []).filter(
    (c) => c.hasPlan && (only === undefined || c.id === only),
  );
  const statuses = usePlanStatuses(withPlan.map((c) => c.id));
  return {
    plans: withPlan.map((course, i) => ({ course, status: statuses[i]?.data })),
    failed: courses.isError || statuses.some((s) => s.isError),
  };
}

/** "1 lesson no longer has a lesson slot." */
const withoutSlotSentence = (n: number) =>
  n === 1
    ? "1 lesson no longer has a lesson slot."
    : `${n} lessons no longer have a lesson slot.`;

function OutOfDate({
  course,
  withoutSlot,
  onAccepted,
}: {
  course: CourseRow;
  /** Head lessons and assessments whose slot is gone: they have no cell on the board. */
  withoutSlot: number;
  onAccepted: (label: string) => void;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-l-4 border-border border-l-danger bg-card p-4"
    >
      <h2 id={id} className="text-lg font-semibold">
        The plan is out of date
      </h2>
      <p className="mt-1">
        {course.title}: the calendar, the scheme or the positions changed after
        this plan was accepted. Nothing moves until you accept a new plan.
      </p>
      {withoutSlot > 0 ? (
        <p className="mt-1 font-medium">{withoutSlotSentence(withoutSlot)}</p>
      ) : null}
      <div className="mt-3">
        <ProposeButton courseId={course.id} onAccepted={onAccepted}>
          See what changes
        </ProposeButton>
      </div>
    </section>
  );
}

function UndoButton({
  course,
  label,
  onUndone,
}: {
  course: CourseRow;
  /** The head's label: what undo takes back. */
  label: string;
  onUndone: (label: string) => void;
}) {
  const undo = useUndoPlan(course.id);
  return (
    <>
      <Button
        type="button"
        disabled={undo.isPending}
        onClick={() =>
          undo.mutate(undefined, { onSuccess: () => onUndone(label) })
        }
      >
        Undo last change
        {/* a reader hears which plan it takes back */}
        <span className="sr-only"> to {course.title}</span>
      </Button>
      {undo.error ? (
        <p role="alert" className="text-danger">
          {undo.error.message}
        </p>
      ) : null}
    </>
  );
}

/**
 * Where a screen shows its plans' state: "Undo last change" (the board),
 * "The plan is out of date" with "See what changes" for each course a new plan
 * would change, and one status line that says what an accept or an undo did
 * and takes the focus, since the button that did it is gone by then. If a
 * plan's status cannot be loaded, the line says so instead of showing nothing.
 */
export function PlanArea({
  only,
  withUndo = false,
}: {
  /** One course only (the scheme screen); every course when absent. */
  only?: string;
  withUndo?: boolean;
}) {
  const announce = useAnnounce();
  const { plans, failed } = usePlans(only);
  const stale = plans.filter((p) => p.status?.head && !p.status.upToDate);
  const undoable = plans.filter((p) => p.status?.canUndo && p.status.head);
  const accepted = () => announce.say(ACCEPTED);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {withUndo
          ? undoable.map((p) => (
              <UndoButton
                key={p.course.id}
                course={p.course}
                label={p.status?.head?.label ?? ""}
                onUndone={(label) => announce.say(undone(label))}
              />
            ))
          : null}
        <StatusLine
          announce={announce}
          fallback={failed ? STATUS_FAILED : null}
          className={failed && !announce.text ? "text-danger" : ""}
        />
      </div>
      {stale.map((p) => (
        <OutOfDate
          key={p.course.id}
          course={p.course}
          withoutSlot={p.status?.withoutSlot.length ?? 0}
          onAccepted={accepted}
        />
      ))}
    </div>
  );
}
