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

/** What the board shows is built from these, so anything that changes the calendar or timetable refreshes them. */
function invalidateBoard(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["fortnights"] });
  void qc.invalidateQueries({ queryKey: ["board"] });
  void qc.invalidateQueries({ queryKey: ["today"] });
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
      invalidateBoard(qc);
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
    onSuccess: (summary) => {
      qc.setQueryData(["calendar-import"], summary);
      void qc.invalidateQueries({ queryKey: ["today"] });
    },
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
    onSuccess: (terms) => {
      qc.setQueryData(["terms"], terms);
      invalidateBoard(qc);
    },
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
      invalidateBoard(qc);
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
      invalidateBoard(qc);
    },
  });
}

export type Fortnights = InferResponseType<typeof api.api.fortnights.$get, 200>;
export type BoardDays = InferResponseType<
  typeof api.api.calendar.days.$get,
  200
>;
export type BoardSlots = InferResponseType<typeof api.api.slots.$get, 200>;

export function useFortnights() {
  return useQuery({
    queryKey: ["fortnights"],
    queryFn: () => call<Fortnights>(() => api.api.fortnights.$get()),
  });
}

/** Only the dates of the fortnight on screen, not the whole year. */
export function useBoardDays(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ["board", "days", from, to],
    enabled: from !== null && to !== null,
    queryFn: () =>
      call<BoardDays>(() =>
        api.api.calendar.days.$get({
          query: { from: from ?? "", to: to ?? "" },
        }),
      ),
  });
}

export function useBoardSlots(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ["board", "slots", from, to],
    enabled: from !== null && to !== null,
    queryFn: () =>
      call<BoardSlots>(() =>
        api.api.slots.$get({ query: { from: from ?? "", to: to ?? "" } }),
      ),
  });
}

export type TodayData = InferResponseType<typeof api.api.today.$get, 200>;
export type AuditData = InferResponseType<typeof api.api.audit.$get, 200>;

export function useToday() {
  return useQuery({
    queryKey: ["today"],
    queryFn: () => call<TodayData>(() => api.api.today.$get()),
  });
}

export function useAudit() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => call<AuditData>(() => api.api.audit.$get()),
  });
}

/** The calendar's own words for one day (a holiday's name), if it has any. */
export function useDayText(date: string | null) {
  return useQuery({
    queryKey: ["board", "days", date, date],
    enabled: date !== null,
    queryFn: () =>
      call<BoardDays>(() =>
        api.api.calendar.days.$get({
          query: { from: date ?? "", to: date ?? "" },
        }),
      ),
    select: (days) => days[0]?.text ?? null,
  });
}
