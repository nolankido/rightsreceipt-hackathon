#!/usr/bin/env node
/** Dependency-free release-candidate verification and evidence capture. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTrackedSourceIdentity } from "./tracked-source-identity.mjs";
import { releaseJudgeGate } from "./support/release-judge-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaVersion = "rightsreceipt-release-candidate-v1";
const usage = `RightsReceipt release candidate verification

Usage:
  node scripts/release-candidate-verify.mjs [--output DIRECTORY] [--preflight-only]

Full verification requires a clean Git checkout, Node 22.13 through 22.x,
the pinned pnpm@12.8.2 package manager, a committed pnpm-lock.yaml,
and no local .env / .dev.vars overrides.

Full mode runs:
  corepack pnpm install --frozen-lockfile
  corepack pnpm verify
  node scripts/judge-rehearsal.mjs --output <run>/judge

Evidence is written under .data/release-candidate by default. Child commands
run in local/fake mode without inherited provider credentials or Vite variables.
No PayPal credentials are required or used. Genuine Sandbox acceptance remains separate.
`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
function parseArgs(args) {
  let output = null, preflightOnly = false, help = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") help = true;
    else if (args[i] === "--preflight-only") preflightOnly = true;
    else if (args[i] === "--output") {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("missing_output");
      output = args[++i];
    } else throw new Error("unsupported_argument");
  }
  return { output, preflightOnly, help };
}
/** Node cannot execute the Corepack .cmd shim as an ordinary binary on Windows.
 * Only the two fixed release commands may cross the cmd.exe boundary. */
export function releaseCommandInvocation(executable, args, platform = process.platform) {
  if (platform !== "win32" || executable !== "corepack") return { executable, args };
  const install = Array.isArray(args) && args.length === 3 && args[0] === "pnpm"
    && args[1] === "install" && args[2] === "--frozen-lockfile";
  const verify = Array.isArray(args) && args.length === 2 && args[0] === "pnpm"
    && args[1] === "verify";
  if (!install && !verify) throw new Error("unsupported_corepack_command");
  // /d disables AutoRun. All arguments are fixed literals, never user input.
  return { executable: "cmd.exe", args: ["/d", "/c", `corepack.cmd ${args.join(" ")}`] };
}
// All four release stages together must finish before the outer clean-clone
// runner's 30-minute deadline, while leaving time to save failure evidence.
const RELEASE_STAGE_TIMEOUTS_MS = Object.freeze([
  2 * 60 * 1000,  // public source and history audit
  8 * 60 * 1000,  // frozen dependency installation
  15 * 60 * 1000, // complete source verification
  3 * 60 * 1000,  // actual judge rehearsal
]);

export function releaseStageTimeoutMs(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= RELEASE_STAGE_TIMEOUTS_MS.length) {
    throw new Error("invalid_release_stage");
  }
  return RELEASE_STAGE_TIMEOUTS_MS[index];
}

