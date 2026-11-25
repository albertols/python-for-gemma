import type { PlacementState, SlotStatus } from "@planner/domain";
import type { CSSProperties } from "react";
import { SPARE_EXPLANATION, STATE_LABEL } from "../lib/plan-words.ts";
import type { CardModel } from "../screens/board/board-plan.ts";
import { AiBadge } from "./AiBadge.tsx";
import { Disclosure } from "./ui/disclosure.tsx";

/** The card's small lines: two of them and the group's line fit one period's height. */
const SMALL = "block text-[11px] leading-tight";

/**
 * A mark beside some states' words, so the states differ in shape as well as
 * in text. Assumed has none: its dashed outline is its shape, and its words
 * fill the line.
 */
const STATE_MARK: Record<PlacementState, string> = {
  planned: "",
  assumed: "",
  taught: "✓ ",
  cover: "↔ ",
  homework: "⌂ ",
  skipped: "✕ ",
  declared: "",
};

/**
 * How a state changes the look of its cell, drawn in the cell's own text
 * colour so the contrast stays the group colour's: planned is plain, assumed
 * dashed, taught solid, cover and homework dotted and doubled.
 */
export function stateOutline(state: PlacementState): CSSProperties {
  const line = (style: string, width = 2) => ({
    outline: `${width}px ${style} currentColor`,
    outlineOffset: "-2px",
  });
  switch (state) {
    case "assumed":
      return line("dashed");
    case "taught":
      return line("solid");
    case "cover":
      return line("dotted");
    case "homework":
      return line("double", 3);
    default:
      return {};
  }
}

/**
 * What a plan puts in one board cell: the lesson and which of its item's
 * lessons it is, its state in words, an in-lesson assessment as a chip, and
 * the AI mark when the lesson came from the AI. A spare lesson opens to what
 * it is for. The words a reader hears are the cell's aria-describedby
 * (`describeCard`); these are the same words, drawn.
 */
export function LessonCard({
  card,
  status,
  popoverOnLeft = false,
}: {
  card: CardModel;
  status: SlotStatus;
  /** The spare lesson's panel opens leftwards, for the last days of the week. */
  popoverOnLeft?: boolean;
}) {
  const ai = card.provenance.origin === "ai" ? card.provenance.ai : null;
  // an assessment card says "Assessment" on its second line, so its first is the title alone
  const line =
    card.kind === "assessment"
      ? card.title
      : [card.title, card.sub].filter(Boolean).join(" · ");
  const spare = card.kind === "flex";
  return (
    <>
      {spare ? (
        <span className="block">
          {/* her own title, or the purpose she gave it, is on the face; the explanation is in the panel */}
          {card.title !== "Spare lesson" || card.sub ? (
            <span aria-hidden="true" className={`${SMALL} truncate`}>
              {card.title === "Spare lesson" ? card.sub : line}
            </span>
          ) : null}
          <Disclosure
            label="Spare lesson"
            buttonClassName="!px-1 !py-0 !text-xs"
            panelClassName={`font-normal ${popoverOnLeft ? "!left-auto right-0" : ""}`}
          >
            {card.sub ? <p className="mb-1 font-semibold">{card.sub}</p> : null}
            <p>{SPARE_EXPLANATION}</p>
          </Disclosure>
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`${SMALL} truncate font-medium ${card.state === "skipped" ? "line-through" : ""}`}
        >
          {line}
        </span>
      )}
      <span
        aria-hidden="true"
        className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] leading-tight"
      >
        {status === "cancelled" ? null : (
          <span className="truncate" data-state-label>
            {STATE_MARK[card.state]}
            {card.kind === "assessment"
              ? "Assessment"
              : STATE_LABEL[card.state]}
          </span>
        )}
        {card.assessment && card.kind !== "assessment" ? (
          <span className="rounded-full border border-current px-1">
            {card.assessment.title}
          </span>
        ) : null}
        {card.pinned ? <span>Pinned</span> : null}
        {card.clips ? (
          <span className="inline-flex items-center gap-0.5" data-clips>
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            {card.clips}
          </span>
        ) : null}
      </span>
      {ai ? <AiBadge review={ai.review} /> : null}
    </>
  );
}
