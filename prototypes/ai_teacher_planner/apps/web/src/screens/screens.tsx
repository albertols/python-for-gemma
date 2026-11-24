import { useConfig } from "../api/queries.ts";
import { EmptyState, ErrorState, Loading } from "../components/ui/states.tsx";

export function TodayScreen() {
  const config = useConfig();
  if (config.isPending) return <Loading what="today" />;
  if (config.isError) return <ErrorState message={config.error.message} />;
  return (
    <section aria-labelledby="today-title">
      <h1 id="today-title" className="text-2xl font-semibold">
        Today
      </h1>
      <p className="mt-1 text-muted-foreground">{config.data.today}</p>
      <div className="mt-6">
        <EmptyState title="No lessons to show yet">
          Today's lessons arrive with the fortnight board.
        </EmptyState>
      </div>
    </section>
  );
}

function Placeholder({ title, children }: { title: string; children: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-6">
        <EmptyState title="Nothing here yet">{children}</EmptyState>
      </div>
    </section>
  );
}

export const BoardScreen = () => (
  <Placeholder title="Board">
    The fortnight board is built in a later task.
  </Placeholder>
);
export const AuditScreen = () => (
  <Placeholder title="Slot audit">
    The slot audit is built in a later task.
  </Placeholder>
);
export const NotFoundScreen = () => (
  <section>
    <h1 className="text-2xl font-semibold">Page not found</h1>
    <div className="mt-6">
      <EmptyState title="There is no page at this address">
        Use the navigation above to go back to Today.
      </EmptyState>
    </div>
  </section>
);
