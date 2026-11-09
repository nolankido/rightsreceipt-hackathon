import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { cleanEnvironment, releaseCommandInvocation, releaseStageTimeoutMs,
  runReleaseCommand } from "./release-candidate-verify.mjs";

const source = fileURLToPath(new URL("./release-candidate-verify.mjs", import.meta.url));
const identitySource = fileURLToPath(new URL("./tracked-source-identity.mjs", import.meta.url));
const judgeEvidenceSource = fileURLToPath(new URL("./support/release-judge-evidence.mjs", import.meta.url));
const judgeContractSource = fileURLToPath(new URL("./support/judge-console-evidence.mjs", import.meta.url));
const canonicalJudgeReportSource = fileURLToPath(new URL("./support/judge-rehearsal-report.mjs", import.meta.url));

function run(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  return result;
}
function git(cwd, ...args) {
  const result = run(cwd, "git", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const dir = join(tmpdir(), "rr-release-preflight-" + randomUUID());
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(source, join(dir, "scripts", "release-candidate-verify.mjs"));
  cpSync(identitySource, join(dir, "scripts", "tracked-source-identity.mjs"));
  mkdirSync(join(dir, "scripts", "support"), { recursive: true });
  cpSync(judgeEvidenceSource, join(dir, "scripts", "support", "release-judge-evidence.mjs"));
  cpSync(judgeContractSource, join(dir, "scripts", "support", "judge-console-evidence.mjs"));
  cpSync(canonicalJudgeReportSource, join(dir, "scripts", "support", "judge-rehearsal-report.mjs"));
  writeFileSync(join(dir, "package.json"), '{"private":true,"type":"module","packageManager":"pnpm@12.8.2"}\n');
  writeFileSync(join(dir, ".gitignore"), ".data/\npnpm-lock.yaml\n.env*\n.dev.vars*\n");
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "fixture@example.test");
  git(dir, "config", "user.name", "RightsReceipt Fixture");
  git(dir, "add", "package.json", ".gitignore", "scripts/release-candidate-verify.mjs", "scripts/tracked-source-identity.mjs", "scripts/support");
  git(dir, "commit", "-qm", "fixture");
  // A release-preflight fixture must start with no untracked helper files.
  // Otherwise checkout cleanliness tests fail before reaching their target.
  assert.equal(git(dir, "status", "--porcelain=v1"), "");
  return dir;
}
function preflight(dir) {
  const result = run(dir, process.execPath, ["scripts/release-candidate-verify.mjs", "--preflight-only"]);
  assert.ok([0, 1].includes(result.status), result.stderr);
  assert.ok(result.stdout.trim(), result.stderr);
  const summary = JSON.parse(result.stdout);
  const evidence = JSON.parse(readFileSync(summary.evidencePath, "utf8"));
  return { result, summary, evidence };
}
function withoutNodeVersion(failures) {
  return failures.filter(failure => failure !== "unsupported_node");
}

