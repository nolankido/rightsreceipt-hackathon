#!/usr/bin/env node
/** History-aware publication audit for the final public hackathon repository. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { auditedGitEntry, inspectAuditBlob, MAX_AUDIT_BLOB_BYTES } from "./public-audit-blob-policy.mjs";
import { isFixtureValue } from "./support/public-audit-fixture-value.mjs";
import { hasKnownSecretPrefix } from "./support/public-audit-token-patterns.mjs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaVersion = "rightsreceipt-public-release-audit-v1";
const maxBlobBytes = MAX_AUDIT_BLOB_BYTES;
const requiredFiles = [
  "LICENSE",
  "README.md",
  "JUDGES.md",
  "docs/submission/README.md",
  "docs/submission/DEVPOST_DRAFT.md",
  "docs/submission/VIDEO_STORYBOARD.md",
  "docs/submission/JUDGE_QUICKSTART.md",
  "docs/submission/PUBLIC_REPO_PREFLIGHT.md",
];
const allowedEmailDomains = new Set([
  "example.test", "example.com", "example.invalid", "rightsreceipt.invalid", "localhost",
  "users.noreply.github.com", "noreply.github.com",
]);
const allowedEmailAddresses = new Set(["noreply@github.com"]);
const sensitiveAssignmentNames = [
  "PAYPAL_SANDBOX_CLIENT_SECRET", "PAYPAL_CLIENT_SECRET", "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "GITHUB_TOKEN",
  "GITHUB_PAT", "AWS_SECRET_ACCESS_KEY", "STRIPE_SECRET_KEY", "SLACK_BOT_TOKEN",
];
const suspiciousPathRules = [
  { code: "environment_file", test: p => /(?:^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?)$/u.test(p)
      && !/(?:^|\/)(?:\.env\.example|\.dev\.vars\.example)$/u.test(p) },
  { code: "private_deployment_config", test: p => /(?:^|\/)wrangler\.judge\.local\.jsonc$/u.test(p) },
  { code: "private_key_file", test: p => /\.(?:pem|key|p12|pfx)$/iu.test(p) },
  { code: "database_file", test: p => /\.(?:sqlite|sqlite3|db)(?:-(?:wal|shm|journal))?$/iu.test(p) },
  { code: "private_runtime_directory", test: p => /(?:^|\/)(?:\.data|data\/private|test-results|playwright-report)(?:\/|$)/u.test(p) },
  { code: "recording_or_archive", test: p => /\.(?:mp4|mov|avi|mkv|zip|7z|rar|har)$/iu.test(p) },
];

const usage = `RightsReceipt public repository audit

Usage:
  node scripts/public-release-audit.mjs [--output DIRECTORY]

Scans:
  - the current tracked tree;
  - every reachable Git blob in repository history;
  - tracked filenames for private/runtime artifacts;
  - UTF-8 text blobs up to 16 MiB for likely credentials, private keys, embedded
    basic-auth URLs, non-fixture email addresses and common secret-token prefixes.

Unscanned oversized files, binary bytes, Git links and Git LFS pointers block release.
The audit never writes matched secret values into its evidence file.
By default evidence is written under .data/public-release-audit.
`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function run(executable, args, input = undefined) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.code ?? null,
  };
}
function git(args, input) {
  return run("git", args, input);
}
function parseArgs(args) {
  let output = null, help = false, snapshotOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") help = true;
    else if (args[i] === "--snapshot-only") snapshotOnly = true;
    else if (args[i] === "--output") {
      const next = args[++i];
      if (!next || next.startsWith("--")) throw new Error("invalid_arguments");
      output = next;
    } else throw new Error("invalid_arguments");
  }
  return { output, help, snapshotOnly };
}
function safeOutput(parent) {
  const base = resolve(root, parent ?? join(".data", "public-release-audit"));
  const rel = relative(root, base).split(sep).join("/");
  if (!rel.startsWith("../") && rel !== ".." && rel !== ".data" && !rel.startsWith(".data/")) {
    throw new Error("unsafe_output");
  }
  mkdirSync(base, { recursive: true });
  const slug = new Date().toISOString().replace(/[:.]/gu, "-");
  const directory = join(base, `run-${slug}-${process.pid}`);
  mkdirSync(directory);
  return directory;
}
function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}
function findingKey(finding) {
  return [
    finding.code, finding.scope, finding.path ?? "", finding.blob ?? "",
    finding.line ?? "", finding.commit ?? "", finding.role ?? "",
  ].join("|");
}
function addFinding(list, seen, finding) {
  const key = findingKey(finding);
  if (seen.has(key)) return;
  seen.add(key);
  list.push(Object.freeze(finding));
}
function pathFindings(path, scope, blob, list, seen) {
  const normalized = normalizePath(path);
  for (const rule of suspiciousPathRules) {
    if (rule.test(normalized)) addFinding(list, seen, { code: rule.code, scope, path: normalized, blob });
  }
}
function emailAllowed(email) {
  const normalized = email.toLowerCase();
  if (allowedEmailAddresses.has(normalized)) return true;
  const at = normalized.lastIndexOf("@");
  return at > 0 && allowedEmailDomains.has(normalized.slice(at + 1));
}
function scanText(text, path, scope, blob, list, seen) {
  const lines = text.split(/\r?\n/u);
  const report = (code, line) => addFinding(list, seen, {
    code, scope, path: normalizePath(path), blob, line: line + 1,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA|ENCRYPTED) )?PRIVATE KEY-----\s*$/u.test(line)) report("private_key_material", i);
    if (hasKnownSecretPrefix(line)) {
      report("known_secret_token_prefix", i);
    }
    const fixtureUrlRanges = [];
    const credentialUrlPattern = /https?:\/\/([A-Za-z0-9._~!$&'()*+,;=:%-]+):([A-Za-z0-9._~!$&'()*+,;=:%-]+)@((?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?)/giu;
    for (const urlCredential of line.matchAll(credentialUrlPattern)) {
      const fixtureUrl = /\.(?:test|spec)\.[cm]?[jt]sx?$/iu.test(path)
        && /^(?:name|username|user|fixture|test|demo)$/iu.test(urlCredential[1])
        && /^(?:password|pass|secret|fixture|test|demo)$/iu.test(urlCredential[2]);
      if (!fixtureUrl) report("credential_in_url", i);
      else if (typeof urlCredential.index === "number") {
        const schemeEnd = urlCredential[0].indexOf("://") + 3;
        const at = urlCredential[0].lastIndexOf("@") + 1;
        fixtureUrlRanges.push([urlCredential.index + schemeEnd, urlCredential.index + at]);
      }
    }

    const npmAuth = /^\s*\/\/[^\s]+:_authToken\s*=\s*(.+?)\s*$/iu.exec(line);
    if (npmAuth) {
      let value = npmAuth[1].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
      if (!/^(?:\$\{[A-Z][A-Z0-9_]*\}|<[^>]+>)$/u.test(value)) report("npm_registry_auth_token", i);
    }

    const assignment = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=\s*(.+?)\s*$/u.exec(line);
    if (assignment && sensitiveAssignmentNames.includes(assignment[1])) {
      let value = assignment[2].replace(/\s+#.*$/u, "").trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1,-1);
      }
      if (!isFixtureValue(value, path)) report("sensitive_environment_assignment", i);
    }
    for (const name of sensitiveAssignmentNames) {
      const expression = new RegExp(`(?:^\\s*|[{,]\\s*)["']?${name}["']?\\s*:\\s*["']([^"']+)["']`, "gu");
      for (const objectValue of line.matchAll(expression)) {
        if (!isFixtureValue(objectValue[1], path)) report("sensitive_object_assignment", i);
      }
    }

    for (const bearer of line.matchAll(/["']?Authorization["']?\s*[:=]\s*["']?Bearer\s+([A-Za-z0-9._~+\u002f-]{20,})/giu)) {
      if (!isFixtureValue(bearer[1], path)) report("literal_bearer_token", i);
    }

    let emailLine = line;
    for (const [start,end] of fixtureUrlRanges.sort((a,b)=>b[0]-a[0])) {
      emailLine = emailLine.slice(0,start) + " ".repeat(end-start) + emailLine.slice(end);
    }
    if (!emailLine.includes("@")) continue;
    const emails = emailLine.match(/[A-Z0-9][A-Z0-9.!#$%&'*+/=?^_`{|}~-]{0,63}@[A-Z0-9.-]{1,253}\.[A-Z]{2,63}/giu) ?? [];
    for (const email of emails) {
      if (!emailAllowed(email)) {
        report("non_fixture_email_address", i);
        break;
      }
    }
  }
}
function trackedEntries() {
  const result = git(["ls-files", "--stage", "-z"]);
  if (result.exitCode !== 0) throw new Error("git_ls_files_failed");
  return result.stdout.split("\0").filter(Boolean).map(entry => {
    const match = /^(\d{6}) ([0-9a-f]{40}) ([0-3])\t([\s\S]+)$/u.exec(entry);
    if (!match) throw new Error("git_index_parse_failed");
    return { mode: match[1], sha: match[2], stage: match[3], path: normalizePath(match[4]) };
  });
}
function historicalInventory() {
  const commits = git(["rev-list", "--all"]);
  if (commits.exitCode !== 0) throw new Error("git_history_failed");
  const paths = new Set(), pathsBySha = new Map(), nonRegular = new Map();
  for (const commit of commits.stdout.split(/\r?\n/u).filter(Boolean)) {
    const tree = git(["ls-tree", "-r", "-z", commit]);
    if (tree.exitCode !== 0) throw new Error("git_tree_history_failed");
    for (const entry of tree.stdout.split("\0").filter(Boolean)) {
      const match = /^(\d{6})\s+(blob|commit)\s+([0-9a-f]{40})\t([\s\S]+)$/u.exec(entry);
      if (!match) throw new Error("git_tree_entry_invalid");
      const [, mode, type, sha, rawPath] = match;
      const path = normalizePath(rawPath);
      paths.add(path);
      if (!auditedGitEntry(mode, type)) {
        nonRegular.set(mode + "|" + type + "|" + path, path);
        continue;
      }
      if (!pathsBySha.has(sha)) pathsBySha.set(sha, new Set());
      pathsBySha.get(sha).add(path);
    }
  }
  return { paths, pathsBySha, nonRegular };
}

function blobMetadata(shas) {
  const input = shas.join("\n") + "\n";
  const result = git(["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], input);
  if (result.exitCode !== 0) throw new Error("git_object_check_failed");
  const metadata = new Map();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const match = /^([0-9a-f]{40})\s+(\S+)\s+(\d+)$/u.exec(line);
    if (match) metadata.set(match[1], { type: match[2], size: Number(match[3]) });
  }
  return metadata;
}
function readBlob(sha) {
  const result = spawnSync("git", ["cat-file", "-p", sha], {
    cwd: root, maxBuffer: maxBlobBytes + 1024 * 1024, windowsHide: true,
  });
  if (result.status !== 0 || result.error || !Buffer.isBuffer(result.stdout)) {
    throw new Error("git_blob_read_failed");
  }
  return result.stdout;
}
function scanCommitMetadata(list, seen) {
  const result = git(["log", "--all", "--format=%H%x09%ae%x09%ce"]);
  if (result.exitCode !== 0) throw new Error("git_log_failed");
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (!line) continue;
    const [commit = "", authorEmail = "", committerEmail = ""] = line.split("\t");
    if (!/^[0-9a-f]{40}$/u.test(commit)) continue;
    for (const [role, email] of [["author", authorEmail], ["committer", committerEmail]]) {
      if (email && !emailAllowed(email)) addFinding(list, seen, {
        code: "non_fixture_commit_email",
        scope: "history",
        commit: commit.slice(0,12),
        role,
      });
    }
  }
}
function repoFacts() {
  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  const remote = git(["remote", "get-url", "origin"]);
  const shallow = git(["rev-parse","--is-shallow-repository"]);
  if (head.exitCode !== 0 || !/^[0-9a-f]{40}$/u.test(head.stdout.trim())) throw new Error("head_unavailable");
  return {
    commit: head.stdout.trim(),
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
    clean: status.exitCode === 0 && status.stdout.trim() === "",
    gitStatusSha256: sha256(status.stdout),
    originHasEmbeddedCredentials: remote.exitCode === 0
      ? /https?:\/\/[^/\s@]+@/u.test(remote.stdout.trim())
      : null,
    shallow: shallow.exitCode === 0 ? shallow.stdout.trim() === "true" : null,
  };
}
function main(args = process.argv.slice(2)) {
  let parsed;
  try { parsed = parseArgs(args); }
  catch {
    process.stderr.write("Invalid public audit arguments. Use --help.\n");
    return 2;
  }
  if (parsed.help) { process.stdout.write(usage); return 0; }

  let directory;
  try { directory = safeOutput(parsed.output); }
  catch {
    process.stderr.write("Public audit output must stay under .data or outside the repository.\n");
    return 2;
  }

  const startedAt = new Date().toISOString();
  const findings = [], seen = new Set();
  let facts;
  let scannedBlobs = 0, skippedLargeBlobs = 0, skippedBinaryBlobs = 0;
  try {
    facts = repoFacts();
    if (!facts.clean) addFinding(findings, seen, { code: "checkout_not_clean", scope: "current" });
    if (facts.originHasEmbeddedCredentials) addFinding(findings, seen, { code: "credential_in_git_remote", scope: "current" });

    const current = trackedEntries();
    const currentPaths = current.map(entry => entry.path);
    for (const { path, mode, stage } of current) {
      pathFindings(path, "current", null, findings, seen);
      if (stage !== "0" || !auditedGitEntry(mode, "blob")) {
        addFinding(findings, seen, { code: "nonregular_git_entry", scope: "current", path });
        continue;
      }
      const full = join(root, path);
      let metadata;
      try { metadata = lstatSync(full); }
      catch {
        addFinding(findings, seen, { code: "tracked_file_missing", scope: "current", path });
        continue;
      }
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        addFinding(findings, seen, { code: "nonregular_git_entry", scope: "current", path });
        continue;
      }
      const inspection = inspectAuditBlob(readFileSync(full));
      if (inspection.code) {
        if (inspection.code === "oversized_blob_unscanned") skippedLargeBlobs++;
        if (inspection.code === "binary_blob_unscanned") skippedBinaryBlobs++;
        addFinding(findings, seen, { code: inspection.code, scope: "current", path });
        continue;
      }
      scanText(inspection.text, path, "current", null, findings, seen);
    }
    for (const required of requiredFiles) {
      if (!currentPaths.includes(required)) addFinding(findings, seen, { code: "required_release_file_missing", scope: "current", path: required });
    }

    if (!parsed.snapshotOnly) {
      if (facts.shallow === true) addFinding(findings, seen, { code: "shallow_history", scope: "history" });
      scanCommitMetadata(findings, seen);
      const history = historicalInventory();
      for (const path of history.paths) pathFindings(path, "history", null, findings, seen);
      for (const path of history.nonRegular.values()) {
        addFinding(findings, seen, { code: "nonregular_git_entry", scope: "history", path });
      }
      const metadata = blobMetadata([...history.pathsBySha.keys()]);
      for (const [sha, paths] of history.pathsBySha) {
        const meta = metadata.get(sha);
        const usePaths = paths.size ? [...paths] : ["<unpathed-blob>"];
        if (!meta || meta.type !== "blob") throw new Error("git_blob_metadata_invalid");
        if (meta.size > maxBlobBytes) {
          skippedLargeBlobs++;
          for (const path of usePaths) addFinding(findings, seen, {
            code: "oversized_blob_unscanned", scope: "history", path, blob: sha.slice(0, 12),
          });
          continue;
        }
        const inspection = inspectAuditBlob(readBlob(sha));
        if (inspection.code) {
          if (inspection.code === "binary_blob_unscanned") skippedBinaryBlobs++;
          for (const path of usePaths) addFinding(findings, seen, {
            code: inspection.code, scope: "history", path, blob: sha.slice(0, 12),
          });
          continue;
        }
        scannedBlobs++;
        for (const path of usePaths) scanText(inspection.text, path, "history", sha.slice(0, 12), findings, seen);
      }

    }
  } catch {
    addFinding(findings, seen, { code: "audit_execution_failed", scope: "audit" });
  }

  const evidence = {
    schemaVersion,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: findings.length === 0 ? "passed" : "failed",
    mode: parsed.snapshotOnly ? "snapshot" : "history",
    commit: facts?.commit ?? null,
    branch: facts?.branch ?? null,
    cleanCheckout: facts?.clean ?? null,
    scannedReachableTextBlobs: scannedBlobs,
    skippedLargeBlobs,
    skippedBinaryBlobs,
    maximumScannedBlobBytes: maxBlobBytes,
    requiredFiles,
    findings,
    notes: [
      "Finding records intentionally omit matched secret values.",
      "Every unscannable large, binary, LFS or nonregular Git entry produces a blocking finding.",
      parsed.snapshotOnly ? "Snapshot mode scans the current tracked source only." : "The audit scans reachable Git history, not only the current tree.",
      "A green local audit does not prove GitHub repository visibility or third-party service configuration.",
    ],
  };
  const path = join(directory, "audit.json");
  writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({
    schemaVersion,
    status: evidence.status,
    commit: evidence.commit,
    findingCount: findings.length,
    evidencePath: path,
  }, null, 2) + "\n");
  if (findings.length) process.stderr.write("Public release audit failed. Inspect finding codes in the evidence file; secret values are not recorded.\n");
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
