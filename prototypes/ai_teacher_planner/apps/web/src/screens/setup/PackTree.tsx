import type {
  CurriculumPack,
  PackChapter,
  PackUnit,
  SpecPoint,
} from "@planner/domain";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PackReviewNotes } from "../../api/queries.ts";
import { AiBadge } from "../../components/AiBadge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  withLink,
  withoutLink,
  withPointTitle,
  withUnitScope,
  withUnitTitle,
} from "../../lib/pack-review.ts";

const field = "rounded-md border border-border bg-card px-2 py-1";
const pageText = (page: number | null) =>
  page === null ? "No page" : `Page ${page}`;

/** A title with an Edit button; editing opens one text box with Save and Cancel. Model text stays text. */
function TitleEditor({
  what,
  value,
  editable,
  onSave,
}: {
  /** The code, to tell one Edit button from the next. */
  what: string;
  value: string;
  editable: boolean;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const edit = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  // After Save or Cancel the focus goes back to the Edit button, so the keyboard keeps its place.
  useEffect(() => {
    if (wasEditing.current && !editing) edit.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  if (editing)
    return (
      <form
        className="inline-flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const title = new FormData(e.currentTarget).get("title");
          if (typeof title === "string") onSave(title);
          setEditing(false);
        }}
      >
        <input
          name="title"
          type="text"
          aria-label={`Title of ${what}`}
          className={field}
          defaultValue={value}
          maxLength={200}
          // biome-ignore lint/a11y/noAutofocus: she just pressed Edit; the box is where she goes next
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
        <Button type="submit" variant="primary">
          Save title
        </Button>
        <Button type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  return (
    <>
      <span>{value}</span>
      {editable ? (
        <Button
          ref={edit}
          type="button"
          aria-label={`Edit title of ${what}`}
          onClick={() => setEditing(true)}
        >
          Edit title
        </Button>
      ) : null}
    </>
  );
}

function LinkAdder({
  point,
  options,
  busy,
  onAdd,
}: {
  point: SpecPoint;
  options: PackChapter[];
  busy: boolean;
  onAdd: (chapterId: string) => void;
}) {
  const [chosen, setChosen] = useState("");
  if (options.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        aria-label={`Chapter to link to ${point.code}`}
        className={field}
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
      >
        <option value="">Choose a chapter</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {`Chapter ${c.number}: ${c.title}`}
          </option>
        ))}
      </select>
      <Button
        type="button"
        disabled={chosen === "" || busy}
        aria-label={`Link chapter to ${point.code}`}
        onClick={() => {
          onAdd(chosen);
          setChosen("");
        }}
      >
        Link chapter
      </Button>
    </div>
  );
}

interface TreeProps {
  pack: CurriculumPack;
  /** The AI's notes, only while the pack is a draft: they carry the AI badge. */
  review: PackReviewNotes | null;
  readOnly: boolean;
  busy: boolean;
  checked: ReadonlySet<string>;
  onCheck: (unitId: string, checked: boolean) => void;
  onChange: (pack: CurriculumPack) => void;
}

