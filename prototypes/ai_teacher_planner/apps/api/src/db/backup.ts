import fs from "node:fs";
import path from "node:path";
import { localIsoDate } from "../today.ts";
import type { Database } from "./connection.ts";

export type BackupReason = "pre-migration" | "daily";

const BACKUP_NAME = /^planner-(\d{8})-(\d{6})-(pre-migration|daily)\.sqlite$/;
const backupsDir = (dataDir: string) => path.join(dataDir, "backups");

function stamp(now: Date): string {
  const iso = now.toISOString(); // UTC, so names sort in time order
  return `${iso.slice(0, 10).replaceAll("-", "")}-${iso.slice(11, 19).replaceAll(":", "")}`;
}

/**
 * The one synchronous writer. `VACUUM INTO` is SQLite's own consistent copy of a
 * live WAL database. Written under a temporary name, then renamed, so a half-made
 * copy is never mistaken for a backup.
 */
export function writeBackup(
  db: Database,
  dataDir: string,
  reason: BackupReason,
  now: Date,
): string {
  const dir = backupsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const final = path.join(dir, `planner-${stamp(now)}-${reason}.sqlite`);
  const partial = `${final}.partial`;
  fs.rmSync(partial, { force: true });
  try {
    db.prepare("VACUUM INTO ?").run(partial);
    fs.renameSync(partial, final);
  } catch (err) {
    fs.rmSync(partial, { force: true });
    throw err;
  }
  return final;
}

export function backupDatabase(
  db: Database,
  dataDir: string,
  reason: BackupReason,
  now: Date,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      resolve(writeBackup(db, dataDir, reason, now));
    } catch (err) {
      reject(err);
    }
  });
}

function listBackups(dataDir: string): string[] {
  const dir = backupsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => BACKUP_NAME.test(f))
    .sort(); // names start with a UTC timestamp, so oldest first
}

/** Removes all but the newest `keep` backups. Returns the files removed, oldest first. */
export function pruneBackups(dataDir: string, keep: number): string[] {
  const all = listBackups(dataDir);
  const doomed = all.slice(0, Math.max(0, all.length - keep));
  return doomed.map((f) => {
    const full = path.join(backupsDir(dataDir), f);
    fs.rmSync(full);
    return full;
  });
}

/** True when a `daily` backup already exists for the local date `today`. */
export function hasDailyBackup(
  dataDir: string,
  today: string,
  timeZone: string,
): boolean {
  return listBackups(dataDir).some((f) => {
    const [, d, t, reason] = BACKUP_NAME.exec(f) ?? [];
    if (reason !== "daily" || !d || !t) return false;
    const at = new Date(
      `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}Z`,
    );
    return localIsoDate(at, timeZone) === today;
  });
}

/** One readable line for a failed start-up. */
export function describeStartupError(err: unknown, dataDir: string): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
  if (typeof code === "string" && /^SQLITE_(CORRUPT|NOTADB)/.test(code)) {
    const newest = listBackups(dataDir).at(-1);
    const hint = newest
      ? `the newest backup is backups/${newest}`
      : "there is no backup in backups/ yet";
    return oneLine(
      `The database file ${path.join(dataDir, "planner.sqlite")} is damaged (${message}); ${hint}. Copy it over planner.sqlite after stopping the app.`,
    );
  }
  if (code === "EADDRINUSE") {
    return "The planner could not start: its port is already in use. Is it already running?";
  }
  return oneLine(`The planner could not start: ${message}`);
}
