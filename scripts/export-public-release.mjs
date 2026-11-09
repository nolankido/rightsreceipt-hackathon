#!/usr/bin/env node
/** Build a one-commit public submission repository from the frozen private source tree. */
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verifyTrackedSourceIdentity } from "./tracked-source-identity.mjs";
import { releaseJudgeGate } from "./support/release-judge-evidence.mjs";
import { cleanEnvironment, releaseCommandInvocation } from "./release-candidate-verify.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaVersion = "rightsreceipt-public-export-v1";
const publicAuthorName = "nolankido";
const publicAuthorEmail = "212063387+nolankido@users.noreply.github.com";
const commitMessage = "RightsReceipt PayPal AI Hackathon submission";

const usage = `RightsReceipt sanitized public repository export

Usage:
  node scripts/export-public-release.mjs --release-evidence VERIFICATION_JSON [--output DIRECTORY] [--verify-judge]

Requirements:
  - clean private development checkout;
  - full, passing Node 22 release:verify evidence for exactly HEAD, including logs;
  - current source snapshot passes public-release-audit --snapshot-only;
  - Git available locally.

The export:
  1. verifies the full release evidence, command logs and committed lockfile;
  2. copies exact tracked HEAD blob bytes into a new directory;
  3. creates a fresh one-commit Git repository with a GitHub noreply author;
  4. requires the public tree SHA to equal the private source tree SHA;
  5. runs the full history-aware public audit against the new repository;
  6. with --verify-judge, executes the exported browser smoke and local AI proof offline;
  7. writes a manifest outside the exported repository.

No remote repository is created or pushed by this command.
`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function run(cwd, executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: options.binary ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: options.env ?? process.env,
    timeout: options.timeout,
    killSignal: "SIGKILL",
  });
  if (result.error) throw result.error;
  return result;
}
function text(cwd, executable, args) {
  const result = run(cwd, executable, args);
  if (result.status !== 0) throw new Error(`command_failed:${executable}`);
  return result.stdout.trim();
}
function git(cwd, ...args) {
  return text(cwd, "git", args);
}
function parseArgs(rawArgs) {
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  let output = null, help = false, releaseEvidence = null, verifyJudge = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") help = true;
    else if (args[i] === "--release-evidence") {
      const next = args[++i];
      if (!next || next.startsWith("--") || releaseEvidence !== null) throw new Error("invalid_arguments");
      releaseEvidence = next;
    } else if (args[i] === "--output") {
      const next = args[++i];
      if (!next || next.startsWith("--")) throw new Error("invalid_arguments");
      output = next;
    } else if (args[i] === "--verify-judge" && !verifyJudge) {
      verifyJudge = true;
    } else throw new Error("invalid_arguments");
  }
  return { output, help, releaseEvidence, verifyJudge };
}
function safeBase(parent) {
  const base = resolve(root, parent ?? join(".data","public-release-export"));
  const rel = relative(root, base).split(sep).join("/");
  if (!rel.startsWith("../") && rel !== ".." && rel !== ".data" && !rel.startsWith(".data/")) {
    throw new Error("unsafe_output");
  }
  mkdirSync(base,{recursive:true});
  const slug = new Date().toISOString().replace(/[:.]/gu,"-");
  const directory = join(base,`run-${slug}-${process.pid}`);
  mkdirSync(directory);
  return directory;
}
function trackedEntries() {
  const result = run(root,"git",["ls-files","--stage","-z"]);
  if (result.status !== 0) throw new Error("tracked_files_unavailable");
  return result.stdout.split("\0").filter(Boolean).map(entry => {
    const match=/^(100644|100755) [0-9a-f]{40} 0\t([\s\S]+)$/u.exec(entry);
    if (!match) throw new Error("nonregular_tracked_file");
    return { mode:match[1], path:match[2].replaceAll("\\","/") };
  });
}
function copyExactHeadBlob(path,mode,destinationRoot) {
  const result = run(root,"git",["show",`HEAD:${path}`],{binary:true});
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) throw new Error("blob_export_failed");
  const target = join(destinationRoot,...path.split("/"));
  mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,result.stdout,{flag:"wx"});
  // A copied file defaults to 100644. Preserve executable source entries so
  // the exported tree can exactly match HEAD on both POSIX and Windows.
  if (mode==="100755" && process.platform!=="win32") chmodSync(target,0o755);
  return result.stdout.byteLength;
}

