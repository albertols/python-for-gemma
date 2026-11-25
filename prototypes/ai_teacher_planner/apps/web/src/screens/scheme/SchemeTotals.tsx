import { cn } from "../../lib/utils.ts";
import type { GroupTotals } from "./scheme-model.ts";

const lessons = (n: number) => (n === 1 ? "1 lesson" : `${n} lessons`);

/** "65 teaching + 4 assessment" for one group, with any project, revision or buffer lessons it also has. */
function sumOf(t: GroupTotals): string {
  const parts = [`${t.teaching} teaching`];
  if (t.project > 0) parts.push(`${t.project} project`);
  if (t.revision > 0) parts.push(`${t.revision} revision`);
  if (t.buffer > 0) parts.push(`${t.buffer} buffer`);
  parts.push(`${t.assessments} assessment`);
  return parts.join(" + ");
}

/**
 * What each group's scheme comes to, against the slots it has left. It follows her
 * edits as she types, and turns to a warning, in words, when a group cannot fit it.
 */
export function SchemeTotals({ totals }: { totals: GroupTotals[] }) {
  return (
    <section
      aria-labelledby="scheme-totals-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="scheme-totals-title" className="text-lg font-semibold">
        Totals for each group
      </h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {totals.map((t) => (
          <li
            key={t.groupId}
            className={cn(
              "rounded-md border p-3",
              t.fits ? "border-border" : "border-2 border-danger",
            )}
          >
            <p>
              <strong>{t.groupId}:</strong> {sumOf(t)}
            </p>
            <p className="text-muted-foreground">
              {lessons(t.lessonsLeft)} to place in {t.slotsLeft} slots left
            </p>
            {t.fits ? null : (
              <p className="mt-1 font-semibold text-danger">
                {t.over === 1
                  ? "1 lesson does not fit"
                  : `${t.over} lessons do not fit`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
