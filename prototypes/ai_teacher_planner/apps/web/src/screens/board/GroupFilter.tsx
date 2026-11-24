import { groupColour } from "../../theme/group-colours.ts";

export interface FilterGroup {
  id: string;
  colour: string;
}

const toggle =
  "rounded-md border px-3 py-1.5 text-sm font-medium aria-pressed:ring-2 aria-pressed:ring-foreground";

/** "Show": one toggle per group, in its colour, and All. A pressed button is the same state as its aria-pressed. */
export function GroupFilter({
  groups,
  chosen,
  onToggle,
  onAll,
}: {
  groups: readonly FilterGroup[];
  /** The groups shown, or null for all of them. */
  chosen: ReadonlySet<string> | null;
  onToggle: (id: string) => void;
  onAll: () => void;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0 flex flex-wrap items-center gap-2">
      <legend className="sr-only">Show</legend>
      <span aria-hidden="true" className="text-sm">
        Show
      </span>
      <button
        type="button"
        aria-pressed={chosen === null}
        onClick={onAll}
        className={`${toggle} border-border bg-card text-card-foreground`}
      >
        All
      </button>
      {groups.map((g) => {
        const on = chosen?.has(g.id) ?? false;
        const { bg, fg } = groupColour(g.colour);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(g.id)}
            className={`${toggle} ${on ? "" : "border-border bg-card text-card-foreground"}`}
            style={
              on
                ? { background: bg, color: fg, borderColor: "currentColor" }
                : { borderLeft: `8px solid ${bg}` }
            }
          >
            {g.id}
          </button>
        );
      })}
    </fieldset>
  );
}
