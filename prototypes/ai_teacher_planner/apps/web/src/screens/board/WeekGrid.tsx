import { PERIOD_TIMES, type Period } from "@planner/domain";
import { dayHeading } from "./board-dates.ts";
import type { BoardWeek } from "./board-model.ts";
import { SlotCell } from "./SlotCell.tsx";

const PERIODS: Period[] = [1, 2, 3, 4, 5, 6];
const NO_SCHOOL: Record<string, string> = {
  weekend: "Weekend",
  "outside-term": "No school",
  unlabelled: "Not labelled",
};

/** The reason a day is greyed: what the calendar says, else its kind. */
const reasonOf = (day: BoardWeek["days"][number]): string | null =>
  day.dayKind === "pupil" ? null : (day.text ?? NO_SCHOOL[day.dayKind] ?? null);

/** One week as a table: periods down, days across, like her timetable. */
export function WeekGrid({
  week,
  caption,
  colours,
}: {
  week: BoardWeek;
  caption: string;
  /** Group id to colour token. */
  colours: ReadonlyMap<string, string>;
}) {
  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-14">
            <span className="sr-only">Period</span>
          </th>
          {week.days.map((day) => {
            const h = dayHeading(day.date);
            return (
              <th
                key={day.date}
                scope="col"
                className="border border-border bg-card px-1 py-1 text-sm font-semibold"
              >
                {h.weekday}
                <span className="block text-xs font-normal text-muted-foreground">
                  {h.date}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {PERIODS.map((period) => (
          // A fixed height keeps every row, and so both weeks, level; a double spans two.
          <tr key={period} className="h-16">
            <th
              scope="row"
              className="border border-border bg-card px-1 text-left text-xs font-normal"
            >
              P{period}
              <span className="block text-muted-foreground">
                {PERIOD_TIMES[period].start}
              </span>
            </th>
            {week.days.map((day) => {
              const above = day.cells[period - 2];
              // The second half of a double is covered by the first cell's rowSpan.
              if (above?.joinsNext) return null;
              const cell = day.cells[period - 1];
              if (!cell) return null;
              // A day without pupils is one cell spanning P1 to P6.
              if (cell.kind === "no-school" && period > 1) return null;
              return (
                <SlotCell
                  key={day.date}
                  cell={cell}
                  colour={
                    cell.slot ? (colours.get(cell.slot.groupId) ?? null) : null
                  }
                  reason={reasonOf(day)}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
