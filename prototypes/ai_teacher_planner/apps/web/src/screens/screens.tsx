import { EmptyState } from "../components/ui/states.tsx";

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
