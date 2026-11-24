import type { TodayData } from "../../api/queries.ts";
import { daysLeftInWords, fullDayWithYear } from "../../lib/dates.ts";

/** Report deadlines, parents' evenings and official exams coming up, with the days left in words. */
export function RemindersList({
  reminders,
}: {
  reminders: TodayData["reminders"];
}) {
  if (reminders.length === 0)
    return (
      <p className="text-muted-foreground">
        No report deadlines, parents' evenings or official exams in the next two
        weeks.
      </p>
    );
  return (
    <ul className="space-y-2">
      {reminders.map((r) => (
        <li
          key={`${r.kind}-${r.date}-${r.label}`}
          className="rounded-lg border border-border bg-card p-3"
        >
          {r.label}{" "}
          <strong className="font-semibold">
            {daysLeftInWords(r.daysLeft)}
          </strong>
          <span className="block text-sm text-muted-foreground">
            {fullDayWithYear(r.date)}
          </span>
        </li>
      ))}
    </ul>
  );
}
