import BetterSqlite3 from "better-sqlite3";

export type Database = BetterSqlite3.Database;

/** Opens (creating if needed) a SQLite file with WAL and foreign keys on. ":memory:" for tests. */
export function openDatabase(file: string): Database {
  const db = new BetterSqlite3(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
