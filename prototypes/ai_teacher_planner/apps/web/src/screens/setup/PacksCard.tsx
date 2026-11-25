import { Link } from "react-router";
import { useCourses } from "../../api/queries.ts";
import { ErrorState, Loading } from "../../components/ui/states.tsx";

const STATE = {
  none: "No pack yet",
  draft: "Draft, waiting for your review",
  locked: "Locked",
} as const;

/** Each course and where its pack stands, with a way in to review it. */
export function PacksCard() {
  const courses = useCourses();
  return (
    <section
      aria-labelledby="packs-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="packs-title" className="text-lg font-semibold">
        Curriculum packs
      </h2>
      {courses.error ? (
        <ErrorState message="The courses could not be loaded." />
      ) : !courses.data ? (
        <Loading what="the courses" />
      ) : (
        <ul className="mt-2 space-y-2">
          {courses.data.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1"
            >
              <span className="font-medium">{c.title}</span>
              <span className="text-muted-foreground">{STATE[c.pack]}</span>
              {c.pack === "none" ? null : (
                <Link
                  to={`/setup/courses/${c.id}/pack`}
                  className="text-link underline"
                >
                  {c.pack === "locked" ? "Open pack" : "Review pack"}
                  <span className="sr-only"> for {c.title}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PacksScreen() {
  return (
    <section aria-labelledby="packs-screen-title">
      <h1 id="packs-screen-title" className="text-2xl font-semibold">
        Curriculum packs
      </h1>
      <div className="mt-6">
        <PacksCard />
      </div>
    </section>
  );
}