function isNodeExecutable(value) {
  return typeof value === "string" && /(?:^|[\\/])node(?:\.exe)?$/iu.test(value);
}
function scriptArgument(value, name) {
  return typeof value === "string"
    && value.replaceAll("\\", "/").endsWith("/scripts/" + name);
}
function expectedCorepackCommand(recorded, args) {
  // The canonical release verifier launches the fixed pnpm steps directly on
  // POSIX but through the Corepack .cmd shim on Windows. Both records are safe
  // and must remain byte-for-byte identical to that verifier's allowlist.
  return ["linux", "win32"].some(platform => {
    const invocation = releaseCommandInvocation("corepack", args, platform);
    return JSON.stringify(recorded) === JSON.stringify([invocation.executable, ...invocation.args]);
  });
}
function expectedReleaseCommand(index, value) {
  if (!Array.isArray(value)) return false;
  if (index === 0) return value.length === 3 && isNodeExecutable(value[0])
    && scriptArgument(value[1], "public-release-audit.mjs") && value[2] === "--snapshot-only";
  if (index === 1) return expectedCorepackCommand(value, ["pnpm", "install", "--frozen-lockfile"]);
  if (index === 2) return expectedCorepackCommand(value, ["pnpm", "verify"]);
  return value.length === 4 && isNodeExecutable(value[0])
    && scriptArgument(value[1], "judge-rehearsal.mjs") && value[2] === "--output"
    && typeof value[3] === "string" && basename(value[3]) === "judge";
}
export function verifyReleaseEvidence(input, sourceCommit) {
  if (!input) throw new Error("release_evidence_required");
  const path = resolve(root, input);
  let raw;
  try {
    const meta = statSync(path);
    if (!meta.isFile() || meta.size > 64 * 1024) throw new Error();
    raw = readFileSync(path);
  } catch { throw new Error("release_evidence_unavailable"); }
  let evidence;
  try { evidence = JSON.parse(raw.toString("utf8")); }
  catch { throw new Error("release_evidence_invalid"); }
  if (evidence?.schemaVersion !== "rightsreceipt-release-candidate-v1"
    || evidence.status !== "passed" || evidence.mode !== "full"
    || !Array.isArray(evidence.preflightFailures) || evidence.preflightFailures.length !== 0
    || evidence.gitStatusSha256 !== sha256("")
    || !/^22\.(?:1[3-9]|[2-9]\d)\.\d+$/u.test(evidence.node ?? "")
    || evidence.packageManager !== "pnpm@12.8.2"
    || !Number.isFinite(Date.parse(evidence.startedAt ?? ""))
    || !Number.isFinite(Date.parse(evidence.finishedAt ?? ""))
    || Date.parse(evidence.finishedAt) < Date.parse(evidence.startedAt)
    || !Array.isArray(evidence.commands) || evidence.commands.length !== 4
    || evidence.judgeEvidence?.root !== "judge") throw new Error("release_evidence_invalid");
  if (evidence.commit !== sourceCommit) throw new Error("release_commit_mismatch");

  const lockPath = join(root, "pnpm-lock.yaml");
  let committedBlob, workingBlob, lockSha;
  try {
    committedBlob = git(root, "rev-parse", "--verify", "HEAD:pnpm-lock.yaml");
    workingBlob = git(root, "hash-object", "--path=pnpm-lock.yaml", "pnpm-lock.yaml");
    lockSha = sha256(readFileSync(lockPath));
  } catch { throw new Error("release_lockfile_mismatch"); }
  if (evidence.lockfile?.exists !== true || evidence.lockfile.sha256 !== lockSha
    || evidence.lockfile.committedGitBlobSha !== committedBlob
    || evidence.lockfile.workingGitBlobSha !== workingBlob
    || committedBlob !== workingBlob) throw new Error("release_lockfile_mismatch");

  const parent = dirname(path);
  for (let i = 0; i < evidence.commands.length; i++) {
    const record = evidence.commands[i];
    if (!expectedReleaseCommand(i, record?.command)
      || record.exitCode !== 0 || record.signal !== null || record.spawnError !== null
      || !Number.isFinite(record.durationMs) || record.durationMs < 0
      || !/^[0-9a-f]{64}$/u.test(record.stdoutSha256 ?? "")
      || !/^[0-9a-f]{64}$/u.test(record.stderrSha256 ?? "")) throw new Error("release_evidence_invalid");
    const stem = String(i + 1).padStart(2, "0") + "-" + record.command[0].replace(/[^A-Za-z0-9._-]/gu, "_");
    for (const channel of ["stdout", "stderr"]) {
      const logPath = join(parent, stem + "." + channel + ".log");
      let bytes;
      try {
        const meta = statSync(logPath);
        if (!meta.isFile() || meta.size > 20 * 1024 * 1024) throw new Error();
        bytes = readFileSync(logPath);
      } catch { throw new Error("release_log_missing"); }
      if (sha256(bytes) !== record[channel + "Sha256"]) throw new Error("release_log_mismatch");
    }
  }
  // The release verifier enforces this same semantic gate. Recheck it on
  // export rather than trusting an earlier passing JSON or a nonempty folder.
  const judge = join(parent, "judge");
  try {
    if (!existsSync(judge) || !statSync(judge).isDirectory() || readdirSync(judge).length === 0) throw new Error();
  } catch { throw new Error("release_judge_evidence_missing"); }
  if (!releaseJudgeGate(parent, sourceCommit, evidence.node)) {
    throw new Error("release_judge_evidence_invalid");
  }
  return { sha256: sha256(raw), verifiedAt: evidence.finishedAt, node: evidence.node };
}

