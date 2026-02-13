#!/usr/bin/env node
// Migrate all agent API keys from cmk_ prefix to cbk_ prefix
// Usage: node scripts/migrate-api-keys.mjs

import Database from "better-sqlite3";
import { resolve } from "path";

const dbPath = resolve(process.cwd(), "prisma/dev.db");
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);

const agents = db.prepare("SELECT id, apiKey FROM Agent WHERE apiKey LIKE 'cmk_%'").all();
console.log(`Found ${agents.length} agent(s) with cmk_ prefix`);

if (agents.length === 0) {
  console.log("Nothing to migrate.");
  db.close();
  process.exit(0);
}

const update = db.prepare("UPDATE Agent SET apiKey = ? WHERE id = ?");
const migrate = db.transaction(() => {
  for (const agent of agents) {
    const newKey = "cbk_" + agent.apiKey.slice(4); // cmk_ → cbk_ (same length)
    update.run(newKey, agent.id);
    console.log(`  ${agent.id}: ${agent.apiKey.slice(0, 8)}... → ${newKey.slice(0, 8)}...`);
  }
});

migrate();
console.log(`\n✅ Migrated ${agents.length} API key(s) from cmk_ to cbk_`);
db.close();