test("a missing lockfile remains an explicit release blocker", () => {
  const dir = fixture();
  try {
    const { summary, evidence } = preflight(dir);
    assert.equal(summary.status, "failed");
    assert.ok(evidence.preflightFailures.includes("lockfile_missing"));
    assert.equal(evidence.lockfile.exists, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an ignored lockfile is rejected despite a clean Git status", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    assert.equal(git(dir, "status", "--porcelain=v1"), "");
    const { summary, evidence } = preflight(dir);
    assert.equal(summary.status, "failed");
    assert.ok(evidence.preflightFailures.includes("lockfile_not_committed"));
    assert.equal(evidence.lockfile.committedGitBlobSha, null);
    assert.match(evidence.lockfile.workingGitBlobSha, /^[a-f0-9]{40}$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the exact tracked lockfile is accepted with no lock-specific failure", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    git(dir, "add", "-f", "pnpm-lock.yaml");
    git(dir, "commit", "-qm", "pin lockfile");
    const { summary, evidence } = preflight(dir);
    assert.deepEqual(withoutNodeVersion(evidence.preflightFailures), []);
    assert.equal(evidence.lockfile.committedGitBlobSha, evidence.lockfile.workingGitBlobSha);
    assert.match(evidence.lockfile.sha256, /^[a-f0-9]{64}$/);
    const [major, minor] = process.versions.node.split(".").map(Number);
    const supported = major === 22 && minor >= 13;
    assert.equal(summary.status, supported ? "passed" : "failed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("skip-worktree cannot conceal a changed lockfile from the release check", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    git(dir, "add", "-f", "pnpm-lock.yaml");
    git(dir, "commit", "-qm", "pin lockfile");
    git(dir, "update-index", "--skip-worktree", "pnpm-lock.yaml");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.1'\n");
    assert.equal(git(dir, "status", "--porcelain=v1"), "");
    const { summary, evidence } = preflight(dir);
    assert.equal(summary.status, "failed");
    assert.ok(evidence.preflightFailures.includes("lockfile_differs_from_head"));
    assert.notEqual(evidence.lockfile.committedGitBlobSha, evidence.lockfile.workingGitBlobSha);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an ignored production dotenv file blocks the clean-commit release", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, ".env.production.local"), "VITE_PAYPAL_TOKEN=fixture-only\n");
    assert.equal(git(dir, "status", "--porcelain=v1"), "");
    const { summary, evidence } = preflight(dir);
    assert.equal(summary.status, "failed");
    assert.ok(evidence.preflightFailures.includes("local_environment_override_present"));
    assert.ok(!JSON.stringify(evidence).includes("VITE_PAYPAL_TOKEN"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ignored Sandbox config blocks offline verification but a committed example is allowed", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, ".dev.vars.example"), "# fixture only\n");
    git(dir, "add", "-f", ".dev.vars.example");
    git(dir, "commit", "-qm", "include safe config example");
    const clean = preflight(dir);
    assert.ok(!clean.evidence.preflightFailures.includes("local_environment_override_present"));
    writeFileSync(join(dir, ".dev.vars"), "PAYPAL_SANDBOX_CLIENT_SECRET=fixture-only\n");
    assert.equal(git(dir, "status", "--porcelain=v1"), "");
    const { summary, evidence } = preflight(dir);
    assert.equal(summary.status, "failed");
    assert.ok(evidence.preflightFailures.includes("local_environment_override_present"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ignored package-manager configuration cannot silently alter a clean release", () => {
  for (const name of [".npmrc", ".pnpmfile.cjs", "pnpm-workspace.yaml"]) {
    const dir = fixture();
    try {
      const ignored = readFileSync(join(dir, ".gitignore"), "utf8") + name + "\n";
      writeFileSync(join(dir, ".gitignore"), ignored);
      git(dir, "add", ".gitignore");
      git(dir, "commit", "-qm", "ignore local package manager config");
      writeFileSync(join(dir, name), "# local-only fixture setting\n");
      assert.equal(git(dir, "status", "--porcelain=v1"), "", name);
      const { summary, evidence } = preflight(dir);
      assert.equal(summary.status, "failed", name);
      assert.ok(evidence.preflightFailures.includes("local_package_manager_override_present"), name);
      assert.ok(!JSON.stringify(evidence).includes(name), name);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("committed package-manager configuration remains permitted", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, ".npmrc"), "engine-strict=true\n");
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages: []\n");
    git(dir, "add", ".npmrc", "pnpm-workspace.yaml");
    git(dir, "commit", "-qm", "pin package configuration");
    const { evidence } = preflight(dir);
    assert.ok(!evidence.preflightFailures.includes("local_package_manager_override_present"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("release child environment removes inherited providers and disables live operations", () => {
  const inherited = {
    PATH: "/fixture/bin",
    CI: "true",
    APP_MODE: "sandbox",
    PAYPAL_MODE: "paypal_sandbox",
    PAYPAL_SANDBOX_CLIENT_SECRET: "fixture-paypal",
    OPENAI_API_KEY: "fixture-openai",
    ANTHROPIC_API_KEY: "fixture-anthropic",
    VITE_PUBLIC_ENDPOINT: "https://fixture.example.test",
    CLOUDFLARE_API_TOKEN: "fixture-cf",
    CF_ACCOUNT_ID: "fixture-account",
    GITHUB_TOKEN: "fixture-github",
    AWS_SECRET_ACCESS_KEY: "fixture-aws",
    NODE_AUTH_TOKEN: "fixture-npm",
    NPM_TOKEN: "fixture-npm",
    NODE_OPTIONS: "--require=./fixture.cjs",
    RIGHTS_INVOICE_SENDING_ENABLED: "true",
    PAYPAL_WEBHOOK_PROCESSING_ENABLED: "true",
    CREATOR_ACCESS_ENABLED: "true",
    BUYER_PAYMENT_ENABLED: "true",
  };
  const env = cleanEnvironment(inherited);
  assert.equal(env.PATH, "/fixture/bin");
  assert.equal(env.CI, "true");
  assert.equal(env.APP_MODE, "local");
  assert.equal(env.PAYPAL_MODE, "fake");
  for (const key of [
    "PAYPAL_SANDBOX_CLIENT_SECRET", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "VITE_PUBLIC_ENDPOINT", "CLOUDFLARE_API_TOKEN", "CF_ACCOUNT_ID",
    "GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "NODE_AUTH_TOKEN", "NPM_TOKEN",
    "NODE_OPTIONS",
  ]) assert.equal(Object.hasOwn(env, key), false, key);
  for (const key of [
    "RIGHTS_INVOICE_SENDING_ENABLED", "PAYPAL_WEBHOOK_PROCESSING_ENABLED",
    "CREATOR_ACCESS_ENABLED", "BUYER_PAYMENT_ENABLED", "RIGHTS_RECEIPT_ISSUANCE_ENABLED",
  ]) assert.equal(env[key], "false", key);
  assert.equal(inherited.PAYPAL_MODE, "paypal_sandbox");
  assert.equal(inherited.RIGHTS_INVOICE_SENDING_ENABLED, "true");
});

test("release child environment removes mixed-case provider and package-manager credential overrides", () => {
  const inherited = {
    PATH: "/fixture/bin", CI: "true", app_mode: "sandbox", PaYpAl_Mode: "paypal_sandbox",
    paypal_sandbox_client_secret: "fixture-paypal", vite_test_token: "fixture-vite",
    COREPACK_NPM_TOKEN: "fixture-corepack", corepack_npm_password: "fixture-corepack",
    COREPACK_INTEGRITY_KEYS: "0", COREPACK_NPM_REGISTRY: "https://fixture.example.test",
    NPM_CONFIG_USERCONFIG: "/fixture/credentials", npm_config_registry: "https://fixture.example.test",
    "npm_config_//registry.npmjs.org/:_authToken": "fixture-npm",
    PNPM_AUTH_TOKEN: "fixture-pnpm", YARN_NPM_AUTH_TOKEN: "fixture-yarn",
    npm_token: "fixture-npm", node_auth_token: "fixture-node",
    node_options: "--require=./fixture.cjs", NODE_TLS_REJECT_UNAUTHORIZED: "0",
  };
  const env = cleanEnvironment(inherited);
  assert.equal(env.PATH, "/fixture/bin");
  assert.equal(env.CI, "true");
  assert.equal(env.APP_MODE, "local");
  assert.equal(env.PAYPAL_MODE, "fake");
  for (const key of Object.keys(inherited).filter(key => key !== "PATH" && key !== "CI")) {
    assert.equal(Object.hasOwn(env, key), false, key);
  }
  assert.equal(inherited.COREPACK_INTEGRITY_KEYS, "0");
  assert.equal(inherited.npm_config_registry, "https://fixture.example.test");
});

test("Windows release commands launch the Corepack cmd shim without invoking an arbitrary shell string", () => {
  assert.deepEqual(releaseCommandInvocation("corepack", ["pnpm", "install", "--frozen-lockfile"], "win32"), {
    executable: "cmd.exe", args: ["/d", "/c", "corepack.cmd pnpm install --frozen-lockfile"],
  });
  assert.deepEqual(releaseCommandInvocation("corepack", ["pnpm", "verify"], "win32"), {
    executable: "cmd.exe", args: ["/d", "/c", "corepack.cmd pnpm verify"],
  });
  assert.deepEqual(releaseCommandInvocation("corepack", ["pnpm", "verify"], "linux"), {
    executable: "corepack", args: ["pnpm", "verify"],
  });
  assert.deepEqual(releaseCommandInvocation(process.execPath, ["script.mjs"], "win32"), {
    executable: process.execPath, args: ["script.mjs"],
  });
  for (const args of [["pnpm", "verify", "&", "whoami"], ["pnpm", "install"],
    ["pnpm", "verify && echo unsafe"], ["npm", "verify"]]) {
    assert.throws(() => releaseCommandInvocation("corepack", args, "win32"), /unsupported_corepack_command/u);
  }
});

test("release stages have fixed time budgets that fit the clean-clone outer deadline", () => {
  assert.deepEqual([0, 1, 2, 3].map(releaseStageTimeoutMs), [
    2 * 60 * 1000, 8 * 60 * 1000, 15 * 60 * 1000, 3 * 60 * 1000,
  ]);
  assert.ok([0, 1, 2, 3].map(releaseStageTimeoutMs).reduce((sum, ms) => sum + ms, 0)
    < 30 * 60 * 1000);
  for (const invalid of [-1, 4, 1.5, NaN, "2", undefined]) {
    assert.throws(() => releaseStageTimeoutMs(invalid), /invalid_release_stage/u);
  }
});

test("release subprocess timeout is bounded and fails closed even with a zero exit status", () => {
  const calls = [];
  const result = runReleaseCommand(process.execPath, ["scripts/fixture.mjs"], {
    timeoutMs: 1500,
    env: { PATH: "/fixture/bin", APP_MODE: "local" },
    spawn(executable, args, options) {
      calls.push({ executable, args, options });
      return { status: 0, signal: "SIGKILL", stdout: "", stderr: "",
        error: Object.assign(new Error("private diagnostic"), { code: "ETIMEDOUT" }) };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, process.execPath);
  assert.equal(calls[0].options.timeout, 1500);
  assert.equal(calls[0].options.killSignal, "SIGKILL");
  assert.equal(calls[0].options.maxBuffer, 16 * 1024 * 1024);
  assert.equal(calls[0].options.env.APP_MODE, "local");
  assert.equal(result.exitCode, 1);
  assert.equal(result.spawnError, "ETIMEDOUT");
  assert.equal(result.signal, "SIGKILL");
  assert.ok(!JSON.stringify(result).includes("private diagnostic"));
  for (const timeoutMs of [0, -1, 1.5, 15 * 60 * 1000 + 1, undefined]) {
    assert.throws(() => runReleaseCommand("git", ["status"], { timeoutMs }),
      /invalid_release_timeout/u);
  }
});

test("an actually stalled Node child is terminated within its release budget", () => {
  const result = runReleaseCommand(process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { timeoutMs: 250, env: cleanEnvironment() });
  assert.equal(result.exitCode, 1);
  assert.equal(result.spawnError, "ETIMEDOUT");
  assert.ok(result.durationMs < 5000);
});

test("timeout stays bounded when a release child handles SIGTERM without exiting",
  { skip: process.platform === "win32" }, () => {
    // The timer exits on its own eventually, so this regression can never hang forever.
    const result = runReleaseCommand(process.execPath,
      ["-e", "process.on('SIGTERM',()=>{});setTimeout(()=>process.exit(0),2400)"],
      { timeoutMs: 600, env: cleanEnvironment() });
    assert.equal(result.exitCode, 1);
    assert.equal(result.spawnError, "ETIMEDOUT");
    assert.ok(result.durationMs < 1600,
      `Release timeout waited ${result.durationMs}ms for a SIGTERM-handling child`);
  });


test("release preflight rejects hidden changes in any tracked non-lockfile file", () => {
  for (const flag of ["--skip-worktree", "--assume-unchanged"]) {
    const dir = fixture();
    try {
      writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      git(dir, "add", "-f", "pnpm-lock.yaml");
      writeFileSync(join(dir, "application.txt"), "original\n");
      git(dir, "add", "application.txt");
      git(dir, "commit", "-qm", "release candidate");
      git(dir, "update-index", flag, "application.txt");
      writeFileSync(join(dir, "application.txt"), "altered source\n");
      assert.equal(git(dir, "status", "--porcelain=v1"), "");
      const { summary, evidence } = preflight(dir);
      assert.equal(summary.status, "failed");
      assert.ok(evidence.preflightFailures.includes("tracked_source_hidden_index_flag"), flag);
      assert.ok(!JSON.stringify(evidence).includes("application.txt"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
