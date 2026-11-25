import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { layers } from "./layers.ts";

/**
 * A button that opens a small panel beside it. Escape or a click outside closes it and the
 * focus goes back to the button. The panel is a named dialog (not modal), so a reader hears it.
 */
export function Disclosure({
  label,
  buttonLabel,
  children,
  defaultOpen = false,
  className = "",
  panelClassName = "",
  buttonClassName = "",
  side = false,
}: {
  /** The panel's name. */
  label: string;
  /** What the button says; the panel's name when not given. */
  buttonLabel?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  panelClassName?: string;
  /** Added to the button's own classes, for a button that must fit a small space. */
  buttonClassName?: string;
  /** A tall panel fixed to the right edge of the window, with its own Close button. */
  side?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const firstRender = useRef(true);

  // Opening by hand moves the focus into the panel, so the keyboard lands where the change is.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (open) panel.current?.focus();
  }, [open]);

  // After a close by keyboard or the Close button, the focus returns to the button. This runs
  // once the page behind a side panel is reachable again.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      button.current?.focus();
    }
  }, [open]);

  // A side panel is modal: everything outside it is inert while it is open.
  useEffect(() => {
    if (!open || !side || !panel.current) return;
    const made: HTMLElement[] = [];
    let node: HTMLElement | null = panel.current;
    while (node?.parentElement) {
      for (const sibling of node.parentElement.children)
        if (
          sibling !== node &&
          sibling instanceof HTMLElement &&
          !sibling.inert
        ) {
          sibling.inert = true;
          made.push(sibling);
        }
      node = node.parentElement;
    }
    return () => {
      for (const el of made) el.inert = false;
    };
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const layer = layers.open();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !layers.isTop(layer)) return;
      returnFocus.current = true;
      setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      layers.close(layer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <span ref={root} className={`relative inline-block ${className}`}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className={`rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-card-foreground hover:bg-muted ${buttonClassName}`}
      >
        {buttonLabel ?? label}
      </button>
      {open ? (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          aria-modal={side ? true : undefined}
          className={
            side
              ? `fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-border bg-card p-4 text-sm text-card-foreground shadow-xl ${panelClassName}`
              : `absolute left-0 z-20 mt-1 w-80 max-w-[90vw] rounded-lg border border-border bg-card p-3 text-sm text-card-foreground shadow-lg ${panelClassName}`
          }
        >
          {side ? (
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{label}</h2>
              <button
                type="button"
                onClick={() => {
                  returnFocus.current = true;
                  setOpen(false);
                }}
                className="rounded-md border border-border px-2 py-1 hover:bg-muted"
              >
                Close
              </button>
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </span>
  );
}
