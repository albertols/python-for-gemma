import { type ReactNode, useEffect, useId, useRef, useState } from "react";

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape closes the innermost panel only: a popover inside the drawer goes first.
      if (panel.current?.querySelector('[role="dialog"]')) return;
      setOpen(false);
      button.current?.focus();
    };
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
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
        className="rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-card-foreground hover:bg-muted"
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
                  setOpen(false);
                  button.current?.focus();
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
