import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { TEACHER_PRINCIPAL } from "@planner/domain";
import { providerFor } from "./ai-provider.ts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import {
  describeStartupError,
  hasDailyBackup,
  pruneBackups,
  writeBackup,
} from "./db/backup.ts";
import { openDatabase } from "./db/connection.ts";
import { migrate } from "./db/migrate.ts";
import { createResourceGateway } from "./gateway/resource-gateway.ts";
import { localIsoDate } from "./today.ts";

const KEEP_BACKUPS = 7;
function readConfig() {
  try {
    return loadConfig(process.env);
  } catch (err) {
    console.error(
      `The planner could not start: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
const config = readConfig();

try {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(path.join(config.dataDir, "planner.sqlite"));
  const now = () => new Date();

  migrate(db, {
    migrationsDir: path.join(import.meta.dirname, "db/migrations"),
    beforeMigrating: () =>
      writeBackup(db, config.dataDir, "pre-migration", now()),
  });

  const today = localIsoDate(now(), config.timeZone);
  if (!hasDailyBackup(config.dataDir, today, config.timeZone)) {
    writeBackup(db, config.dataDir, "daily", now());
  }
  pruneBackups(config.dataDir, KEEP_BACKUPS);

  const server = serve(
    {
      fetch: createApp({
        ai: providerFor(config, process.env),
        config,
        db,
        now,
        principal: TEACHER_PRINCIPAL,
        gateway: createResourceGateway(config.resourcesDir),
        webDir: path.resolve(import.meta.dirname, "../../web/dist"),
      }).fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => console.log(`Planner API on http://${config.host}:${info.port}`),
  );
  server.on("error", (err) => {
    console.error(describeStartupError(err, config.dataDir));
    process.exit(1);
  });
} catch (err) {
  console.error(describeStartupError(err, config.dataDir));
  process.exit(1);
}
