import { lastDaysBeforeBreaks } from "@planner/domain";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
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

const breakDaysOf = (days: BoardDays): ReadonlySet<string> =>
  new Set(lastDaysBeforeBreaks(days));

/** The days that end before a break of a week or more, found in the whole calendar. */
export function useLastDaysBeforeBreaks() {
  return useQuery({
    queryKey: ["board", "days", "all"],
    queryFn: () =>
      call<BoardDays>(() => api.api.calendar.days.$get({ query: {} })),
    select: breakDaysOf,
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

export type Disruption = InferResponseType<
  typeof api.api.disruptions.$get,
  200
>[number];
export type DisruptionBody = InferRequestType<
  typeof api.api.disruptions.$post
>["json"];
export type DisruptionHits = InferResponseType<
  (typeof api.api.disruptions.preview)["$post"],
  200
>["hits"];

/** Cancelling or restoring lessons changes what the board, Today and the audit show. */
function invalidateLessons(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["disruptions"] });
  void qc.removeQueries({ queryKey: ["disruption-preview"] });
  void qc.invalidateQueries({ queryKey: ["audit"] });
  invalidateBoard(qc);
}

export function useDisruptions() {
  return useQuery({
    queryKey: ["disruptions"],
    queryFn: () => call<Disruption[]>(() => api.api.disruptions.$get()),
  });
}

/** Every slot of the year, to count the lessons each cancellation took. */
export function useAllSlots() {
  return useQuery({
    queryKey: ["board", "slots", "all"],
    queryFn: () => call<BoardSlots>(() => api.api.slots.$get({ query: {} })),
  });
}

/** The lessons a cancellation would take. Nothing is stored. */
export function useDisruptionPreview(body: DisruptionBody | null) {
  return useQuery({
    queryKey: ["disruption-preview", body],
    enabled: body !== null,
    queryFn: () =>
      call<{ hits: DisruptionHits }>(() =>
        api.api.disruptions.preview.$post({
          json: body as DisruptionBody,
        }),
      ),
    select: (r) => r.hits,
  });
}

export function useCreateDisruption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DisruptionBody) =>
      call<Disruption[]>(() => api.api.disruptions.$post({ json: body })),
    onSuccess: () => invalidateLessons(qc),
  });
}

export function useRemoveDisruptionBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      call<{ removed: number }>(() =>
        api.api.disruptions.batch[":batchId"].$delete({ param: { batchId } }),
      ),
    onSuccess: () => invalidateLessons(qc),
  });
}

export type Corrections = InferResponseType<
  typeof api.api.calendar.corrections.$get,
  200
>;
export type LabelCorrectionBody = InferRequestType<
  (typeof api.api.calendar.corrections.labels)[":date"]["$put"]
>["json"];
export type ResolutionBody = InferRequestType<
  (typeof api.api.calendar.corrections.resolutions)[":date"]["$put"]
>["json"];

export function useCorrections() {
  return useQuery({
    queryKey: ["corrections"],
    queryFn: () => call<Corrections>(() => api.api.calendar.corrections.$get()),
  });
}

/** One day as the calendar and her corrections make it. */
export function useDay(date: string) {
  return useQuery({
    queryKey: ["board", "days", date, date],
    queryFn: () =>
      call<BoardDays>(() =>
        api.api.calendar.days.$get({ query: { from: date, to: date } }),
      ),
    select: (days) => days[0] ?? null,
  });
}

/** A correction or decision changes the report, the board, Today, the audit and the cancelled lessons. */
function invalidateCorrections(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["calendar-import"] });
  void qc.invalidateQueries({ queryKey: ["corrections"] });
  invalidateLessons(qc);
}

export function useSetLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, ...json }: { date: string } & LabelCorrectionBody) =>
      call<unknown>(() =>
        api.api.calendar.corrections.labels[":date"].$put({
          param: { date },
          json,
        }),
      ),
    onSuccess: () => invalidateCorrections(qc),
  });
}

export function useRemoveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) =>
      call<unknown>(() =>
        api.api.calendar.corrections.labels[":date"].$delete({
          param: { date },
        }),
      ),
    onSuccess: () => invalidateCorrections(qc),
  });
}

export function useSetResolution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, ...json }: { date: string } & ResolutionBody) =>
      call<unknown>(() =>
        api.api.calendar.corrections.resolutions[":date"].$put({
          param: { date },
          json,
        }),
      ),
    onSuccess: () => invalidateCorrections(qc),
  });
}

export function useRemoveResolution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) =>
      call<unknown>(() =>
        api.api.calendar.corrections.resolutions[":date"].$delete({
          param: { date },
        }),
      ),
    onSuccess: () => invalidateCorrections(qc),
  });
}

export type EventItem = InferResponseType<
  typeof api.api.events.$get,
  200
>[number];
export type StaleEvent = InferResponseType<
  typeof api.api.events.stale.$get,
  200
>[number];
export type ClassificationBody = InferRequestType<
  (typeof api.api.events.classifications)[":id"]["$put"]
>["json"];

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: () => call<EventItem[]>(() => api.api.events.$get()),
  });
}

export function useStaleEvents() {
  return useQuery({
    queryKey: ["events", "stale"],
    queryFn: () => call<StaleEvent[]>(() => api.api.events.stale.$get()),
  });
}

/** Confirming or undoing an event changes the list, the lessons, the board, Today and the audit. */
function invalidateEvents(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["events"] });
  void qc.invalidateQueries({ queryKey: ["calendar-import"] });
  void qc.invalidateQueries({ queryKey: ["audit"] });
  void qc.invalidateQueries({ queryKey: ["board", "slots"] });
  invalidateBoard(qc);
}

export function useSaveClassification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...json }: { id: string } & ClassificationBody) =>
      call<unknown>(() =>
        api.api.events.classifications[":id"].$put({ param: { id }, json }),
      ),
    onSuccess: () => invalidateEvents(qc),
  });
}

export function useRemoveClassification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call<unknown>(() =>
        api.api.events.classifications[":id"].$delete({ param: { id } }),
      ),
    onSuccess: () => invalidateEvents(qc),
  });
}

export type Exam = InferResponseType<typeof api.api.exams.$get, 200>[number];
export type ExamBody = InferRequestType<typeof api.api.exams.$post>["json"];

export function useExams() {
  return useQuery({
    queryKey: ["exams"],
    queryFn: () => call<Exam[]>(() => api.api.exams.$get()),
  });
}

/** An exam shows in Coming up on Today and in the audit's last-lesson list. */
function invalidateExams(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["exams"] });
  void qc.invalidateQueries({ queryKey: ["today"] });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExamBody) =>
      call<Exam>(() => api.api.exams.$post({ json: body })),
    onSuccess: () => invalidateExams(qc),
  });
}

export function useUpdateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...json }: { id: string } & ExamBody) =>
      call<Exam>(() => api.api.exams[":id"].$put({ param: { id }, json })),
    onSuccess: () => invalidateExams(qc),
  });
}

export function useRemoveExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call<unknown>(() => api.api.exams[":id"].$delete({ param: { id } })),
    onSuccess: () => invalidateExams(qc),
  });
}