function SpecPointItem({
  point,
  id,
  tabIndex,
  props,
}: {
  point: SpecPoint;
  id: string;
  tabIndex: number;
  props: TreeProps;
}) {
  const { pack, review, readOnly, busy, onChange } = props;
  const linked = pack.chapters.filter((c) => c.specPointIds.includes(point.id));
  const free = pack.chapters.filter((c) => !c.specPointIds.includes(point.id));
  const reasonFor = (c: PackChapter) =>
    review?.linkReasons.find(
      (r) => r.chapterNumber === c.number && r.specPointId === point.id,
    )?.reason;
  return (
    <li
      role="treeitem"
      aria-selected={false}
      aria-level={2}
      data-tree-id={id}
      tabIndex={tabIndex}
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{point.code}</span>
        <TitleEditor
          what={point.code}
          value={point.title}
          editable={!readOnly}
          onSave={(t) => onChange(withPointTitle(pack, point.id, t))}
        />
        <span className="text-muted-foreground">
          {point.level === "hl-only" ? "Higher level only" : "Core"}
        </span>
        <span className="text-muted-foreground">{pageText(point.page)}</span>
      </div>
      {linked.length === 0 ? (
        <p className="mt-2 text-sm">No chapter is linked to this point.</p>
      ) : (
        <ul
          aria-label={`Chapters linked to ${point.code}`}
          className="mt-2 space-y-2"
        >
          {linked.map((c) => {
            const reason = reasonFor(c);
            return (
              <li key={c.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{`Chapter ${c.number}: ${c.title}`}</span>
                  <span className="text-muted-foreground">
                    {pageText(c.page)}
                  </span>
                  {readOnly ? null : (
                    <Button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove link from ${point.code} to chapter ${c.number}`}
                      onClick={() =>
                        onChange(withoutLink(pack, c.id, point.id))
                      }
                    >
                      Remove link
                    </Button>
                  )}
                </div>
                {reason ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <AiBadge review="suggested" /> Why: {reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {readOnly ? null : (
        <LinkAdder
          point={point}
          options={free}
          busy={busy}
          onAdd={(chapterId) => onChange(withLink(pack, chapterId, point.id))}
        />
      )}
    </li>
  );
}

function UnitItem({
  unit,
  open,
  tabIndex,
  tabIndexOf,
  onToggle,
  props,
}: {
  unit: PackUnit;
  open: boolean;
  tabIndex: number;
  tabIndexOf: (id: string) => number;
  onToggle: () => void;
  props: TreeProps;
}) {
  const { pack, readOnly, busy, checked, onCheck, onChange } = props;
  const points = pack.specPoints.filter((p) => p.unitId === unit.id);
  return (
    <li
      role="treeitem"
      aria-selected={false}
      aria-level={1}
      aria-expanded={open}
      data-tree-id={`unit:${unit.id}`}
      tabIndex={tabIndex}
      className="rounded-lg border border-border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          aria-label={`${open ? "Hide points" : "Show points"} of unit ${unit.code}`}
          onClick={onToggle}
        >
          {open ? "Hide points" : "Show points"}
        </Button>
        <span className="text-lg font-semibold">{unit.code}</span>
        <span className="inline-flex items-center gap-2 text-lg">
          <TitleEditor
            what={unit.code}
            value={unit.title}
            editable={!readOnly}
            onSave={(t) => onChange(withUnitTitle(pack, unit.id, t))}
          />
        </span>
        {readOnly ? (
          <span className="text-muted-foreground">
            {unit.inScope ? "In scope" : "Out of scope"}
          </span>
        ) : (
          <>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={unit.inScope}
                disabled={busy}
                onChange={(e) =>
                  onChange(withUnitScope(pack, unit.id, e.target.checked))
                }
              />
              In scope
            </label>
            {unit.inScope ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked.has(unit.id)}
                  onChange={(e) => onCheck(unit.id, e.target.checked)}
                />
                Checked
              </label>
            ) : null}
          </>
        )}
      </div>
      {open ? (
        // biome-ignore lint/a11y/useSemanticElements: the ARIA tree pattern groups nested items with role=group
        <ul
          role="group"
          aria-label={`Points in ${unit.code}`}
          className="mt-3 space-y-2"
        >
          {points.map((p) => (
            <SpecPointItem
              key={p.id}
              point={p}
              id={`point:${p.id}`}
              tabIndex={tabIndexOf(`point:${p.id}`)}
              props={props}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Units, then their spec points, then the chapters that link to each, as a tree
 * (the ARIA tree pattern): one Tab stop; Up and Down move, Right opens or goes in, Left
 * closes or goes out, Enter or Space opens and closes, Home and End go to the ends.
 */
export function PackTree(props: TreeProps): ReactNode {
  const root = useRef<HTMLUListElement>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const firstId = props.pack.units[0] ? `unit:${props.pack.units[0].id}` : "";
  const current = active ?? firstId;
  const tabIndexOf = (id: string) => (id === current ? 0 : -1);

  const toggle = (unitId: string, open: boolean) => {
    setActive(`unit:${unitId}`);
    setClosed((was) => {
      const next = new Set(was);
      if (open) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const items = () => [
    ...(root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []),
  ];
  const focusItem = (el: HTMLElement | undefined) => {
    if (!el) return;
    setActive(el.dataset.treeId ?? null);
    el.focus();
  };

  // Only a key pressed on the tree item itself is a tree key; a box or button inside keeps its own keys.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const el = e.target as HTMLElement;
    if (el.getAttribute("role") !== "treeitem") return;
    const all = items();
    const at = all.indexOf(el);
    const isUnit = el.getAttribute("aria-level") === "1";
    const unitId = el.dataset.treeId?.replace(/^unit:/, "") ?? "";
    const open = el.getAttribute("aria-expanded") === "true";
    let handled = true;
    switch (e.key) {
      case "ArrowDown":
        focusItem(all[at + 1]);
        break;
      case "ArrowUp":
        focusItem(all[at - 1]);
        break;
      case "Home":
        focusItem(all[0]);
        break;
      case "End":
        focusItem(all[all.length - 1]);
        break;
      case "ArrowRight":
        if (isUnit && !open) toggle(unitId, true);
        else if (isUnit) focusItem(all[at + 1]);
        break;
      case "ArrowLeft":
        if (isUnit && open) toggle(unitId, false);
        else if (!isUnit)
          focusItem(
            el.parentElement?.closest<HTMLElement>('[role="treeitem"]') ??
              undefined,
          );
        break;
      case "Enter":
      case " ":
        if (isUnit) toggle(unitId, !open);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  return (
    <ul
      ref={root}
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA tree pattern is a list with the tree role
      role="tree"
      aria-label="Curriculum pack"
      className="space-y-3"
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        const el = e.target as HTMLElement;
        if (el.getAttribute("role") === "treeitem")
          setActive(el.dataset.treeId ?? null);
      }}
    >
      {props.pack.units.map((u) => (
        <UnitItem
          key={u.id}
          unit={u}
          open={!closed.has(u.id)}
          tabIndex={tabIndexOf(`unit:${u.id}`)}
          tabIndexOf={tabIndexOf}
          onToggle={() => toggle(u.id, closed.has(u.id))}
          props={props}
        />
      ))}
    </ul>
  );
}
