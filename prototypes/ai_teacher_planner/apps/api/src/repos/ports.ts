import type {
  CalendarRow,
  Disruption,
  FindingResolution,
  Group,
  LabelCorrection,
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

/** A disruption as stored: which cancellation it came from, and when. */
export type StoredDisruption = Disruption & {
  batchId: string;
  createdAt: string;
};

export interface DisruptionRepo {
  /** Sorted by first day, then id. */
  list(): StoredDisruption[];
  add(rows: StoredDisruption[]): void;
  /** Removes every row of one cancellation. Returns how many rows went. */
  removeBatch(batchId: string): number;
}

/** Her corrections to the calendar. A new import never touches them. */
export interface CorrectionRepo {
  /** Sorted by date. */
  labels(): LabelCorrection[];
  /** Replaces any correction already on that date. */
  setLabel(correction: LabelCorrection, createdAt: string): void;
  /** False when there was none. */
  removeLabel(date: string): boolean;
  /** Sorted by date. */
  resolutions(): FindingResolution[];
  /** Replaces any resolution already on that date. */
  setResolution(resolution: FindingResolution, createdAt: string): void;
  /** False when there was none. */
  removeResolution(date: string): boolean;
}

export interface Repos {
  calendar: CalendarRepo;
  timetable: TimetableRepo;
  settings: SettingsRepo;
  disruptions: DisruptionRepo;
  corrections: CorrectionRepo;
  /** Everything inside `fn` is stored together or not at all. */
  transaction<T>(fn: () => T): T;
}
