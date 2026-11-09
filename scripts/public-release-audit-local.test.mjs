import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const source = fileURLToPath(new URL("./public-release-audit.mjs", import.meta.url));
const policySource = fileURLToPath(new URL("./public-audit-blob-policy.mjs", import.meta.url));
const fixtureClassifierSource = fileURLToPath(new URL("./support/public-audit-fixture-value.mjs", import.meta.url));
const tokenPatternSource = fileURLToPath(new URL("./support/public-audit-token-patterns.mjs", import.meta.url));
const required = [
  "LICENSE",
  "README.md",
  "JUDGES.md",
  "docs/submission/README.md",
  "docs/submission/DEVPOST_DRAFT.md",
  "docs/submission/VIDEO_STORYBOARD.md",
  "docs/submission/JUDGE_QUICKSTART.md",
  "docs/submission/PUBLIC_REPO_PREFLIGHT.md",
];

function run(cwd, command, args = []) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  return result;
}
function git(cwd, ...args) {
  const result = run(cwd, "git", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const dir = join(tmpdir(), `rr-public-audit-${randomUUID()}`);
  mkdirSync(join(dir,"scripts"), { recursive: true });
  cpSync(source, join(dir,"scripts","public-release-audit.mjs"));
  cpSync(policySource, join(dir,"scripts","public-audit-blob-policy.mjs"));
  mkdirSync(join(dir, "scripts", "support"), { recursive: true });
  cpSync(fixtureClassifierSource, join(dir, "scripts", "support", "public-audit-fixture-value.mjs"));
  cpSync(tokenPatternSource, join(dir, "scripts", "support", "public-audit-token-patterns.mjs"));
  writeFileSync(join(dir,".gitignore"), ".data/\n");
  for (const path of required) {
    const full = join(dir,path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, path === "README.md" ? "Contact fixture@example.test\n" : `fixture ${path}\n`);
  }
  writeFileSync(join(dir,".dev.vars.example"), "PAYPAL_SANDBOX_CLIENT_SECRET=<sandbox app secret>\n");
  git(dir,"init");
  git(dir,"config","user.email","fixture@example.test");
  git(dir,"config","user.name","RightsReceipt Fixture");
  git(dir,"add",".");
  git(dir,"commit","-m","fixture");
  return dir;
}
function audit(dir, ...args) {
  return run(dir, process.execPath, ["scripts/public-release-audit.mjs", ...args]);
}
function evidence(result) {
  const parsed = JSON.parse(result.stdout);
  return JSON.parse(readFileSync(parsed.evidencePath,"utf8"));
}

test("clean fixture repository passes current-tree and history audit", () => {
  const dir = fixture();
  try {
    const result = audit(dir);
    assert.equal(result.status,0,result.stderr);
    const record = evidence(result);
    assert.equal(record.status,"passed");
    assert.equal(record.findings.length,0);
    assert.ok(record.scannedReachableTextBlobs > 0);
    assert.equal(record.cleanCheckout,true);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("deleted credential remains a history blocker without leaking its value", () => {
  const dir = fixture();
  try {
    const secret = "actual" + "-looking-paypal-secret-987654321";
    writeFileSync(join(dir,"private-config.txt"), `PAYPAL_SANDBOX_CLIENT_SECRET=${secret}\n`);
    git(dir,"add","private-config.txt");
    git(dir,"commit","-m","bad historical credential");
    rmSync(join(dir,"private-config.txt"));
    git(dir,"add","-u");
    git(dir,"commit","-m","delete credential");

    const result = audit(dir);
    assert.equal(result.status,1);
    const record = evidence(result);
    assert.equal(record.status,"failed");
    assert.ok(record.findings.some(row => row.code === "sensitive_environment_assignment" && row.scope === "history"));
    assert.ok(!readFileSync(JSON.parse(result.stdout).evidencePath,"utf8").includes(secret));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("embedded fixture words in an opaque secret do not exempt the public snapshot", () => {
  const dir = fixture();
  try {
    const secret = "real-credential-with-fake-in-the-middle-987654321";
    writeFileSync(join(dir,"provider-config.txt"), `PAYPAL_SANDBOX_CLIENT_SECRET=${secret}\n`);
    git(dir,"add","provider-config.txt");
    git(dir,"commit","-m","opaque secret with embedded marker");
    const result = audit(dir,"--snapshot-only");
    assert.equal(result.status,1);
    const record = evidence(result);
    assert.ok(record.findings.some(row => row.code === "sensitive_environment_assignment"
      && row.path === "provider-config.txt"));
    assert.equal(JSON.stringify(record).includes(secret),false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("explicit fixture placeholder remains accepted by the public snapshot", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,"provider-config.txt"), "PAYPAL_SANDBOX_CLIENT_SECRET=fixture-secret-123\n");
    git(dir,"add","provider-config.txt");
    git(dir,"commit","-m","clearly labeled fixture");
    const result = audit(dir,"--snapshot-only");
    assert.equal(result.status,0,result.stderr);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("current financial test fixtures do not create false positive public snapshot findings", () => {
  const dir = fixture();
  const sourcePaths = [
    "support/transaction-browser-fixture.mjs",
    "buyer-payment-local.test.mjs",
    "judge-rehearsal-isolation-local.test.mjs",
    "paypal-adapter-local.test.mjs",
    "invoice-controls-local.test.mjs",
    "invoice-sending-local.test.mjs",
    "invoice-recovery-local.test.mjs",
    "paypal-invoice-local.test.mjs",
    "paypal-sandbox-draft-local.test.mjs",
  ];
  try {
    for (const path of sourcePaths) {
      const destination = join(dir, "scripts", path);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(fileURLToPath(new URL("./" + path, import.meta.url)), destination);
    }
    git(dir, "add", "scripts");
    git(dir, "commit", "-m", "current source fixtures");
    const result = audit(dir, "--snapshot-only");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const record = evidence(result);
    assert.deepEqual(record.findings, []);
    assert.equal(record.status, "passed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("tracked private environment file is rejected", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,".env.local"), "APP_MODE=local\n");
    git(dir,"add","-f",".env.local");
    git(dir,"commit","-m","bad env file");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "environment_file"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("force-tracked local judge deployment configuration is a publication blocker", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,"wrangler.judge.local.jsonc"),
      JSON.stringify({database_id:"11111111-2222-4333-8444-555555555555"}) + "\n");
    git(dir,"add","-f","wrangler.judge.local.jsonc");
    git(dir,"commit","-m","accidental private judge config");
    const result = audit(dir,"--snapshot-only");
    assert.equal(result.status,1);
    const record = evidence(result);
    assert.ok(record.findings.some(row => row.code === "private_deployment_config"
      && row.path === "wrangler.judge.local.jsonc"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("missing required judge documentation is rejected", () => {
  const dir = fixture();
  try {
    rmSync(join(dir,"JUDGES.md"));
    git(dir,"add","-u");
    git(dir,"commit","-m","remove judge guide");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "required_release_file_missing" && row.path === "JUDGES.md"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("private keys and non-fixture emails are detected without preserving matched text", () => {
  const dir = fixture();
  try {
    const keyHeader = "-----BEGIN " + "PRIVATE KEY-----";
    const mail = "person" + "@real-domain.test";
    writeFileSync(join(dir,"notes.txt"), keyHeader + "\n" + mail + "\n");
    git(dir,"add","notes.txt");
    git(dir,"commit","-m","bad private data");
    const result = audit(dir);
    assert.equal(result.status,1);
    const record = evidence(result);
    assert.ok(record.findings.some(row => row.code === "private_key_material"));
    assert.ok(record.findings.some(row => row.code === "non_fixture_email_address"));
    const raw = readFileSync(JSON.parse(result.stdout).evidencePath,"utf8");
    assert.ok(!raw.includes(keyHeader));
    assert.ok(!raw.includes(mail));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("audit refuses evidence output inside a tracked repository directory", () => {
  const dir = fixture();
  try {
    const result = audit(dir,"--output","docs/audit-output");
    assert.equal(result.status,2);
    assert.match(result.stderr,/under \.data or outside/u);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("real-looking commit author email remains a publication blocker", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,"commit-metadata.txt"), "metadata fixture\n");
    git(dir,"add","commit-metadata.txt");
    const privateEmail = "private-person" + "@real-domain.test";
    git(dir,"-c","user.name=Private Fixture","-c",`user.email=${privateEmail}`,"commit","-m","private commit metadata");
    const result = audit(dir);
    assert.equal(result.status,1);
    const record = evidence(result);
    assert.ok(record.findings.some(row => row.code === "non_fixture_commit_email" && row.role === "author"));
    assert.ok(record.findings.some(row => row.code === "non_fixture_commit_email" && row.role === "committer"));
    assert.ok(!readFileSync(JSON.parse(result.stdout).evidencePath,"utf8").includes(privateEmail));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("object-style credential literals are scanned as well as environment assignments", () => {
  const dir = fixture();
  try {
    const value = "actual" + "-object-secret-987654321";
    writeFileSync(join(dir,"config.json"), JSON.stringify({ PAYPAL_SANDBOX_CLIENT_SECRET: value }, null, 2));
    git(dir,"add","config.json");
    git(dir,"commit","-m","bad object credential");
    const result = audit(dir);
    assert.equal(result.status,1);
    const record = evidence(result);
    assert.ok(record.findings.some(row => row.code === "sensitive_object_assignment"));
    assert.ok(!readFileSync(JSON.parse(result.stdout).evidencePath,"utf8").includes(value));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("snapshot-only mode ignores deleted history while still scanning current content", () => {
  const dir = fixture();
  try {
    const secret = "actual" + "-deleted-history-secret-987654321";
    writeFileSync(join(dir,"historical.txt"), `PAYPAL_SANDBOX_CLIENT_SECRET=${secret}\n`);
    git(dir,"add","historical.txt");
    git(dir,"commit","-m","historical secret");
    rmSync(join(dir,"historical.txt"));
    git(dir,"add","-u");
    git(dir,"commit","-m","remove historical secret");
    const result = audit(dir,"--snapshot-only");
    assert.equal(result.status,0,result.stderr);
    const record = evidence(result);
    assert.equal(record.mode,"snapshot");
    assert.equal(record.findings.length,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("GitHub App, OAuth, OpenAI project and temporary AWS token shapes block public snapshots", () => {
  const dir = fixture();
  try {
    const secrets = [
      "ghu_" + "A".repeat(32),
      "ghs_123456_" + "B".repeat(25) + "." + "C".repeat(25) + "." + "D".repeat(25),
      "sk-proj-" + "P".repeat(32),
      "ASIA" + "Z".repeat(16),
    ];
    writeFileSync(join(dir, "provider-identifiers.txt"), secrets.join("\n") + "\n");
    git(dir, "add", "provider-identifiers.txt");
    git(dir, "commit", "-m", "synthetic leaked provider token patterns");
    const result = audit(dir, "--snapshot-only");
    assert.equal(result.status, 1);
    const record = evidence(result);
    const matches = record.findings.filter(row => row.code === "known_secret_token_prefix"
      && row.path === "provider-identifiers.txt");
    assert.equal(matches.length, secrets.length, JSON.stringify(record.findings));
    const minimized = readFileSync(JSON.parse(result.stdout).evidencePath, "utf8");
    for (const secret of secrets) assert.equal(minimized.includes(secret), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("deleted GitHub App token cannot pass the full history audit", () => {
  const dir = fixture();
  try {
    const key = "ghr_" + "A".repeat(36);
    writeFileSync(join(dir, "temporary-token.txt"), key + "\n");
    git(dir, "add", "temporary-token.txt");
    git(dir, "commit", "-m", "fake compromised token");
    rmSync(join(dir, "temporary-token.txt"));
    git(dir, "add", "-u");
    git(dir, "commit", "-m", "delete token");
    const snapshot = audit(dir, "--snapshot-only");
    assert.equal(snapshot.status, 0, snapshot.stderr);
    const full = audit(dir);
    assert.equal(full.status, 1);
    assert.ok(evidence(full).findings.some(row => row.code === "known_secret_token_prefix"
      && row.scope === "history" && row.path === "temporary-token.txt"));
    assert.equal(JSON.stringify(evidence(full)).includes(key), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("quoted Authorization bearer properties are detected", () => {
  const dir = fixture();
  try {
    const token = "abcdefghijklmnopqrstuvwxyz" + "1234567890";
    writeFileSync(join(dir,"headers.json"), JSON.stringify({ Authorization: `Bearer ${token}` }));
    git(dir,"add","headers.json");
    git(dir,"commit","-m","bad bearer header");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "literal_bearer_token"));
    assert.ok(!readFileSync(JSON.parse(result.stdout).evidencePath,"utf8").includes(token));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("renamed historical private filenames remain blockers", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,".env.local"), "APP_MODE=local\n");
    git(dir,"add","-f",".env.local");
    git(dir,"commit","-m","historical private filename");
    git(dir,"mv",".env.local","config.txt");
    git(dir,"commit","-m","rename private file");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "environment_file" && row.path === ".env.local"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("known synthetic basic-auth URLs in test files do not block release", () => {
  const dir = fixture();
  try {
    mkdirSync(join(dir,"scripts"),{recursive:true});
    writeFileSync(join(dir,"scripts","security-fixture.test.mjs"),
      'const a="https://name:password@rightsreceipt.example"; const b="https://username:pass@api-m.sandbox.paypal.com";\n');
    git(dir,"add","scripts/security-fixture.test.mjs");
    git(dir,"commit","-m","synthetic URL fixtures");
    const result = audit(dir);
    assert.equal(result.status,0,result.stderr);
    assert.equal(evidence(result).findings.length,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("real-looking basic-auth URL in a test file still fails", () => {
  const dir = fixture();
  try {
    const user = "acct" + "049";
    const password = "real-looking-" + "password-987654321";
    writeFileSync(join(dir,"security.test.mjs"), `const url="https://${user}:${password}${String.fromCharCode(64)}api-m.sandbox.paypal.com";\n`);
    git(dir,"add","security.test.mjs");
    git(dir,"commit","-m","bad URL credential");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "credential_in_url"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("encrypted PKCS8 private-key material is rejected", () => {
  const dir = fixture();
  try {
    const header = "-----BEGIN " + "ENCRYPTED PRIVATE KEY-----";
    writeFileSync(join(dir,"encrypted-notes.txt"), header+"\n");
    git(dir,"add","encrypted-notes.txt");
    git(dir,"commit","-m","bad encrypted private key");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "private_key_material"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("provider-issued test-key prefixes are not treated as synthetic fixtures", () => {
  const dir = fixture();
  try {
    const value = "sk_" + "test_" + "A".repeat(32);
    writeFileSync(join(dir,"stripe-config.txt"), `STRIPE_SECRET_KEY=${value}\n`);
    git(dir,"add","stripe-config.txt");
    git(dir,"commit","-m","bad provider test credential");
    const result = audit(dir);
    assert.equal(result.status,1);
    const findings = evidence(result).findings;
    assert.ok(findings.some(row => row.code === "sensitive_environment_assignment" || row.code === "known_secret_token_prefix"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("full history audit refuses a shallow clone", () => {
  const dir = fixture();
  const clone = join(tmpdir(),`rr-public-audit-shallow-${randomUUID()}`);
  try {
    const secret = "actual" + "-shallow-history-secret-987654321";
    writeFileSync(join(dir,"historical-secret.txt"), `PAYPAL_SANDBOX_CLIENT_SECRET=${secret}\n`);
    git(dir,"add","historical-secret.txt");
    git(dir,"commit","-m","hidden history secret");
    rmSync(join(dir,"historical-secret.txt"));
    git(dir,"add","-u");
    git(dir,"commit","-m","delete hidden secret");
    const cloned = run(tmpdir(),"git",["clone","--depth=1","--no-local",dir,clone]);
    assert.equal(cloned.status,0,cloned.stderr);
    const result = audit(clone);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "shallow_history"));
  } finally {
    rmSync(dir,{recursive:true,force:true});
    rmSync(clone,{recursive:true,force:true});
  }
});


test("domain-only audit examples are not treated as email addresses", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,"audit-notes.md"), "- `@gmail.com`\n- `@hawaii.edu`\n");
    git(dir,"add","audit-notes.md");
    git(dir,"commit","-m","domain-only examples");
    const result = audit(dir);
    assert.equal(result.status,0,result.stderr);
    assert.equal(evidence(result).findings.length,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("historical blob reused at test and non-test paths is scanned under both path contexts", () => {
  const dir = fixture();
  try {
    const value = "sandbox" + "035secret";
    const secretKey = "PAYPAL_SANDBOX_" + "CLIENT_SECRET";
    mkdirSync(join(dir,"scripts"),{recursive:true});
    writeFileSync(join(dir,"scripts","fixture.test.mjs"), `const x={${secretKey}:"${value}"};\n`);
    git(dir,"add","scripts/fixture.test.mjs");
    git(dir,"commit","-m","safe fixture path");
    writeFileSync(join(dir,"production-config.js"), `const x={${secretKey}:"${value}"};\n`);
    git(dir,"add","production-config.js");
    git(dir,"commit","-m","unsafe reused blob");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row =>
      row.code === "sensitive_object_assignment" && row.path === "production-config.js"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("historical unicode private filenames remain blockers after deletion", () => {
  const dir = fixture();
  try {
    const nested = join(dir,"秘密");
    mkdirSync(nested,{recursive:true});
    writeFileSync(join(nested,"private.p12"),Buffer.from([1,2,3,4,0,5]));
    git(dir,"add","秘密/private.p12");
    git(dir,"commit","-m","historical unicode key file");
    rmSync(join(nested,"private.p12"));
    git(dir,"add","-u");
    git(dir,"commit","-m","delete unicode key file");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row =>
      row.code === "private_key_file" && row.path === "秘密/private.p12"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("an allowed fixture URL cannot hide a later real credential URL on the same line", () => {
  const dir = fixture();
  try {
    const user = "acct" + "049";
    const password = "real-credential-" + "987654321";
    writeFileSync(join(dir,"scripts","mixed-urls.test.mjs"),
      `const a="https://name:password@localhost"; const b="https://${user}:${password}@localhost";\n`);
    git(dir,"add","scripts/mixed-urls.test.mjs");
    git(dir,"commit","-m","mixed credential URLs");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "credential_in_url"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("long lines without email markers do not create false findings", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,"large-text.txt"),"A".repeat(100000)+"\n");
    git(dir,"add","large-text.txt");
    git(dir,"commit","-m","large plain text");
    const result = audit(dir);
    assert.equal(result.status,0,result.stderr);
    assert.equal(evidence(result).findings.length,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("an allowed object fixture cannot hide a later real secret on the same line", () => {
  const dir = fixture();
  try {
    const real = "actual-paypal-credential-" + "987654321";
    const secretKey = "PAYPAL_SANDBOX_" + "CLIENT_SECRET";
    writeFileSync(join(dir,"scripts","mixed-object.test.mjs"),
      `const a={${secretKey}:"fixture-secret"}; const b={${secretKey}:"${real}"};\n`);
    git(dir,"add","scripts/mixed-object.test.mjs");
    git(dir,"commit","-m","mixed object secrets");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "sensitive_object_assignment"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("an allowed bearer fixture cannot hide a later real bearer on the same line", () => {
  const dir = fixture();
  try {
    const real = "realbearer" + "98765432109876543210";
    writeFileSync(join(dir,"scripts","mixed-bearer.test.mjs"),
      `const a={Authorization:"Bearer fixture-bearer-value-1234567890"}; const b={Authorization:"Bearer ${real}"};\n`);
    git(dir,"add","scripts/mixed-bearer.test.mjs");
    git(dir,"commit","-m","mixed bearer tokens");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "literal_bearer_token"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("synthetic URL masking does not hide an unrelated real email on the same line", () => {
  const dir = fixture();
  try {
    const mail = "private-person" + "@real-domain.test";
    writeFileSync(join(dir,"scripts","url-and-email.test.mjs"),
      `const a="https://name:password@localhost"; const email="${mail}";\n`);
    git(dir,"add","scripts/url-and-email.test.mjs");
    git(dir,"commit","-m","fixture URL plus private email");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "non_fixture_email_address"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("username-only HTTPS remote userinfo blocks publication", () => {
  const dir = fixture();
  try {
    const token = "ghp_" + "A".repeat(32);
    git(dir,"remote","add","origin",`https://${token}${String.fromCharCode(64)}github.com/owner/repo.git`);
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "credential_in_git_remote"));
    assert.ok(!readFileSync(JSON.parse(result.stdout).evidencePath,"utf8").includes(token));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("literal npm registry auth tokens block current and historical publication", () => {
  const dir = fixture();
  try {
    const token = "npm_" + "A".repeat(32);
    writeFileSync(join(dir,".npmrc"), "//registry.npmjs.org/:_authToken=" + token + "\n");
    git(dir,"add",".npmrc");
    git(dir,"commit","-m","bad npm token");
    let result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row =>
      row.code === "npm_registry_auth_token" || row.code === "known_secret_token_prefix"));
    assert.ok(!readFileSync(JSON.parse(result.stdout).evidencePath,"utf8").includes(token));

    writeFileSync(join(dir,".npmrc"), "//registry.npmjs.org/:_authToken=$" + "{NPM_TOKEN}\n");
    git(dir,"add",".npmrc");
    git(dir,"commit","-m","replace npm token with placeholder");
    result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row =>
      row.scope === "history" && (row.code === "npm_registry_auth_token" || row.code === "known_secret_token_prefix")));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("npm registry environment placeholder is allowed in a clean repository", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir,".npmrc"), "//registry.npmjs.org/:_authToken=$" + "{NPM_TOKEN}\n");
    git(dir,"add",".npmrc");
    git(dir,"commit","-m","npm placeholder");
    const result = audit(dir);
    assert.equal(result.status,0,result.stderr);
    assert.equal(evidence(result).findings.length,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("compact synthetic URL cannot mask adjacent real email", () => {
  const dir = fixture();
  try {
    const mail = "private-person" + "@real-domain.test";
    writeFileSync(join(dir,"scripts","compact-email.test.mjs"),
      `const a="https://name:password@localhost",email="${mail}";\n`);
    git(dir,"add","scripts/compact-email.test.mjs");
    git(dir,"commit","-m","compact fixture URL and email");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "non_fixture_email_address"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("compact synthetic URL cannot consume a later real credential URL", () => {
  const dir = fixture();
  try {
    const user = "acct" + "049";
    const password = "real-credential-" + "987654321";
    writeFileSync(join(dir,"scripts","compact-urls.test.mjs"),
      `const a="https://name:password@localhost",b="https://${user}:${password}@localhost";\n`);
    git(dir,"add","scripts/compact-urls.test.mjs");
    git(dir,"commit","-m","compact mixed URLs");
    const result = audit(dir);
    assert.equal(result.status,1);
    assert.ok(evidence(result).findings.some(row => row.code === "credential_in_url"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("a formerly skipped 2 MiB UTF8 dataset is fully inspected for secrets", () => {
  const dir = fixture();
  try {
    const secret = "real-looking-paypal-secret-" + "987654321";
    const content = ("public synthetic data " + "a".repeat(90) + "\n").repeat(20000)
      + "PAYPAL_SANDBOX_CLIENT_SECRET=" + secret + "\n";
    assert.ok(Buffer.byteLength(content) > 2 * 1024 * 1024);
    writeFileSync(join(dir, "training-data.jsonl"), content);
    git(dir, "add", "training-data.jsonl");
    git(dir, "commit", "-m", "large text source with credential");
    const result = audit(dir, "--snapshot-only");
    assert.equal(result.status, 1);
    const record = evidence(result);
    assert.ok(record.findings.some(row => row.code === "sensitive_environment_assignment"
      && row.path === "training-data.jsonl"));
    assert.equal(record.skippedLargeBlobs, 0);
    assert.ok(!readFileSync(JSON.parse(result.stdout).evidencePath, "utf8").includes(secret));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("oversized source text fails publication rather than being excluded", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "too-big.txt"), Buffer.alloc(16 * 1024 * 1024 + 1, 65));
    git(dir, "add", "too-big.txt");
    git(dir, "commit", "-m", "oversized tracked source");
    const result = audit(dir, "--snapshot-only");
    assert.equal(result.status, 1);
    assert.ok(evidence(result).findings.some(row => row.code === "oversized_blob_unscanned"
      && row.path === "too-big.txt"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("binary NUL and invalid UTF8 source bytes block the public snapshot", () => {
  for (const bytes of [Buffer.from([65, 0, 66]), Buffer.from([0xff, 0xfe, 0xfd])]) {
    const dir = fixture();
    try {
      writeFileSync(join(dir, "unknown.data"), bytes);
      git(dir, "add", "unknown.data");
      git(dir, "commit", "-m", "unscannable tracked blob");
      const result = audit(dir, "--snapshot-only");
      assert.equal(result.status, 1);
      assert.ok(evidence(result).findings.some(row => row.code === "binary_blob_unscanned"
        && row.path === "unknown.data"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("unresolved LFS pointer blocks publication without fetching external content", () => {
  const dir = fixture();
  try {
    const pointer = "version https://git-lfs.github.com/spec/v1\n"
      + "oid sha256:" + "a".repeat(64) + "\nsize 42500\n";
    writeFileSync(join(dir, "image.asset"), pointer);
    git(dir, "add", "image.asset");
    git(dir, "commit", "-m", "unresolved LFS pointer");
    const result = audit(dir, "--snapshot-only");
    assert.equal(result.status, 1);
    assert.ok(evidence(result).findings.some(row => row.code === "unresolved_git_lfs_pointer"
      && row.path === "image.asset"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("deleted historical binary remains a blocker after a clean current snapshot", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "old-binary.data"), Buffer.from([77, 0, 78]));
    git(dir, "add", "old-binary.data");
    git(dir, "commit", "-m", "historical binary");
    rmSync(join(dir, "old-binary.data"));
    git(dir, "add", "-u");
    git(dir, "commit", "-m", "delete historical binary");
    const full = audit(dir);
    assert.equal(full.status, 1);
    assert.ok(evidence(full).findings.some(row => row.code === "binary_blob_unscanned"
      && row.scope === "history" && row.path === "old-binary.data"));
    const snapshot = audit(dir, "--snapshot-only");
    assert.equal(snapshot.status, 0, snapshot.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Git symlink entries cannot be mistaken for inspected regular source", () => {
  const dir = fixture();
  try {
    const targetBlob = git(dir, "rev-parse", "HEAD:README.md");
    git(dir, "update-index", "--add", "--cacheinfo", "120000," + targetBlob + ",public-link");
    git(dir, "commit", "-m", "tracked symlink");
    const result = audit(dir);
    assert.equal(result.status, 1);
    assert.ok(evidence(result).findings.some(row => row.code === "nonregular_git_entry"
      && row.scope === "history" && row.path === "public-link"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Git submodule entries cannot bypass public history inspection", () => {
  const dir = fixture();
  try {
    const commit = git(dir, "rev-parse", "HEAD");
    git(dir, "update-index", "--add", "--cacheinfo", "160000," + commit + ",vendor/external");
    git(dir, "commit", "-m", "gitlink");
    const result = audit(dir);
    assert.equal(result.status, 1);
    assert.ok(evidence(result).findings.some(row => row.code === "nonregular_git_entry"
      && row.scope === "history" && row.path === "vendor/external"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
