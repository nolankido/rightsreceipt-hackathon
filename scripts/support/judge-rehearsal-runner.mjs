/** Canonical judge rehearsal and populated reset. No application DB path is accepted. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetSeed, seedSnapshot } from "../db-local.mjs";
import { DOMAIN_TABLES, PERSISTENCE_MIGRATIONS, PERSISTENCE_SCHEMA_VERSION } from "../../packages/persistence/src/manifest.ts";
import { transactionBrowserFixture } from "./transaction-browser-fixture.mjs";
import { NOW } from "./human-consent-fixture.mjs";
import { runJudgeJourney } from "./judge-rehearsal-journey.mjs";
import { judgeScenarioOutcomeSha256 } from "./judge-rehearsal-report.mjs";
import { createRehearsalWorkerEnvironment } from "./judge-rehearsal-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const seedTables = new Set(["creator_workspaces", "assets", "pricing_policy_versions", "demo_reset_epochs"]);
const tables = [...DOMAIN_TABLES].sort();

function rows(fixture) {
  const actual = fixture.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
  assert.deepEqual(actual, tables);
  assert.deepEqual(fixture.db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(fixture.db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  return Object.fromEntries(tables.map(table => [table, fixture.count(table)]));
}

function baseline(fixture) {
  const counts = rows(fixture), snapshot = seedSnapshot(fixture.db);
  for (const table of tables) assert.equal(counts[table], seedTables.has(table) ? 1 : 0, "The rehearsal must start from seed data only.");
  assert.deepEqual(fixture.migrationHashes.map(item => item.name), [...PERSISTENCE_MIGRATIONS]);
  assert.equal(snapshot.snapshot.rows.reset.schema_version, PERSISTENCE_SCHEMA_VERSION);
  return { hash: snapshot.sha256, migrationCount: PERSISTENCE_MIGRATIONS.length, domainTableCount: tables.length, rows: counts };
}

/** Hash actual source bytes, independent of random case IDs, output paths and clock time. */
export function rehearsalSourceFingerprint() {
  const files = [];
  function collect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name.startsWith("run-")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (entry.isFile() && /\.(?:ts|tsx|mjs|sql|json)$/u.test(entry.name)) files.push(path);
    }
  }
  for (const directory of ["apps", "packages", "scripts", "migrations", "seed"]) collect(join(root, directory));
  files.push(join(root, "package.json"), join(root, "wrangler.jsonc"));
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    const content = readFileSync(path), name = relative(root, path).replaceAll("\\", "/");
    hash.update(name + "\0" + content.length + "\0"); hash.update(content);
  }
  return hash.digest("hex");
}

function checkoutMetadata() {
  const environment = { ...createRehearsalWorkerEnvironment(process.env), GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
  const call = args => spawnSync("git", ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-C", root, ...args], { env: environment, encoding: "utf8", timeout: 5000,
    maxBuffer: 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const revision = call(["rev-parse", "--verify", "HEAD"]);
  if (revision.status !== 0 || !/^[a-f0-9]{40}$/u.test(revision.stdout.trim())) return { sourceRevision: null, sourceClean: null };
  const status = call(["status", "--porcelain", "--untracked-files=normal"]);
  return { sourceRevision: revision.stdout.trim(), sourceClean: status.status === 0 ? status.stdout.trim().length === 0 : null };
}

export async function runJudgeRehearsal({ onPhase = () => {}, externalAttempts = () => 0 } = {}) {
  const sourceFingerprint = rehearsalSourceFingerprint(), source = checkoutMetadata();
  const scenarios = [], resets = [], privateChecks = [];
  let firstBaseline = null;
  for (const id of ["ordinary", "recovery", "repeat"]) {
    onPhase("baseline_" + id);
    // The fixture's API has no disk path option. This database belongs to this run.
    const fixture = transactionBrowserFixture({ initialCase: false });
    try {
      resetSeed(fixture.db);
      const start = baseline(fixture);
      if (firstBaseline === null) firstBaseline = start;
      else assert.deepEqual(start, firstBaseline);
      assert.equal(fixture.providerCalls.length, 0);
      onPhase("scenario_" + id);
      const journey = await runJudgeJourney(fixture, { scenario: id === "recovery" ? "lost_send_reply" : "ordinary" });
      const result = id === "repeat" ? { ...journey.result, id: "repeat", label: "Repeated ordinary journey" } : journey.result;
      scenarios.push(result); privateChecks.push(journey.assertSafeArtifacts);
      const rowsBefore = rows(fixture);
      onPhase("reset_" + id);
      // Run the real seed reset against the populated, explicitly owned memory DB.
      resetSeed(fixture.db);
      const restored = baseline(fixture); assert.deepEqual(restored, firstBaseline);
      const access = await journey.verifyRetiredAccess(fixture);
      assert.deepEqual(baseline(fixture), firstBaseline);
      resets.push({ afterScenario: id, baselineMatches: true, transactionsCleared: true, ...access,
        rowsBefore, rowsAfter: restored.rows });
      assert.equal(externalAttempts(), 0);
    } finally { fixture.close(); }
    // The next fixture also starts with fresh provider and authorization caches.
  }
  onPhase("repeatability");
  const normalizedOutcomeSha256 = judgeScenarioOutcomeSha256(scenarios[0]);
  assert.equal(judgeScenarioOutcomeSha256(scenarios[2]), normalizedOutcomeSha256);
  onPhase("source"); assert.equal(rehearsalSourceFingerprint(), sourceFingerprint, "Source changed during the rehearsal.");
  assert.equal(externalAttempts(), 0);
  return {
    report: { schemaVersion: "judge-rehearsal-v1", mode: "local_injected", status: "passed", runtime: process.version,
      generatedAt: new Date().toISOString(), ...source, sourceFingerprint, scenarioClock: NOW,
      baseline: firstBaseline, scenarios, resets, repeatability: { ordinaryMatchesRepeat: true, normalizedOutcomeSha256 },
      isolation: { database: "memory", externalRequests: 0, credentialsUsed: false } },
    assertSafeArtifacts(text) { for (const check of privateChecks) check(text); return true; },
  };
}
