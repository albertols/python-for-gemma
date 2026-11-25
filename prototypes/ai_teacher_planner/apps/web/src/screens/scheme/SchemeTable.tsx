import type {
  CurriculumPack,
  GroupOverride,
  ItemKind,
  SowItem,
} from "@planner/domain";
import { weeksFor } from "@planner/domain";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { AiBadge } from "../../components/AiBadge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  editItem,
  isUnlinked,
  moveItem,
  removeItem,
  setOverride,
  specRefsOf,
} from "./scheme-model.ts";

const KIND: Record<ItemKind, string> = {
  teaching: "Chapter",
  project: "Project",
  revision: "Revision",
  buffer: "Buffer",
  assessment: "Assessment",
};

const FIELD =
  "rounded-md border border-border bg-background px-2 py-1 text-foreground";

/** A whole number she types. It follows her typing, and goes back to the stored number when she leaves it empty. */
function CountInput({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: number | null;
  placeholder?: string;
  onCommit: (n: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <input
      type="number"
      min={0}
      step={1}
      aria-label={label}
      value={text}
      placeholder={placeholder}
      className={`${FIELD} w-20`}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() === "") {
          if (value === null) return;
          // an empty group count means "same as the item"; an empty item count waits for a number
          if (placeholder !== undefined) onCommit(null);
          return;
        }
        const n = Number(e.target.value);
        if (Number.isInteger(n) && n >= 0) onCommit(n);
      }}
      onBlur={() => setText(value === null ? "" : String(value))}
    />
  );
}

function AssessmentFields({
  item,
  onChange,
}: {
  item: SowItem;
  onChange: (patch: Partial<SowItem>) => void;
}) {
  const a = item.assessment;
  if (!a) return null;
  const set = (patch: Partial<NonNullable<SowItem["assessment"]>>) =>
    onChange({ assessment: { ...a, ...patch } });
  const number = (text: string): number | null =>
    text.trim() === "" ? null : Math.max(0, Math.round(Number(text)));
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-sm">
        Date
        <input
          type="date"
          aria-label={`Date of ${item.title}`}
          value={a.date ?? ""}
          className={FIELD}
          onChange={(e) => set({ date: e.target.value || null })}
        />
      </label>
      <label className="flex flex-col text-sm">
        Marks
        <input
          type="number"
          min={0}
          aria-label={`Marks of ${item.title}`}
          value={a.marks ?? ""}
          className={`${FIELD} w-20`}
          onChange={(e) => set({ marks: number(e.target.value) })}
        />
      </label>
      <label className="flex flex-col text-sm">
        Minutes
        <input
          type="number"
          min={1}
          aria-label={`Minutes of ${item.title}`}
          value={a.durationMinutes ?? ""}
          className={`${FIELD} w-20`}
          onChange={(e) => {
            const n = number(e.target.value);
            set({ durationMinutes: n === 0 ? null : n });
          }}
        />
      </label>
      <label className="flex items-center gap-2 pb-1 text-sm">
        <input
          type="checkbox"
          aria-label={`${item.title} takes a whole lesson`}
          checked={a.slotUse === "whole"}
          onChange={(e) =>
            set({ slotUse: e.target.checked ? "whole" : "in-lesson" })
          }
        />
        Takes a whole lesson
      </label>
    </div>
  );
}