function audit(cwd,args) {
  const result = run(cwd,process.execPath,args);
  let summary = null;
  try { summary = JSON.parse(result.stdout); } catch { /* A failed audit may return non-JSON stderr. */ }
  return { result, summary };
}

/** Prove the exported tree is usable by a judge, not merely privacy-audited. */
export function verifyPublicJudgeExperience(cwd, execute = run) {
  const safeEnvironment = cleanEnvironment();
  let smoke, ai;
  try {
    const result = execute(cwd, process.execPath,
      [join(cwd,"scripts","judge-console-real-smoke.mjs")],
      { env: safeEnvironment, timeout: 150000 });
    if (result.status !== 0 || result.signal || typeof result.stdout !== "string"
      || Buffer.byteLength(result.stdout, "utf8") > 16384) throw new Error();
    smoke = JSON.parse(result.stdout);
  } catch { throw new Error("public_judge_smoke_failed"); }
  if (smoke?.schemaVersion !== "rightsreceipt-judge-console-smoke-v1"
    || smoke.status !== "passed" || smoke.mode !== "local_injected"
    || smoke.scenarioCount !== 3 || smoke.resetCount !== 3
    || smoke.externalRequests !== 0 || smoke.paymentEvidence !== "simulated_only"
    || smoke.aiEvidence !== "real_local_classifier_on_synthetic_only") {
    throw new Error("public_judge_smoke_failed");
  }
  try {
    const result = execute(cwd, process.execPath,
      ["--no-warnings","--experimental-strip-types",join(cwd,"scripts","judge-ai-proof.mjs")],
      { env: safeEnvironment, timeout: 30000 });
    if (result.status !== 0 || result.signal || typeof result.stdout !== "string"
      || Buffer.byteLength(result.stdout,"utf8") > 16384) throw new Error();
    ai = JSON.parse(result.stdout);
  } catch { throw new Error("public_ai_proof_failed"); }
  if (ai?.schemaVersion !== "rightsreceipt-local-ai-proof-v1"
    || ai.status !== "passed" || !/^[0-9a-f]{64}$/u.test(ai.modelArtifactSha256 ?? "")
    || ai.syntheticRequestCount !== 2 || ai.evaluatedRightsFields !== 24
    || ai.contradictionWarningVisible !== true || ai.modelExecution !== "real_local_inference"
    || ai.paymentEvidence !== "none") {
    throw new Error("public_ai_proof_failed");
  }
  return Object.freeze({status:"passed", mode:"offline", scenarioCount:3,
    resetCount:3, externalRequests:0, paymentEvidence:"simulated_only",
    aiModelExecution:"real_local_inference", aiSyntheticRequestCount:2,
    aiRightsFieldComparisons:24, aiContradictionWarningVisible:true,
    aiModelArtifactSha256:ai.modelArtifactSha256});
}
function main(args = process.argv.slice(2)) {
  let parsed;
  try { parsed=parseArgs(args); }
  catch {
    process.stderr.write("Invalid public export arguments. Use --help.\n");
    return 2;
  }
  if (parsed.help) { process.stdout.write(usage); return 0; }
  if (!parsed.releaseEvidence) {
    process.stdout.write(JSON.stringify({schemaVersion,status:"failed",code:"release_evidence_required"},null,2)+"\n");
    return 1;
  }

  let directory;
  try { directory=safeBase(parsed.output); }
  catch {
    process.stderr.write("Public export output must stay under .data or outside the private repository.\n");
    return 2;
  }

  try {
    const status=git(root,"status","--porcelain=v1","--untracked-files=all");
    if (status !== "") throw new Error("checkout_not_clean");
    if (verifyTrackedSourceIdentity(root).status !== "passed") throw new Error("tracked_source_identity_failed");
    const sourceCommit=git(root,"rev-parse","HEAD");
    const sourceTree=git(root,"rev-parse","HEAD^{tree}");
    const releaseVerification=verifyReleaseEvidence(parsed.releaseEvidence,sourceCommit);

    const sourceAudit=audit(root,[
      join(root,"scripts","public-release-audit.mjs"),
      "--snapshot-only",
      "--output",join(directory,"source-audit"),
    ]);
    if (sourceAudit.result.status !== 0 || sourceAudit.summary?.status !== "passed") throw new Error("source_snapshot_audit_failed");

    const exportRoot=join(directory,"repo");
    mkdirSync(exportRoot);
    const entries=trackedEntries();
    let totalBytes=0;
    for (const {path,mode} of entries) totalBytes+=copyExactHeadBlob(path,mode,exportRoot);

    let init=run(exportRoot,"git",["init","-b","main"]);
    if (init.status !== 0) {
      init=run(exportRoot,"git",["init"]);
      if (init.status !== 0) throw new Error("git_init_failed");
      git(exportRoot,"branch","-M","main");
    }
    git(exportRoot,"config","user.name",publicAuthorName);
    git(exportRoot,"config","user.email",publicAuthorEmail);
    git(exportRoot,"config","commit.gpgsign","false");
    git(exportRoot,"config","core.autocrlf","false");
    git(exportRoot,"add","--force","--all");
    // Git index modes are authoritative even where chmod cannot mark a file
    // executable (notably Windows with core.filemode=false).
    for (const {path,mode} of entries) {
      if (mode==="100755") git(exportRoot,"update-index","--chmod=+x","--",path);
    }
    const commit=run(exportRoot,"git",["-c","commit.gpgsign=false","commit","-m",commitMessage]);
    if (commit.status !== 0) throw new Error("public_commit_failed");

    const publicCommit=git(exportRoot,"rev-parse","HEAD");
    const publicTree=git(exportRoot,"rev-parse","HEAD^{tree}");
    if (publicTree !== sourceTree) throw new Error("tree_identity_mismatch");
    const publicStatus=git(exportRoot,"status","--porcelain=v1","--untracked-files=all");
    if (publicStatus !== "") throw new Error("public_checkout_not_clean");
    const identities=git(exportRoot,"log","-1","--format=%an%x09%ae%x09%cn%x09%ce").split("\t");
    if (identities.length !== 4 || identities[0] !== publicAuthorName || identities[1] !== publicAuthorEmail
      || identities[2] !== publicAuthorName || identities[3] !== publicAuthorEmail) throw new Error("public_identity_mismatch");

    const publicAudit=audit(exportRoot,[
      join(exportRoot,"scripts","public-release-audit.mjs"),
      "--output",join(directory,"public-audit"),
    ]);
    if (publicAudit.result.status !== 0 || publicAudit.summary?.status !== "passed") throw new Error("public_history_audit_failed");

    const publicJudgeExperience = parsed.verifyJudge
      ? verifyPublicJudgeExperience(exportRoot) : {status:"not_requested"};
    if (git(exportRoot,"status","--porcelain=v1","--untracked-files=all") !== ""
      || git(exportRoot,"rev-parse","HEAD^{tree}") !== sourceTree) {
      throw new Error("public_checkout_not_clean");
    }

    const sourceAuditPath=sourceAudit.summary.evidencePath;
    const publicAuditPath=publicAudit.summary.evidencePath;
    const manifest={
      schemaVersion,
      generatedAt:new Date().toISOString(),
      status:"passed",
      sourceCommit,
      sourceTree,
      releaseVerificationSha256:releaseVerification.sha256,
      releaseVerifiedAt:releaseVerification.verifiedAt,
      releaseNode:releaseVerification.node,
      publicCommit,
      publicTree,
      exactTreeMatch:true,
      trackedFileCount:entries.length,
      trackedByteCount:totalBytes,
      publicAuthorName,
      publicAuthorEmail,
      sourceSnapshotAuditSha256:sha256(readFileSync(sourceAuditPath)),
      publicHistoryAuditSha256:sha256(readFileSync(publicAuditPath)),
      publicJudgeExperience,
      repositoryDirectory:"repo",
      notes:[
        "Full local release verification evidence was bound to this exact private source commit.",
        "The exported repository contains one commit and no private development history.",
        "The exported Git tree is byte-identical to the frozen private source tree.",
        "Judge execution was checked on the export only when publicJudgeExperience.status is passed.",
        "No GitHub remote was created or pushed by this command.",
      ],
    };
    const manifestPath=join(directory,"manifest.json");
    writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
    process.stdout.write(JSON.stringify({
      schemaVersion,
      status:"passed",
      sourceCommit,
      publicCommit,
      tree:publicTree,
      repositoryPath:exportRoot,
      manifestPath,
      publicAuditPath,
    },null,2)+"\n");
    return 0;
  } catch (error) {
    const code=error instanceof Error && /^[a-z0-9_:-]+$/u.test(error.message) ? error.message : "public_export_failed";
    process.stdout.write(JSON.stringify({schemaVersion,status:"failed",code},null,2)+"\n");
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) process.exitCode=main();

