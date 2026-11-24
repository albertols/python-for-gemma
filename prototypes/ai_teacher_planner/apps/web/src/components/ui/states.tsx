import type { ReactNode } from "react";

/** The three states every screen has besides its content. */
export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="text-muted-foreground">
      Loading {what}...
    </p>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  children,
}: {
  title?: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div role="alert" className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-lg font-semibold text-danger">{title}</h2>
      <p className="mt-1">{message}</p>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-muted-foreground">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children ? <p className="mt-1">{children}</p> : null}
    </div>
  );
}
