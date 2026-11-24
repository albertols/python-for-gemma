import { CalendarImportCard } from "./CalendarImportCard.tsx";
import { DisruptionsCard } from "./DisruptionsCard.tsx";
import { TermsCard } from "./TermsCard.tsx";
import { TimetableEditor } from "./TimetableEditor.tsx";

export function SetupScreen() {
  return (
    <section aria-labelledby="setup-title">
      <h1 id="setup-title" className="text-2xl font-semibold">
        Setup
      </h1>
      <div className="mt-6 space-y-6">
        <CalendarImportCard />
        <TermsCard />
        <DisruptionsCard />
        <TimetableEditor />
      </div>
    </section>
  );
}
