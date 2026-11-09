import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateJudgeConfig } from "./judge-deploy-preflight.mjs";
import { REQUIRED_D1_MIGRATIONS } from "./judge-d1-ledger-check.mjs";
import { previewCommands, runJudgePreview, spawnParameters } from "./judge-preview-launch.mjs";

const template = JSON.parse(readFileSync(new URL("../wrangler.judge.example.jsonc", import.meta.url), "utf8"));
const origin = "https://rightsreceipt-judge.sandbox-candidate.workers.dev";
function candidate() {
  const config = structuredClone(template);
  config.d1_databases[0].database_id = "11111111-2222-4333-8444-555555555555";
  config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN = origin;
  config.vars.HUMAN_CONSENT_ORIGIN = origin;
  assert.equal(evaluateJudgeConfig(config).status, "passed");
  return config;
}
const ledgerOutput = JSON.stringify([{
  success: true, results: REQUIRED_D1_MIGRATIONS.map(name => ({ name })),
  meta: { rows_written: 0, changes: 0 },
}]);
function smokeOutput(target = origin) {
  return JSON.stringify({
    schemaVersion: "rightsreceipt-hosted-judge-smoke-v1", status: "passed", origin: target,
    passed: 11, total: 11, failedChecks: [], evidencePath: ".data/hosted-judge-smoke/run-fixture/evidence.json",
  });
}
function runner(overrides = {}) {
  const calls = [];
  const run = async (stage, command, options) => {
    calls.push({ stage, command, options });
    if (typeof overrides[stage] === "function") return overrides[stage]();
    if (overrides[stage]) return overrides[stage];
    return { exitCode: 0, stdout: stage === "ledger" ? ledgerOutput
      : stage === "smoke" ? smokeOutput() : "" };
  };
  return { run, calls };
}
const stages = ["build", "ledger", "deploy", "smoke"];

test("the preview launcher pins a local build, fixed remote SELECT, deploy and exact-origin smoke", () => {
  const steps = previewCommands(origin);
  assert.deepEqual(steps.map(x => x.stage), stages);
  assert.deepEqual(steps[0].command, ["pnpm", "build"]);
  assert.deepEqual(steps[1].command, ["pnpm", "wrangler", "d1", "execute", "DB",
    "--remote", "--config", "wrangler.judge.local.jsonc", "--json", "--command",
    "SELECT name FROM d1_migrations ORDER BY id"]);
  assert.deepEqual(steps[2].command, ["pnpm", "wrangler", "deploy", "--config", "wrangler.judge.local.jsonc"]);
  assert.deepEqual(steps[3].command.slice(1), ["scripts/hosted-judge-smoke.mjs", "--origin", origin]);
  assert.deepEqual(steps.map(x => x.offline), [true, false, false, true]);
  assert.ok(steps.every(x => x.timeoutMs > 0 && x.timeoutMs <= 240000));
});

test("Windows pnpm commands quote fixed SQL safely and POSIX uses an argument array", () => {
  const query = previewCommands(origin)[1].command;
  const win = spawnParameters(query, "win32");
  assert.equal(win.shell, true);
  assert.deepEqual(win.args, []);
  assert.ok(win.binary.startsWith("pnpm.cmd wrangler d1 execute DB --remote"));
  assert.ok(win.binary.includes('--command "SELECT name FROM d1_migrations ORDER BY id"'));
  const posix = spawnParameters(query, "linux");
  assert.equal(posix.binary, "pnpm");
  assert.equal(posix.shell, false);
  assert.deepEqual(posix.args, query.slice(1));
  assert.throws(() => spawnParameters(["pnpm", "wrangler", "&unsafe"], "win32"),
    /unsafe_windows_argument/u);
});

test("successful preview requires all four sequential stages and full smoke proof", async () => {
  const fixture = runner();
  const result = await runJudgePreview(candidate(), fixture.run);
  assert.equal(result.status, "passed");
  assert.equal(result.stage, "complete");
  assert.deepEqual(result.completedStages, stages);
  assert.deepEqual(fixture.calls.map(x => x.stage), stages);
  assert.equal(fixture.calls[0].options.offline, true);
  assert.equal(fixture.calls[1].options.offline, false);
  assert.equal(JSON.stringify(result).includes("rows_written"), false);
  assert.equal(JSON.stringify(result).includes("evidencePath"), false);
});

test("the tracked undeployable template and altered Sandbox flags cannot start a build", async () => {
  const fixture = runner();
  const untouched = await runJudgePreview(template, fixture.run);
  assert.equal(untouched.code, "judge_config_invalid");
  const unsafe = candidate();
  unsafe.vars.RIGHTS_INVOICE_SENDING_ENABLED = "true";
  const changed = await runJudgePreview(unsafe, fixture.run);
  assert.equal(changed.code, "judge_config_invalid");
  assert.deepEqual(fixture.calls, []);
});

test("local dotenv overrides block all launch actions", async () => {
  const fixture = runner();
  const result = await runJudgePreview(candidate(), fixture.run, { hasLocalOverrides: true });
  assert.equal(result.status, "failed");
  assert.equal(result.stage, "preflight");
  assert.equal(result.code, "local_environment_override_present");
  assert.equal(fixture.calls.length, 0);
});

