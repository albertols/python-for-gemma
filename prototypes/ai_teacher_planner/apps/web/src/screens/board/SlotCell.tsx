import { weekdayOf } from "@planner/domain";
import { useId } from "react";
import { LessonCard, stateOutline } from "../../components/LessonCard.tsx";
import { fullDay } from "../../lib/dates.ts";
import { groupColour } from "../../theme/group-colours.ts";
import type { BoardCell } from "./board-model.ts";
import { describeCard } from "./board-plan.ts";

const PERIODS_PER_DAY = 6;
const base = "border border-border overflow-hidden p-1 text-sm";

/**
 * One period of one day: the group and room, and the lesson the plan puts
 * there. The cell's accessible name stays the slot's ("13 1, Friday 8 January,
 * period 6, room 206"); the lesson is its description.
 */
export function SlotCell({
  cell,
  colour,
  reason,
}: {
  cell: BoardCell;
  /** The group's colour token (g1 to g6), when the cell is a lesson. */
  colour: string | null;
  /** Why the day is not a school day, shown once in the cell that spans the day. */
  reason: string | null;
}) {
  const when = `${fullDay(cell.date)}, period ${cell.period}`;
  const descriptionId = useId();
  const common = {
    "data-kind": cell.kind,
    "data-date": cell.date,
    "data-period": cell.period,
  };
  if (cell.kind === "lesson" && cell.slot) {
    const { slot } = cell;
    const { bg, fg } = groupColour(colour ?? "g1");
    const why = slot.reasons.map((r) => r.text).join("; ");
    const status =
      slot.status === "open" ? "" : `, ${slot.status}${why ? `: ${why}` : ""}`;
    const possible = cell.possible
      .map((t) => `Possible disruption: ${t}`)
      .join("; ");
    const double = cell.doublePartner
      ? `, double with period ${cell.doublePartner}`
      : "";
    const cancelled = slot.status === "cancelled";
    const { card, declared } = cell;
    // A cancelled lesson is muted and striped, with the group's colour kept as a left bar.
    // A declared band is muted and plain: the past at topic level, not lessons.
    const look = cancelled
      ? {
          background:
            "repeating-linear-gradient(135deg, var(--muted) 0 8px, var(--card) 8px 16px)",
          color: "var(--foreground)",
          borderLeft: `6px solid ${bg}`,
        }
      : declared
        ? {
            background: "var(--muted)",
            color: "var(--foreground)",
            borderLeft: `6px solid ${bg}`,
          }
        : {
            background: bg,
            color: fg,
            ...(card ? stateOutline(card.state) : {}),
          };
    const description = card
      ? describeCard(card, slot.status)
      : declared
        ? `Declared: ${declared.join(", ")}`
        : null;
    // a spare lesson's panel must not be cut off by the cell
    const clip = card?.kind === "flex" ? "" : "overflow-hidden";
    return (
      <td
        {...common}
        data-status={slot.status}
        data-state={card?.state}
        rowSpan={cell.joinsNext ? 2 : 1}
        aria-label={`${slot.groupId}, ${when}${slot.room ? `, room ${slot.room}` : ""}${double}${status}${possible ? `, ${possible}` : ""}`}
        aria-describedby={description ? descriptionId : undefined}
        className={`${base.replace("overflow-hidden", clip)} align-top ${cell.joinsNext ? "border-b-0" : ""}`}
        style={look}
      >
        <span aria-hidden="true" className="flex items-baseline gap-1">
          <span className="font-semibold">{slot.groupId}</span>
          {slot.room ? <span className="text-xs">{slot.room}</span> : null}
        </span>
        {description ? (
          <span id={descriptionId} hidden>
            {description}
          </span>
        ) : null}
        {card ? (
          <LessonCard
            card={card}
            status={slot.status}
            popoverOnLeft={weekdayOf(cell.date) >= 4}
          />
        ) : declared ? (
          <span aria-hidden="true" className="block text-[11px] leading-tight">
            <span className="block font-semibold italic">Declared:</span>
            <span className="block truncate"> {declared.join(", ")}</span>
          </span>
        ) : null}
        {slot.status === "open" ? null : (
          <span aria-hidden="true" className="block text-xs italic">
            {cancelled ? (
              <strong className="font-semibold not-italic uppercase">
                Cancelled
              </strong>
            ) : (
              slot.status
            )}
            {why ? `: ${why}` : ""}
          </span>
        )}
        {cell.possible.map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="block text-xs italic"
            data-possible
          >
            Possible disruption: {t}
          </span>
        ))}
      </td>
    );
  }
  if (cell.kind === "duty")
    return (
      <td
        {...common}
        aria-label={`Duty ${cell.label}, ${when}`}
        className={`${base} align-top bg-muted text-muted-foreground`}
      >
        <span aria-hidden="true" className="text-xs">
          Duty {cell.label}
        </span>
      </td>
    );
  if (cell.kind === "no-school")
    return (
      <td
        {...common}
        rowSpan={PERIODS_PER_DAY}
        className={`${base} bg-muted text-center align-middle text-muted-foreground`}
      >
        {reason ? <span className="text-xs">{reason}</span> : null}
      </td>
    );
  return <td {...common} className={`${base} align-top bg-card`} />;
}