function SpecRefs({
  item,
  pack,
  onLink,
}: {
  item: SowItem;
  pack: CurriculumPack;
  onLink: (chapterId: string | null) => void;
}) {
  if (item.kind !== "teaching")
    return <span className="text-muted-foreground">Not a chapter</span>;
  const refs = specRefsOf(item, pack);
  return (
    <div className="space-y-1 text-sm">
      {isUnlinked(item) ? (
        <p className="font-medium">not linked to the specification</p>
      ) : (
        <>
          {refs.chapters.map((c) => (
            <p key={c}>{c}</p>
          ))}
          <p className="text-muted-foreground">
            {refs.codes.length > 0
              ? `Spec points ${refs.codes.join(", ")}`
              : "No spec points"}
          </p>
        </>
      )}
      <select
        aria-label={`Chapter for ${item.title}`}
        value={item.packRefs[0] ?? ""}
        className={`${FIELD} max-w-48`}
        onChange={(e) => onLink(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">Not linked</option>
        {pack.chapters.map((c) => (
          <option key={c.id} value={c.id}>
            Chapter {c.number}: {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}

const weeksText = (weeks: number) =>
  weeks === 1 ? "1 week" : `${weeks} weeks`;

/**
 * Her items in her order. Everything she changes is passed up as a new list; nothing
 * here saves. Rows move by their buttons, or by dragging the handle.
 */
export function SchemeTable({
  items,
  overrides,
  groupIds,
  perFortnight,
  pack,
  onItems,
  onOverrides,
  suggestionFor,
}: {
  items: SowItem[];
  overrides: GroupOverride[];
  groupIds: string[];
  perFortnight: Readonly<Record<string, number>>;
  pack: CurriculumPack;
  onItems: (items: SowItem[]) => void;
  onOverrides: (overrides: GroupOverride[]) => void;
  /** What to show under an item's row: the AI's suggestion for it, if there is one. */
  suggestionFor: (item: SowItem) => ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [counts, setCounts] = useState<Set<string>>(new Set());
  const [refusal, setRefusal] = useState<string | null>(null);
  const columns = 5 + groupIds.length;

  const toggleCounts = (id: string) =>
    setCounts((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      {refusal ? (
        <p role="alert" className="font-medium text-danger">
          {refusal}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Scheme of work</caption>
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="p-2">
                Order
              </th>
              <th scope="col" className="p-2">
                Item
              </th>
              <th scope="col" className="p-2">
                Lessons
              </th>
              {groupIds.map((g) => (
                <th key={g} scope="col" className="p-2">
                  Weeks for {g}
                </th>
              ))}
              <th scope="col" className="p-2">
                Specification
              </th>
              <th scope="col" className="p-2">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const hasOverrides = overrides.some((o) => o.itemId === item.id);
              const countsOpen = counts.has(item.id) || hasOverrides;
              return (
                <Fragment key={item.id}>
                  <tr
                    aria-label={item.title}
                    data-item={item.id}
                    className="border-t border-border align-top"
                    onDragOver={(e) => {
                      if (dragging) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging && dragging !== item.id) {
                        const from = items.findIndex((i) => i.id === dragging);
                        onItems(moveItem(items, dragging, index - from));
                      }
                      setDragging(null);
                    }}
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <span
                          draggable
                          aria-hidden="true"
                          title="Drag to move"
                          className="cursor-grab select-none px-1 text-muted-foreground"
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", item.id);
                            setDragging(item.id);
                          }}
                          onDragEnd={() => setDragging(null)}
                        >
                          ⋮⋮
                        </span>
                        <Button
                          type="button"
                          className="px-2 py-1"
                          disabled={index === 0}
                          aria-label={`Move up ${item.title}`}
                          onClick={() => onItems(moveItem(items, item.id, -1))}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          className="px-2 py-1"
                          disabled={index === items.length - 1}
                          aria-label={`Move down ${item.title}`}
                          onClick={() => onItems(moveItem(items, item.id, 1))}
                        >
                          Move down
                        </Button>
                      </div>
                    </td>
                    <td className="p-2">
                      <p className="text-sm text-muted-foreground">
                        {KIND[item.kind]}
                      </p>
                      <input
                        type="text"
                        aria-label={`Title of ${item.title}`}
                        value={item.title}
                        className={`${FIELD} w-full min-w-40`}
                        onChange={(e) =>
                          onItems(
                            editItem(items, item.id, { title: e.target.value }),
                          )
                        }
                      />
                      {item.assessment ? (
                        <AssessmentFields
                          item={item}
                          onChange={(patch) =>
                            onItems(editItem(items, item.id, patch))
                          }
                        />
                      ) : null}
                    </td>
                    <td className="p-2">
                      {item.kind === "assessment" ? (
                        <span className="text-muted-foreground">
                          {item.assessment?.slotUse === "in-lesson"
                            ? "Within a lesson"
                            : "1 lesson"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <CountInput
                            label={`Lessons for ${item.title}`}
                            value={item.lessons}
                            onCommit={(n) =>
                              n !== null &&
                              onItems(editItem(items, item.id, { lessons: n }))
                            }
                          />
                          {item.provenance.origin === "ai" &&
                          item.provenance.ai ? (
                            <AiBadge review={item.provenance.ai.review} />
                          ) : null}
                        </span>
                      )}
                    </td>
                    {groupIds.map((g) => {
                      const lessons = overrides.find(
                        (o) => o.groupId === g && o.itemId === item.id,
                      )?.lessons;
                      return (
                        <td key={g} className="p-2">
                          {item.kind === "assessment" ? (
                            <span className="text-muted-foreground">
                              <span className="sr-only">{g}: </span>-
                            </span>
                          ) : (
                            <>
                              <span className="sr-only">{g}: </span>
                              {weeksText(
                                weeksFor(
                                  lessons ?? item.lessons,
                                  perFortnight[g] ?? 0,
                                ),
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2">
                      <SpecRefs
                        item={item}
                        pack={pack}
                        onLink={(chapterId) =>
                          onItems(
                            editItem(items, item.id, {
                              packRefs: chapterId === null ? [] : [chapterId],
                            }),
                          )
                        }
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col items-start gap-1">
                        {item.kind === "assessment" ? null : (
                          <Button
                            type="button"
                            className="px-2 py-1"
                            aria-expanded={countsOpen}
                            disabled={hasOverrides}
                            onClick={() => toggleCounts(item.id)}
                          >
                            Group counts
                            <span className="sr-only"> for {item.title}</span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          className="px-2 py-1"
                          onClick={() => {
                            const done = removeItem(items, overrides, item.id);
                            if (done.ok) {
                              setRefusal(null);
                              onItems(done.items);
                              onOverrides(done.overrides);
                            } else
                              setRefusal(
                                `${item.title} cannot be deleted while ${done.blockedBy.join(", ")} depend${done.blockedBy.length === 1 ? "s" : ""} on it.`,
                              );
                          }}
                        >
                          Delete
                          <span className="sr-only"> {item.title}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {countsOpen && item.kind !== "assessment" ? (
                    <tr
                      aria-label={`Group counts for ${item.title}`}
                      className="bg-muted/40"
                    >
                      <td colSpan={columns} className="p-2">
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="text-sm text-muted-foreground">
                            A group's own number of lessons for {item.title}.
                            Empty means the same as the item.
                          </span>
                          {groupIds.map((g) => (
                            <span
                              key={g}
                              className="flex items-center gap-2 text-sm"
                            >
                              {g}
                              <CountInput
                                label={`Lessons for ${item.title} in ${g}`}
                                placeholder={String(item.lessons)}
                                value={
                                  overrides.find(
                                    (o) =>
                                      o.groupId === g && o.itemId === item.id,
                                  )?.lessons ?? null
                                }
                                onCommit={(n) =>
                                  onOverrides(
                                    setOverride(overrides, g, item.id, n),
                                  )
                                }
                              />
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {suggestionFor(item)}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
