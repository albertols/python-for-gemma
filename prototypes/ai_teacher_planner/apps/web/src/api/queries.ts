import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api, call } from "./client.ts";

/** One try: when the planner is not running, say so at once instead of waiting. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export type PlannerConfig = InferResponseType<typeof api.api.config.$get, 200>;

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => call<PlannerConfig>(() => api.api.config.$get()),
  });
}

export type ImportSummary = NonNullable<
  InferResponseType<(typeof api.api.calendar.import)["$get"], 200>
>;
export type Term = InferResponseType<typeof api.api.terms.$get, 200>[number];
export type TimetableData = InferResponseType<
  typeof api.api.timetable.$get,
  200
>;
export type ReportIssue = ImportSummary["reportIssues"][number];

export function useImportSummary() {
  return useQuery({
    queryKey: ["calendar-import"],
    queryFn: () =>
      call<ImportSummary | null>(() => api.api.calendar.import.$get()),
  });
}

/** The import changes the calendar, so everything built from it is stale. */
export function useRunImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call<ImportSummary>(() => api.api.calendar.import.$post()),
    onSuccess: (summary) => {
      qc.setQueryData(["calendar-import"], summary);
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useSaveReportDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issue, date }: { issue: ReportIssue; date: string }) =>
      issue.kind === "report-window"
        ? call<ImportSummary>(() =>
            api.api.reports.windows[":id"].date.$put({
              param: { id: issue.id },
              json: {
                field: issue.field as "dataDeadline" | "hodReview" | "sentHome",
                date,
              },
            }),
          )
        : call<ImportSummary>(() =>
            api.api.reports.evenings[":id"].date.$put({
              param: { id: issue.id },
              json: { date },
            }),
          ),
    onSuccess: (summary) => qc.setQueryData(["calendar-import"], summary),
  });
}

export function useTerms() {
  return useQuery({
    queryKey: ["terms"],
    queryFn: () => call<Term[]>(() => api.api.terms.$get()),
  });
}

export function useSaveTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (terms: Term[]) =>
      call<Term[]>(() => api.api.terms.$put({ json: terms })),
    onSuccess: (terms) => qc.setQueryData(["terms"], terms),
  });
}

export function useTimetable() {
  return useQuery({
    queryKey: ["timetable"],
    queryFn: () => call<TimetableData>(() => api.api.timetable.$get()),
  });
}

export type TimetableVersionData = TimetableData["versions"][number];

export function useSaveTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      entries,
      duties,
    }: Pick<TimetableVersionData, "id" | "entries" | "duties">) =>
      call<TimetableVersionData>(() =>
        api.api.timetable[":id"].$put({
          param: { id },
          json: { entries, duties },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["timetable"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useCreateTimetableVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { validFrom: string; copyOf: string }) =>
      call<TimetableVersionData>(() =>
        api.api.timetable.versions.$post({ json: input }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["timetable"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
