import type {
  CalendarRow,
  Group,
  ParentsEvening,
  ReportWindow,
  Term,
  TimetableVersion,
} from "@planner/domain";
import type { ImportFinding } from "@planner/importers";

/** The text of a date cell as written, kept so Setup can list the ones that could not be read. */
export type StoredReportWindow = ReportWindow & {
  raw: {
    dataDeadline: string | null;
    hodReview: string | null;
    sentHome: string | null;
  };
};
export type StoredParentsEvening = ParentsEvening & { raw: string | null };

export interface StoredImport {
  id: number;
  fileName: string;
  fileHash: string;
  importedAt: string;
  findings: ImportFinding[];
}

export interface CalendarRepo {
  latestImport(): StoredImport | null;
  /** Sorted by date. */
  rows(): CalendarRow[];
  /** Replaces the stored calendar, report windows and parents' evenings wholesale. */
  replaceCalendar(input: {
    file: Omit<StoredImport, "id">;
    rows: CalendarRow[];
    windows: StoredReportWindow[];
    evenings: StoredParentsEvening[];
  }): void;
  /** Sorted by id. */
  windows(): StoredReportWindow[];
  /** Sorted by id. */
  evenings(): StoredParentsEvening[];
  /** Stores a corrected date. False when there is no such row. */
  setWindowDate(
    id: string,
    field: "dataDeadline" | "hodReview" | "sentHome",
    date: string,
  ): boolean;
  setEveningDate(id: string, date: string): boolean;
}

export interface TimetableRepo {
  /** Sorted by validFrom, then id. */
  versions(): TimetableVersion[];
  /** Sorted by id. */
  groups(): Group[];
  saveVersion(version: TimetableVersion): void;
  seed(versions: TimetableVersion[], groups: Group[]): void;
}

export interface SettingsRepo {
  /** Sorted by first day. Empty before the first run. */
  terms(): Term[];
  saveTerms(terms: Term[]): void;
  getFlag(key: string): boolean;
  setFlag(key: string): void;
}

export interface Repos {
  calendar: CalendarRepo;
  timetable: TimetableRepo;
  settings: SettingsRepo;
  /** Everything inside `fn` is stored together or not at all. */
  transaction<T>(fn: () => T): T;
}