export function runReleaseCommand(executable, args, options = {}) {
  const timeoutMs = options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15 * 60 * 1000) {
    throw new Error("invalid_release_timeout");
  }
  const started = Date.now();
  const invocation = releaseCommandInvocation(executable, args);
  const run = options.spawn ?? spawnSync;
  const result = run(invocation.executable, invocation.args, {
    cwd: root,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
    // spawnSync waits for child exit after its timeout. A child that handles
    // SIGTERM without exiting would otherwise defeat the stage deadline.
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  return {
    command: [invocation.executable, ...invocation.args],
    exitCode: result.error ? 1 : (result.status ?? 1),
    signal: result.signal ?? null,
    durationMs: Date.now() - started,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    spawnError: result.error?.code ?? null,
  };
}
function minimal(record) {
  return {
    command: record.command,
    exitCode: record.exitCode,
    signal: record.signal,
    durationMs: record.durationMs,
    stdoutSha256: sha256(record.stdout),
    stderrSha256: sha256(record.stderr),
    spawnError: record.spawnError,
  };
}
function runDirectory(parent) {
  const base = resolve(root, parent ?? join(".data", "release-candidate"));
  mkdirSync(base, { recursive: true });
  const directory = join(base, `run-${nowSlug()}-${process.pid}`);
  mkdirSync(directory);
  return directory;
}
function saveLog(directory, index, record) {
  const stem = String(index).padStart(2, "0") + "-" + record.command[0].replace(/[^A-Za-z0-9._-]/g, "_");
  writeFileSync(join(directory, stem + ".stdout.log"), record.stdout, { flag: "wx" });
  writeFileSync(join(directory, stem + ".stderr.log"), record.stderr, { flag: "wx" });
}
// Release verification must not inherit paid-provider credentials or local
// Vite build variables. This is a credential-stripped offline mode, not a Sandbox run.
const providerEnvironmentPrefix = /^(?:PAYPAL|VITE|CLOUDFLARE|CF|OPENAI|ANTHROPIC|AZURE|GOOGLE|GEMINI|MISTRAL|COHERE|XAI|DEEPSEEK|REPLICATE|TOGETHER|FIREWORKS|GROQ|HF|HUGGING_FACE|STRIPE|GITHUB|GH|AWS|RIGHTS|CREATOR|BUYER|HUMAN|CLARIFICATION|REQUEST|INVOICE)_/iu;
// A clean release must not inherit a different registry, a registry token, or
// Corepack integrity overrides. Windows environment names are case-insensitive.
const releaseEnvironmentOverride = /^(?:NPM_CONFIG_|PNPM_|COREPACK_|YARN_|NPM_TOKEN$|NODE_AUTH_TOKEN$|NODE_OPTIONS$|NODE_TLS_REJECT_UNAUTHORIZED$|APP_MODE$)/iu;
const disabledOperations = [
  "PAYPAL_WEBHOOK_INTAKE_ENABLED",
  "PAYPAL_WEBHOOK_PROCESSING_ENABLED",
  "PAYPAL_RECONCILIATION_ENABLED",
  "PAYPAL_PERMISSION_LIFECYCLE_ENABLED",
  "RIGHTS_RECEIPT_ISSUANCE_ENABLED",
  "RIGHTS_PERMISSION_CLOCK_ENABLED",
  "RIGHTS_RECEIPT_READ_ENABLED",
  "HUMAN_CONSENT_ENABLED",
  "RIGHTS_INVOICE_CREATION_ENABLED",
  "RIGHTS_INVOICE_SENDING_ENABLED",
  "CREATOR_ACCESS_ENABLED",
  "CREATOR_REVIEW_ENABLED",
  "BUYER_REVIEW_ENABLED",
  "BUYER_PAYMENT_ENABLED",
  "RIGHTS_INVOICE_CONTROLS_ENABLED",
  "CLARIFICATION_ENABLED",
  "REQUEST_INTAKE_ENABLED",
  "INVOICE_RECOVERY_ENABLED",
];
export function cleanEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (providerEnvironmentPrefix.test(key) || releaseEnvironmentOverride.test(key)) delete env[key];
  }
  env.APP_MODE = "local";
  env.PAYPAL_MODE = "fake";
  for (const key of disabledOperations) env[key] = "false";
  return env;
}
function git(args) {
  return runReleaseCommand("git", args, { timeoutMs: 15 * 1000 });
}
function preflight() {
  const failures = [];
  const top = git(["rev-parse", "--show-toplevel"]);
  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (top.exitCode !== 0 || resolve(top.stdout.trim()) !== root) failures.push("not_repository_root");
  if (head.exitCode !== 0 || !/^[0-9a-f]{40}$/u.test(head.stdout.trim())) failures.push("commit_unavailable");
  if (status.exitCode !== 0 || status.stdout.trim() !== "") failures.push("checkout_not_clean");
  const sourceIdentity = verifyTrackedSourceIdentity(root);
  if (sourceIdentity.status !== "passed") failures.push(sourceIdentity.code);

  // Git status ignores local dotenv inputs that Vite can read during build.
  // A release must be reproducible from the committed tree alone.
  const localOverrides = readdirSync(root).filter(name =>
    /^(?:\.env|\.dev\.vars)(?:\..+)?$/u.test(name)
    && !/^(?:\.env|\.dev\.vars)\.example$/u.test(name));
  if (localOverrides.length > 0) failures.push("local_environment_override_present");

  // Global excludes can hide local package-manager configuration from git status.
  // Require each present config to be tracked by the frozen source commit.
  const packageConfigs = [".npmrc", ".pnpmfile.cjs", "pnpm-workspace.yaml"];
  const trackedConfigs = git(["ls-files", "--cached", "-z", "--", ...packageConfigs]);
  if (trackedConfigs.exitCode !== 0) failures.push("package_manager_config_check_unavailable");
  else {
    const tracked = new Set(trackedConfigs.stdout.split("\0").filter(Boolean));
    if (packageConfigs.some(name => existsSync(join(root, name)) && !tracked.has(name))) {
      failures.push("local_package_manager_override_present");
    }
  }

  let packageJson = null;
  try { packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); }
  catch { failures.push("package_json_unavailable"); }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 22 || minor < 13) failures.push("unsupported_node");
  if (packageJson?.packageManager !== "pnpm@12.8.2") failures.push("package_manager_not_pinned");

  const lockPath = join(root, "pnpm-lock.yaml");
  const lockExists = existsSync(lockPath);
  if (!lockExists) failures.push("lockfile_missing");
  const lockSha256 = lockExists ? sha256(readFileSync(lockPath)) : null;

  // A clean worktree can still contain an ignored lockfile or hide edits with
  // skip-worktree/assume-unchanged. Compare Git blob identities against HEAD.
  // hash-object --path applies Git's content filters, including Windows CRLF.
  const committedLock = lockExists ? git(["rev-parse", "--verify", "HEAD:pnpm-lock.yaml"]) : null;
  const workingLock = lockExists ? git(["hash-object", "--path=pnpm-lock.yaml", "pnpm-lock.yaml"]) : null;
  const committedGitBlobSha = committedLock?.exitCode === 0 ? committedLock.stdout.trim() : null;
  const workingGitBlobSha = workingLock?.exitCode === 0 ? workingLock.stdout.trim() : null;
  if (lockExists && !committedGitBlobSha) failures.push("lockfile_not_committed");
  else if (lockExists && (!workingGitBlobSha || workingGitBlobSha !== committedGitBlobSha)) {
    failures.push("lockfile_differs_from_head");
  }

  return {
    failures,
    commit: head.stdout.trim() || null,
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
    node: process.versions.node,
    packageManager: packageJson?.packageManager ?? null,
    lockfile: { exists: lockExists, sha256: lockSha256, committedGitBlobSha, workingGitBlobSha },
    gitStatusSha256: sha256(status.stdout),
  };
}
function writeEvidence(directory, evidence) {
  const path = join(directory, "verification.json");
  writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  return path;
}

