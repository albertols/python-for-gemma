import { groupColour } from "../theme/group-colours.ts";

/** A group's name in its colour. Without a colour it is plain text. */
export function GroupBadge({
  id,
  colour,
}: {
  id: string;
  colour: string | undefined;
}) {
  if (!colour) return <span>{id}</span>;
  const { bg, fg } = groupColour(colour);
  return (
    <span
      className="rounded px-1.5 py-0.5 font-medium"
      style={{ background: bg, color: fg }}
    >
      {id}
    </span>
  );
}
