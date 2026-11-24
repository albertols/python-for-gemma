import type { WeekLabel } from "@planner/domain";
import { longDate } from "../../lib/dates.ts";
import type { BoardWeek } from "./board-model.ts";
import { WeekGrid } from "./WeekGrid.tsx";

const NAME: Record<WeekLabel, string> = { W1: "Week 1", W2: "Week 2" };
const chip =
  "rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium";

export function WeekPanel({
  side,
  week,
  colours,
}: {
  side: WeekLabel;
  week: BoardWeek | null;
  colours: ReadonlyMap<string, string>;
}) {
  const id = `board-${side}`;
  // A mixed week names every label it carries, in order: "Week 2 -> Week 1".
  const heading = week
    ? week.labels.map((l) => NAME[l]).join(" → ") || NAME[side]
    : NAME[side];
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {heading}
        </h2>
        {week?.mixed ? <span className={chip}>Mixed week</span> : null}
        {week?.monday ? (
          <p className="text-sm text-muted-foreground">
            from Monday {longDate(week.monday)}
          </p>
        ) : null}
      </div>
      {week ? (
        <WeekGrid
          week={week}
          caption={`${heading}, week of ${longDate(week.monday ?? "")}`}
          colours={colours}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">
          This fortnight has no {NAME[side]}.
        </p>
      )}
    </section>
  );
}

/** Week 1 and Week 2 side by side, with a thin divider when a break comes before them. */
export function FortnightGrid({
  w1,
  w2,
  breakBefore,
  colours,
}: {
  w1: BoardWeek | null;
  w2: BoardWeek | null;
  breakBefore: boolean;
  colours: ReadonlyMap<string, string>;
}) {
  return (
    <div>
      {breakBefore ? (
        <p className="mb-4 border-y border-border py-0.5 text-center text-xs uppercase tracking-wide text-muted-foreground">
          Break
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <WeekPanel side="W1" week={w1} colours={colours} />
        <WeekPanel side="W2" week={w2} colours={colours} />
      </div>
    </div>
  );
}