export function main(args = process.argv.slice(2)) {
  let parsed;
  try { parsed = parseArgs(args); }
  catch {
    process.stderr.write("Unsupported release verification arguments. Use --help.\n");
    return 2;
  }
  if (parsed.help) { process.stdout.write(usage); return 0; }

  const directory = runDirectory(parsed.output);
  const startedAt = new Date().toISOString();
  const checks = preflight();
  const commands = [];
  const evidence = {
    schemaVersion,
    startedAt,
    finishedAt: null,
    status: "failed",
    mode: parsed.preflightOnly ? "preflight" : "full",
    commit: checks.commit,
    branch: checks.branch,
    node: checks.node,
    packageManager: checks.packageManager,
    lockfile: checks.lockfile,
    preflightFailures: checks.failures,
    gitStatusSha256: checks.gitStatusSha256,
    commands: [],
    judgeEvidence: null,
    limitations: [
      "This verifies the local release candidate and deterministic judge rehearsal only.",
      "It does not contact PayPal or prove genuine Sandbox OAuth, payment, refund or webhook exchange.",
      "It does not deploy Cloudflare Worker or D1.",
    ],
  };

  if (checks.failures.length === 0 && !parsed.preflightOnly) {
    const env = cleanEnvironment();
    const planned = [
      [process.execPath, [join(root, "scripts", "public-release-audit.mjs"), "--snapshot-only"]],
      ["corepack", ["pnpm", "install", "--frozen-lockfile"]],
      ["corepack", ["pnpm", "verify"]],
      [process.execPath, [join(root, "scripts", "judge-rehearsal.mjs"), "--output", join(directory, "judge")]],
    ];
    for (const [stageIndex, [executable, commandArgs]] of planned.entries()) {
      const result = runReleaseCommand(executable, commandArgs,
        { env, timeoutMs: releaseStageTimeoutMs(stageIndex) });
      commands.push(result);
      saveLog(directory, commands.length, result);
      evidence.commands.push(minimal(result));
      if (result.spawnError === "ETIMEDOUT") {
        evidence.preflightFailures.push(`release_stage_${stageIndex + 1}_timed_out`);
      }
      if (result.exitCode !== 0) break;
    }
    const finalStatus = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (finalStatus.exitCode !== 0 || finalStatus.stdout.trim() !== "") {
      evidence.preflightFailures.push("verification_changed_checkout");
    }
    if (verifyTrackedSourceIdentity(root).status !== "passed") {
      evidence.preflightFailures.push("verification_changed_source");
    }
    // A passing command and a nonempty directory do not establish that the
    // actual judge rehearsal produced source-bound successful evidence.
    if (commands.length === planned.length && commands.every(item => item.exitCode === 0)
      && evidence.preflightFailures.length === 0) {
      if (releaseJudgeGate(directory, checks.commit, checks.node)) {
        evidence.judgeEvidence = { root: "judge" };
        evidence.status = "passed";
      } else {
        evidence.preflightFailures.push("judge_rehearsal_evidence_invalid");
      }
    }
  } else if (checks.failures.length === 0 && parsed.preflightOnly) {
    evidence.status = "passed";
  }

  evidence.finishedAt = new Date().toISOString();
  const path = writeEvidence(directory, evidence);
  process.stdout.write(JSON.stringify({
    schemaVersion,
    status: evidence.status,
    mode: evidence.mode,
    commit: evidence.commit,
    preflightFailures: evidence.preflightFailures,
    evidencePath: path,
  }, null, 2) + "\n");
  if (evidence.status !== "passed" && evidence.preflightFailures.includes("lockfile_missing")) {
    process.stderr.write("Release verification is blocked: commit pnpm-lock.yaml generated with pnpm@12.8.2, then rerun from a clean checkout.\n");
  }
  return evidence.status === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
