import type { Fortnight } from "@planner/domain";
import { addDays, weekdayOf } from "@planner/domain";
import { Link } from "react-router";
import {
  type TodayData,
  useDayText,
  useFortnights,
  useTimetable,
  useToday,
} from "../../api/queries.ts";
import { GroupBadge } from "../../components/GroupBadge.tsx";
import {
  EmptyState,
  ErrorState,
  Loading,
} from "../../components/ui/states.tsx";
import { fullDayWithYear } from "../../lib/dates.ts";
import { RemindersList } from "./RemindersList.tsx";

const startOf = (f: Fortnight) => f.w1 ?? f.w2 ?? "";

/** The board link for the fortnight holding a date; plain /board if it cannot be found. */
function boardLink(fortnights: Fortnight[] | undefined, date: string): string {
  const found = fortnights?.find(
    (f) => startOf(f) <= date && date <= addDays(f.w2 ?? f.w1 ?? "", 6),
  );
  return found ? `/board?w1=${startOf(found)}` : "/board";
}

/** Why there are no lessons, in the calendar's own words where it has them. */
function whyNoLessons(today: TodayData, text: string | null): string {
  const weekday = fullDayWithYear(today.date).split(" ")[0];
  if (today.kind === "weekend" || weekdayOf(today.date) >= 6)
    return `${weekday}, no lessons`;
  if (today.kind === "outside-term") return text ?? "Outside term time";
  if (today.kind === "unlabelled") return text ?? "No school today";
  return "You have no lessons today";
}

function NextTeachingDay({ date }: { date: string }) {
  const fortnights = useFortnights();
  return (
    <p className="mt-2">
      Next teaching day:{" "}
      <Link
        className="underline underline-offset-2"
        to={boardLink(fortnights.data, date)}
      >
        {fullDayWithYear(date)}
      </Link>
    </p>
  );
}

function Lessons({ today }: { today: TodayData }) {
  const timetable = useTimetable();
  const colours = new Map(
    (timetable.data?.groups ?? []).map((g) => [g.id, g.colour] as const),
  );
  const text = useDayText(today.lessons.length === 0 ? today.date : null);
  if (today.lessons.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border p-6">
        <h2 className="text-lg font-semibold">No lessons today</h2>
        <p className="mt-1 text-muted-foreground">
          {text.isPending ? "" : whyNoLessons(today, text.data ?? null)}
        </p>
        {today.nextTeachingDay ? (
          <NextTeachingDay date={today.nextTeachingDay} />
        ) : (
          <p className="mt-2 text-muted-foreground">
            There is no later teaching day in the calendar.
          </p>
        )}
      </div>
    );
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Today's lessons in period order</caption>
      <thead>
        <tr className="border-b border-border">
          <th scope="col" className="py-2 pr-4">
            Period
          </th>
          <th scope="col" className="py-2 pr-4">
            Time
          </th>
          <th scope="col" className="py-2 pr-4">
            Group
          </th>
          <th scope="col" className="py-2">
            Room
          </th>
        </tr>
      </thead>
      <tbody>
        {today.lessons.map(({ slot, start, end }) => (
          <tr key={slot.key} className="border-b border-border">
            <th scope="row" className="py-2 pr-4 font-medium">
              {slot.period}
            </th>
            <td className="py-2 pr-4">
              {start} to {end}
            </td>
            <td className="py-2 pr-4">
              <GroupBadge
                id={slot.groupId}
                colour={colours.get(slot.groupId)}
              />
              {slot.status === "open" ? null : (
                <span className="ml-2 text-sm text-muted-foreground">
                  {slot.status}
                  {slot.reasons.length
                    ? `: ${slot.reasons.map((r) => r.text).join(", ")}`
                    : ""}
                </span>
              )}
            </td>
            <td className="py-2">
              {slot.room ? `Room ${slot.room}` : "No room set"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TodayScreen() {
  const today = useToday();
  if (today.isPending) return <Loading what="today" />;
  if (today.isError) return <ErrorState message={today.error.message} />;
  const data = today.data;

  if (data.kind === "no-calendar")
    return (
      <section aria-labelledby="today-title">
        <h1 id="today-title" className="text-2xl font-semibold">
          {fullDayWithYear(data.date)}
        </h1>
        <div className="mt-6">
          <EmptyState title="The planner has no school calendar yet">
            Import it once and Today, the board and the slot audit fill in.
          </EmptyState>
          <Link
            to="/setup"
            className="mt-4 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Import the school calendar
          </Link>
        </div>
      </section>
    );

  return (
    <section aria-labelledby="today-title">
      <h1 id="today-title" className="text-2xl font-semibold">
        {fullDayWithYear(data.date)}
      </h1>
      {data.weekLabel ? (
        <p className="mt-1 text-lg">Week {data.weekLabel.slice(1)}</p>
      ) : null}
      <div className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Lessons</h2>
        <Lessons today={data} />
      </div>
      <div className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Coming up</h2>
        <RemindersList reminders={data.reminders} />
      </div>
    </section>
  );
}
