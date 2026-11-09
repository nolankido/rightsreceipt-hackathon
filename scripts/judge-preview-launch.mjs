#!/usr/bin/env node
/** Fail-closed restricted preview deployment: checked config, safe build, remote ledger, deploy, signed-out smoke. */
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateJudgeConfig } from "./judge-deploy-preflight.mjs";
import { evaluateWranglerLedger } from "./judge-d1-ledger-check.mjs";
import { cleanEnvironment } from "./release-candidate-verify.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configName = "wrangler.judge.local.jsonc";
const configPath = join(root, configName);
const schemaVersion = "rightsreceipt-judge-preview-launch-v1";
const ledgerSql = "SELECT name FROM d1_migrations ORDER BY id";
const limitation = "Restricted judge preview only. Remote D1 read and deploy need approved Cloudflare access and may incur account usage. Passing smoke does not prove genuine PayPal Sandbox payment.";

function failure(stage, code, completedStages = []) {
  return { schemaVersion, status: "failed", stage, code, completedStages, limitation };
}

export function previewCommands(origin) {
  return [
    { stage: "build", command: ["pnpm", "build"], offline: true, timeoutMs: 240000 },
    { stage: "ledger", command: ["pnpm", "wrangler", "d1", "execute", "DB",
      "--remote", "--config", configName, "--json", "--command", ledgerSql], offline: false, timeoutMs: 30000 },
    { stage: "deploy", command: ["pnpm", "wrangler", "deploy", "--config", configName],
      offline: false, timeoutMs: 120000 },
    { stage: "smoke", command: [process.execPath, "scripts/hosted-judge-smoke.mjs", "--origin", origin],
      offline: true, timeoutMs: 120000 },
  ];
}

function safeResult(record) {
  return record && typeof record === "object" && Number.isInteger(record.exitCode)
    && typeof record.stdout === "string";
}

export async function runJudgePreview(config, runCommand, options = {}) {
  if (options.hasLocalOverrides === true) return failure("preflight", "local_environment_override_present");
  if (evaluateJudgeConfig(config).status !== "passed") return failure("preflight", "judge_config_invalid");
  const origin = config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN;
  const completedStages = [];
  for (const step of previewCommands(origin)) {
    try {
      if (options.configUnchanged && options.configUnchanged() !== true) {
        return failure(step.stage, "config_changed", completedStages);
      }
    } catch { return failure(step.stage, "config_changed", completedStages); }
    let result;
    try { result = await runCommand(step.stage, step.command, { offline: step.offline, timeoutMs: step.timeoutMs }); }
    catch { return failure(step.stage, "stage_unavailable", completedStages); }
    if (!safeResult(result) || result.exitCode !== 0) return failure(step.stage, "stage_failed", completedStages);
    if (step.stage === "ledger") {
      if (result.stdout.length === 0 || Buffer.byteLength(result.stdout) > 64 * 1024) {
        return failure(step.stage, "ledger_invalid", completedStages);
      }
      try {
        if (evaluateWranglerLedger(JSON.parse(result.stdout)).status !== "passed") {
          return failure(step.stage, "ledger_invalid", completedStages);
        }
      } catch { return failure(step.stage, "ledger_invalid", completedStages); }
    }
    if (step.stage === "smoke") {
      if (result.stdout.length === 0 || Buffer.byteLength(result.stdout) > 8192) {
        return failure(step.stage, "smoke_invalid", completedStages);
      }
      try {
        const proof = JSON.parse(result.stdout);
        if (proof.schemaVersion !== "rightsreceipt-hosted-judge-smoke-v1"
          || proof.status !== "passed" || proof.origin !== origin || proof.total !== 11
          || proof.passed !== 11 || !Array.isArray(proof.failedChecks)
          || proof.failedChecks.length !== 0 || typeof proof.evidencePath !== "string") {
          return failure(step.stage, "smoke_invalid", completedStages);
        }
      } catch { return failure(step.stage, "smoke_invalid", completedStages); }
    }
    completedStages.push(step.stage);
  }
  return { schemaVersion, status: "passed", stage: "complete", code: "ok", completedStages, limitation };
}

function configSnapshot() {
  const stat = lstatSync(configPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 32768) throw new Error("unsafe_config");
  const raw = readFileSync(configPath, "utf8");
  return { raw, config: JSON.parse(raw) };
}
function localOverridesPresent() {
  return readdirSync(root).some(name => /^(?:\.env|\.dev\.vars)(?:\..+)?$/u.test(name)
    && !/^(?:\.env|\.dev\.vars)\.example$/u.test(name));
}
export function spawnParameters(command, platform = process.platform) {
  const [executable, ...args] = command;
  if (platform !== "win32" || executable !== "pnpm") return { binary: executable, args, shell: false };
  // Every pnpm argument comes from previewCommands, never user input.
  // Quote the fixed SQL as one Windows cmd.exe argument.
  const fixed = args.map(value => {
    if (!/^[a-zA-Z0-9_./:=-]+$/u.test(value) && !/^[A-Za-z0-9_ ]+$/u.test(value)) throw new Error("unsafe_windows_argument");
    return value.includes(" ") ? '"' + value + '"' : value;
  });
  return { binary: "pnpm.cmd " + fixed.join(" "), args: [], shell: true };
}
function systemRun(stage, command, options) {
  const target = spawnParameters(command);
  const result = spawnSync(target.binary, target.args, {
    cwd: root, env: options.offline ? cleanEnvironment(process.env) : process.env,
    shell: target.shell, windowsHide: true, encoding: "utf8",
    timeout: options.timeoutMs, maxBuffer: stage === "ledger" ? 64 * 1024 : 4 * 1024 * 1024,
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? "" };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && [ "--help", "-h" ].includes(args[0])) {
    process.stdout.write("Usage: pnpm deploy:judge:preview\nRequires a restricted ignored judge config, no local dotenv overrides, approved Cloudflare D1 read/deploy access and a ready remote migration ledger. Runs build, fixed remote SELECT, deploy and signed-out smoke.\n");
    return 0;
  }
  if (args.length !== 0) {
    process.stdout.write(JSON.stringify(failure("preflight", "arguments_invalid")) + "\n");
    return 2;
  }
  let snapshot, overrides;
  try { overrides = localOverridesPresent(); snapshot = configSnapshot(); }
  catch {
    process.stdout.write(JSON.stringify(failure("preflight", "config_unavailable")) + "\n");
    return 1;
  }
  const report = await runJudgePreview(snapshot.config, systemRun, {
    hasLocalOverrides: overrides,
    configUnchanged: () => configSnapshot().raw === snapshot.raw,
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  return report.status === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
