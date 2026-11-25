import type { ReviewState } from "@planner/domain";
import { AiBadge } from "./AiBadge.tsx";
import { Disclosure } from "./ui/disclosure.tsx";

export const LEGEND_SENTENCE =
  "Everything without the sparkle is calculated from your calendar and timetable.";

const MARKS: { review: ReviewState; words: string }[] = [
  { review: "suggested", words: "Awaiting your review" },
  { review: "accepted", words: "Accepted" },
  { review: "edited", words: "Edited by you" },
];

export function LegendContent() {
  return (
    <>
      <ul className="space-y-2">
        {MARKS.map((m) => (
          <li key={m.review} className="flex items-center gap-2">
            <AiBadge review={m.review} />
            <span>{m.words}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3">{LEGEND_SENTENCE}</p>
    </>
  );
}

/** The header's key to the marks. */
export function Legend() {
  return (
    <Disclosure label="Legend" panelClassName="!left-auto right-0">
      <LegendContent />
    </Disclosure>
  );
}
