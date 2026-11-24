import { fullDay } from "../../lib/dates.ts";
import { groupColour } from "../../theme/group-colours.ts";
import type { BoardCell } from "./board-model.ts";

const PERIODS_PER_DAY = 6;
const base = "border border-border overflow-hidden p-1 text-sm";

/** One period of one day. In M1 a lesson shows only its group and room; M2 adds the lesson. */
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
    const double = cell.joinsNext
      ? `, double with period ${cell.period + 1}`
      : "";
    return (
      <td
        {...common}
        rowSpan={cell.joinsNext ? 2 : 1}
        aria-label={`${slot.groupId}, ${when}${slot.room ? `, room ${slot.room}` : ""}${double}${status}`}
        className={`${base} align-top ${cell.joinsNext ? "border-b-0" : ""}`}
        style={{ background: bg, color: fg }}
      >
        <span aria-hidden="true" className="block font-semibold">
          {slot.groupId}
        </span>
        {slot.room ? (
          <span aria-hidden="true" className="block text-xs">
            {slot.room}
          </span>
        ) : null}
        {slot.status === "open" ? null : (
          <span aria-hidden="true" className="block text-xs italic">
            {slot.status}
            {why ? `: ${why}` : ""}
          </span>
        )}
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
