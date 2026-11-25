import { useId } from "react";
import {
  type CourseRow,
  type PlanStatusData,
  useCourses,
  usePlanStatuses,
  useUndoPlan,
} from "../api/queries.ts";
import { ProposeButton } from "./ProposalDialog.tsx";
import { Button } from "./ui/button.tsx";

/** Each course that has an accepted plan, with its status once loaded. */
export function usePlans(only?: string): {
  course: CourseRow;
  status: PlanStatusData | undefined;
}[] {
  const courses = useCourses();
  const withPlan = (courses.data ?? []).filter(
    (c) => c.hasPlan && (only === undefined || c.id === only),
  );
  const statuses = usePlanStatuses(withPlan.map((c) => c.id));
  return withPlan.map((course, i) => ({ course, status: statuses[i]?.data }));
}

function OutOfDate({
  course,
  onAccepted,
}: {
  course: CourseRow;
  onAccepted?: ((label: string) => void) | undefined;
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
      <div className="mt-3">
        <ProposeButton courseId={course.id} onAccepted={onAccepted}>
          See what changes
        </ProposeButton>
      </div>
    </section>
  );
}

/**
 * "The plan is out of date", once for each course whose accepted plan a new
 * plan made today would change, with "See what changes" to preview it.
 */
export function OutOfDatePlans({
  only,
  onAccepted,
}: {
  /** One course only (the scheme screen); every course when absent. */
  only?: string;
  onAccepted?: (label: string) => void;
}) {
  const plans = usePlans(only).filter(
    (p) => p.status?.head && !p.status.upToDate,
  );
  if (plans.length === 0) return null;
  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <OutOfDate
          key={p.course.id}
          course={p.course}
          onAccepted={onAccepted}
        />
      ))}
    </div>
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

/** "Undo last change" for each course whose plan has an earlier revision to go back to. */
export function UndoLastChange({
  onUndone,
}: {
  onUndone: (label: string) => void;
}) {
  const plans = usePlans().filter((p) => p.status?.canUndo && p.status.head);
  return (
    <>
      {plans.map((p) => (
        <UndoButton
          key={p.course.id}
          course={p.course}
          label={p.status?.head?.label ?? ""}
          onUndone={onUndone}
        />
      ))}
    </>
  );
}