test("a failed build cannot trigger the remote D1 query or deploy", async () => {
  const fixture = runner({ build: { exitCode: 1, stdout: "private token fixture" } });
  const result = await runJudgePreview(candidate(), fixture.run);
  assert.deepEqual(fixture.calls.map(x => x.stage), ["build"]);
  assert.equal(result.stage, "build");
  assert.equal(result.code, "stage_failed");
  assert.equal(JSON.stringify(result).includes("private token fixture"), false);
});

test("a missing migration stops before deployment even if the D1 query exited successfully", async () => {
  const bad = JSON.stringify([{ success: true,
    results: REQUIRED_D1_MIGRATIONS.slice(1).map(name => ({ name })) }]);
  const fixture = runner({ ledger: { exitCode: 0, stdout: bad } });
  const result = await runJudgePreview(candidate(), fixture.run);
  assert.deepEqual(fixture.calls.map(x => x.stage), ["build", "ledger"]);
  assert.equal(result.code, "ledger_invalid");
  assert.deepEqual(result.completedStages, ["build"]);
});

test("failed or malformed remote D1 evidence blocks deployment", async () => {
  for (const output of [
    { exitCode: 1, stdout: ledgerOutput },
    { exitCode: 0, stdout: "{invalid-json" },
    { exitCode: 0, stdout: "x".repeat(65 * 1024) },
    { exitCode: 0, stdout: JSON.stringify([{ success: false, results: [] }]) },
  ]) {
    const fixture = runner({ ledger: output });
    const result = await runJudgePreview(candidate(), fixture.run);
    assert.equal(result.status, "failed");
    assert.equal(result.stage, "ledger");
    assert.equal(fixture.calls.some(x => x.stage === "deploy"), false);
  }
});

test("changing the ignored config between build and ledger blocks remote actions", async () => {
  const fixture = runner();
  let checks = 0;
  const result = await runJudgePreview(candidate(), fixture.run, {
    configUnchanged: () => ++checks === 1,
  });
  assert.equal(result.code, "config_changed");
  assert.equal(result.stage, "ledger");
  assert.deepEqual(fixture.calls.map(x => x.stage), ["build"]);
});

test("deployment failure never proceeds to hosted smoke", async () => {
  const fixture = runner({ deploy: { exitCode: 1, stdout: "fixture-only provider identifier" } });
  const result = await runJudgePreview(candidate(), fixture.run);
  assert.equal(result.stage, "deploy");
  assert.deepEqual(fixture.calls.map(x => x.stage), ["build", "ledger", "deploy"]);
  assert.equal(JSON.stringify(result).includes("provider identifier"), false);
});

test("a failed signed-out smoke blocks the completed status after deployment", async () => {
  const fixture = runner({ smoke: { exitCode: 1, stdout: smokeOutput() } });
  const result = await runJudgePreview(candidate(), fixture.run);
  assert.equal(result.status, "failed");
  assert.equal(result.stage, "smoke");
  assert.deepEqual(result.completedStages, ["build", "ledger", "deploy"]);
});

test("a forged passing smoke result with wrong target, counts or schema never passes", async () => {
  const variants = [
    { ...JSON.parse(smokeOutput()), origin: "https://other-host.workers.dev" },
    { ...JSON.parse(smokeOutput()), passed: 10 },
    { ...JSON.parse(smokeOutput()), total: 10 },
    { ...JSON.parse(smokeOutput()), failedChecks: ["buyer_intake_page"] },
    { ...JSON.parse(smokeOutput()), evidencePath: null },
    { ...JSON.parse(smokeOutput()), schemaVersion: "outdated-smoke" },
  ];
  for (const variant of variants) {
    const fixture = runner({ smoke: { exitCode: 0, stdout: JSON.stringify(variant) } });
    const result = await runJudgePreview(candidate(), fixture.run);
    assert.equal(result.stage, "smoke");
    assert.equal(result.code, "smoke_invalid");
  }
});

test("unexpected tool exceptions and config changes remain sanitized", async () => {
  const fixture = runner({ ledger: () => { throw new Error("SECRET_PAYPAL_FIXTURE"); } });
  const failed = await runJudgePreview(candidate(), fixture.run);
  assert.equal(failed.code, "stage_unavailable");
  assert.equal(JSON.stringify(failed).includes("SECRET_PAYPAL_FIXTURE"), false);
  const changed = await runJudgePreview(candidate(), runner().run, {
    configUnchanged: () => { throw new Error("PRIVATE_CONFIG_FIXTURE"); },
  });
  assert.equal(changed.code, "config_changed");
  assert.equal(JSON.stringify(changed).includes("PRIVATE_CONFIG_FIXTURE"), false);
});

test("package scripts cannot silently bypass the new checked launcher", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["deploy:judge:preview"], "node scripts/judge-preview-launch.mjs");
  assert.ok(pkg.scripts["judge:deploy:verify"].includes("scripts/judge-preview-launch-local.test.mjs"));
});
