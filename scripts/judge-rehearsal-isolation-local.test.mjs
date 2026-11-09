/** Public one-command rehearsal isolation, reset evidence and safe output boundaries. */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRehearsalWorkerEnvironment } from "./support/judge-rehearsal-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = join(root, "scripts/judge-rehearsal.mjs");
const runtime = new URL("./support/judge-rehearsal-runtime.mjs", import.meta.url).href;
const directory = mkdtempSync(join(tmpdir(), "rightsreceipt-rehearsal-isolation-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const marker = "RR040_UNTRUSTED_HOST_VALUE_MUST_NOT_APPEAR";
const output = join(directory, "reports with spaces");
const database = join(directory, "existing-database.sqlite");
writeFileSync(database, "Existing database sentinel. The rehearsal does not own this file.\n");
mkdirSync(output);
writeFileSync(join(output, "report.html"), "Unrelated report that must remain untouched.");
writeFileSync(join(output, "evidence.json"), "Unrelated evidence that must remain untouched.");
const initialDatabase = readFileSync(database);
const poisoned = {
  ...process.env, APP_MODE: "production", PAYPAL_MODE: "paypal_live", PAYPAL_BASE_URL: "https://api-m.paypal.com",
  PAYPAL_SANDBOX_CLIENT_ID: marker, PAYPAL_SANDBOX_CLIENT_SECRET: marker, PAYPAL_ACCESS_TOKEN: marker,
  CREATOR_ACCESS_ISSUER: "https://untrusted.example.test", CREATOR_ACCESS_PRINCIPALS: marker,
  DB: database, DATABASE_URL: database, DATABASE_PATH: database, RIGHTSRECEIPT_DATABASE: database,
  HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9",
  TZ: "Pacific/Kiritimati",
};
delete poisoned.NODE_OPTIONS;
delete poisoned.NODE_PATH;

function launch(args, env = poisoned) {
  const result = spawnSync(process.execPath, [launcher, ...args], {
    cwd: directory, env, encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, "The public launcher must terminate without a child-process error.");
  return result;
}

function safeText(text) {
  for (const privateValue of [marker, "fixture-transaction-secret", "transaction-fixture-access", "buyer@example.test",
    "jordan@example.test", "Jordan Lee", "Cedar & Tide Travel", "Private buyer evidence", "merchant@example.test",
    "creator@example.test", "PRIVATE_SQL_FAILURE", "PRIVATE_LOST_ACK"])
    assert.equal(text.includes(privateValue), false, "Reports and diagnostics must exclude credentials and raw private fixture details.");
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u);
  assert.doesNotMatch(text, /-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
}

function safeKeys(value) {
  if (!value || typeof value !== "object") return;
  const forbidden = new Set(["token", "buyerToken", "accessToken", "assertion", "jwt", "privateKey", "authorization",
    "requestBody", "responseBody", "requestUrl", "payload", "buyerEmail", "buyerName", "buyerOrganization",
    "originalRequest", "intendedUseText", "paymentUrl", "caseId", "operationId", "invoiceId", "publicId"]);
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, `Evidence must not serialize private identity or payload field ${key}.`);
    safeKeys(child);
  }
}

let completed;
function runs() {
  if (completed) return completed;
  completed = [];
  for (let index = 0; index < 2; index++) {
    const result = launch(["--output", output]);
    assert.equal(result.status, 0, result.stderr);
    safeText(result.stdout); safeText(result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(summary).sort(), ["schemaVersion", "status", "mode", "scenarioCount", "resetCount", "reportPath", "evidencePath"].sort());
    assert.equal(summary.schemaVersion, "judge-rehearsal-run-v1");
    assert.equal(summary.status, "passed"); assert.equal(summary.mode, "local_injected");
    assert.equal(summary.scenarioCount, 3); assert.equal(summary.resetCount, 3);
    const run = dirname(summary.reportPath);
    assert.equal(dirname(run), output); assert.match(run.slice(output.length + 1), /^run-[A-Za-z0-9]+$/u);
    assert.equal(summary.reportPath, join(run, "report.html")); assert.equal(summary.evidencePath, join(run, "evidence.json"));
    assert.deepEqual(readdirSync(run).sort(), ["evidence.json", "report.html"]);
    const raw = readFileSync(summary.evidencePath, "utf8"), html = readFileSync(summary.reportPath, "utf8");
    safeText(raw); safeText(html);
    const evidence = JSON.parse(raw); safeKeys(evidence);
    completed.push({ summary, evidence, raw, html });
  }
  return completed;
}

test("the public Node command rehearses actual journeys despite poisoned host application and provider settings", () => {
  for (const { evidence } of runs()) {
    assert.equal(evidence.schemaVersion, "judge-rehearsal-v1");
    assert.equal(evidence.mode, "local_injected"); assert.equal(evidence.status, "passed");
    assert.equal(evidence.scenarios.length, 3); assert.equal(evidence.resets.length, 3);
    assert.deepEqual(evidence.isolation, { database: "memory", externalRequests: 0, credentialsUsed: false });
    assert.equal(evidence.baseline.migrationCount, 9); assert.equal(evidence.baseline.domainTableCount, 33);
    assert.equal(Object.keys(evidence.baseline.rows).length, 33);
  }
  assert.deepEqual(readFileSync(database), initialDatabase);
});

test("every controlled reset restores the complete baseline and denies prior transaction access", () => {
  for (const { evidence } of runs()) {
    assert.equal(evidence.baseline.rows.assets, 1); assert.equal(evidence.baseline.rows.creator_workspaces, 1);
    assert.equal(evidence.baseline.rows.pricing_policy_versions, 1);
    for (const [table, count] of Object.entries(evidence.baseline.rows))
      if (!["assets", "creator_workspaces", "pricing_policy_versions", "demo_reset_epochs"].includes(table)) assert.equal(count, 0, table);
    for (const reset of evidence.resets) {
      assert.equal(reset.baselineMatches, true); assert.equal(reset.transactionsCleared, true);
      assert.equal(reset.oldCapabilityDenied, true); assert.equal(reset.oldReceiptDenied, true);
      assert.equal(reset.oldCreatorCaseDenied, true); assert.deepEqual(reset.rowsAfter, evidence.baseline.rows);
      assert.equal(reset.rowsBefore.licensing_cases, 1); assert.equal(reset.rowsBefore.payment_operations, 2);
      assert.equal(reset.rowsBefore.permissions, 1); assert.equal(reset.rowsBefore.receipt_revisions, 1);
    }
  }
});

test("a fresh process repeats semantic results while preserving existing reports and the sentinel database", () => {
  const [first, second] = runs();
  assert.notEqual(first.summary.reportPath, second.summary.reportPath);
  assert.equal(first.evidence.repeatability.ordinaryMatchesRepeat, true);
  assert.equal(second.evidence.repeatability.ordinaryMatchesRepeat, true);
  assert.match(first.evidence.repeatability.normalizedOutcomeSha256, /^[a-f0-9]{64}$/u);
  assert.equal(first.evidence.repeatability.normalizedOutcomeSha256, second.evidence.repeatability.normalizedOutcomeSha256);
  assert.equal(first.evidence.baseline.hash, second.evidence.baseline.hash);
  assert.equal(readFileSync(join(output, "report.html"), "utf8"), "Unrelated report that must remain untouched.");
  assert.equal(readFileSync(join(output, "evidence.json"), "utf8"), "Unrelated evidence that must remain untouched.");
  assert.deepEqual(readFileSync(database), initialDatabase);
});

test("HTML is a static local simulation report without active scripts, external assets or payment claims", () => {
  const { html } = runs()[0];
  assert.match(html, /Local simulation/u); assert.match(html, /Release gates remain open/u);
  assert.match(html, /scheduled/iu); assert.match(html, /reconciliation/iu);
  assert.match(html, /http-equiv=["']Content-Security-Policy["']/iu);
  assert.doesNotMatch(html, /<script\b/iu);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["'](?:https?:|\/\/)/iu);
  assert.doesNotMatch(html, /<form\b/iu);
});

test("worker environment excludes runtime injection, proxy, provider and database configuration", () => {
  const source = { ...poisoned, NODE_OPTIONS: "--require private-preload", NODE_PATH: "private-module-path",
    OPENAI_API_KEY: marker, AWS_SECRET_ACCESS_KEY: marker, CLOUDFLARE_API_TOKEN: marker };
  const clean = createRehearsalWorkerEnvironment(source);
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "APP_MODE", "PAYPAL_MODE", "PAYPAL_BASE_URL", "PAYPAL_SANDBOX_CLIENT_ID",
    "PAYPAL_SANDBOX_CLIENT_SECRET", "PAYPAL_ACCESS_TOKEN", "CREATOR_ACCESS_ISSUER", "CREATOR_ACCESS_PRINCIPALS", "DB",
    "DATABASE_URL", "DATABASE_PATH", "RIGHTSRECEIPT_DATABASE", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "OPENAI_API_KEY",
    "AWS_SECRET_ACCESS_KEY", "CLOUDFLARE_API_TOKEN"]) assert.equal(Object.hasOwn(clean, key), false, key);
  assert.equal(JSON.stringify(clean).includes(marker), false);
  assert.equal(source.NODE_OPTIONS, "--require private-preload", "Sanitizing the worker must not rewrite the caller's environment.");
});

test("standalone network tripwires block fetch and Node HTTP, socket, TLS and DNS APIs before dispatch", () => {
  const code = `
    import assert from 'node:assert/strict';
    import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
    import tls from 'node:tls'; import dns from 'node:dns';
    const { installRehearsalNetworkTripwire } = await import(${JSON.stringify(runtime)});
    const original = {fetch:globalThis.fetch,httpGet:http.get,httpsRequest:https.request,netConnect:net.Socket.prototype.connect,
      tlsConnect:tls.TLSSocket.prototype.connect,tlsDescriptor:Object.getOwnPropertyDescriptor(tls.TLSSocket.prototype,'connect')};
    const tripwire = installRehearsalNetworkTripwire();
    const blocked = error => error?.code === 'REHEARSAL_NETWORK_BLOCKED';
    try {
      await assert.rejects(() => fetch('http://127.0.0.1:54321'), blocked);
      for (const invoke of [() => http.get('http://127.0.0.1:54321'), () => https.request('https://127.0.0.1:54321'),
        () => net.connect({host:'127.0.0.1',port:54321}), () => tls.connect({host:'127.0.0.1',port:54321}),
        () => dns.lookup('localhost')]) assert.throws(invoke, blocked);
      assert.equal(tripwire.attempts, 6);
    } finally { tripwire.restore(); tripwire.restore(); }
    assert.equal(tripwire.attempts, 6);
    assert.equal(globalThis.fetch,original.fetch); assert.equal(http.get,original.httpGet); assert.equal(https.request,original.httpsRequest);
    assert.equal(net.Socket.prototype.connect,original.netConnect); assert.equal(tls.TLSSocket.prototype.connect,original.tlsConnect);
    assert.deepEqual(Object.getOwnPropertyDescriptor(tls.TLSSocket.prototype,'connect'),original.tlsDescriptor);
    console.log('network tripwires passed');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    cwd: directory, env: createRehearsalWorkerEnvironment(process.env), encoding: "utf8", timeout: 15000,
  });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "network tripwires passed");
});

for (const args of [["--database", database], ["--url", "https://api-m.paypal.com"], ["--output"],
  ["--output", output, "--output", output], ["--unknown-" + marker]]) {
  test(`unsupported CLI option shape ${args[0]} fails before creating a report`, () => {
    const before = readdirSync(output).sort();
    const result = launch(args); assert.notEqual(result.status, 0);
    const summary = JSON.parse(result.stdout); assert.equal(summary.status, "failed");
    assert.equal(summary.schemaVersion, "judge-rehearsal-run-v1"); assert.equal(typeof summary.code, "string");
    safeText(result.stdout); safeText(result.stderr); assert.doesNotMatch(result.stderr, /\n\s+at\s/u);
    assert.deepEqual(readdirSync(output).sort(), before); assert.deepEqual(readFileSync(database), initialDatabase);
  });
}

test("help does not create output or run the fixture", () => {
  const before = readdirSync(directory).sort(), result = launch(["--help"]);
  assert.equal(result.status, 0); assert.match(result.stdout, /--output/u);
  assert.deepEqual(readdirSync(directory).sort(), before);
});

test("the launcher rejects malformed worker failure output instead of reflecting private diagnostics", () => {
  const destination = join(directory, "worker-output-validation");
  const code = `
    import assert from 'node:assert/strict';
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    import { EventEmitter } from 'node:events'; import { PassThrough } from 'node:stream';
    const require = createRequire(import.meta.url), childProcess = require('node:child_process');
    const originalSpawn = childProcess.spawn, originalWrite = process.stdout.write;
    const marker = ${JSON.stringify(marker)};
    let candidate;
    childProcess.spawn = () => {
      const worker = new EventEmitter(); worker.stdout = new PassThrough(); worker.stderr = new PassThrough(); worker.kill = () => true;
      queueMicrotask(() => { worker.stdout.write(JSON.stringify(candidate)); worker.stdout.end(); worker.emit('close',1); });
      return worker;
    };
    syncBuiltinESMExports();
    try {
      const { main } = await import(${JSON.stringify(new URL("./judge-rehearsal.mjs", import.meta.url).href)});
      const valid = {schemaVersion:'judge-rehearsal-run-v1',status:'failed',code:'rehearsal_failed',phase:'report'};
      for (const bad of [{...valid,privateDiagnostic:marker},{...valid,code:marker},{...valid,phase:marker},
        {...valid,failurePath:'/tmp/'+marker+'/failure.json'}]) {
        candidate = bad; const output = [];
        process.stdout.write = value => { output.push(String(value)); return true; };
        const status = await main(['--output',${JSON.stringify(destination)}],{});
        process.stdout.write = originalWrite;
        assert.equal(status,1); assert.equal(output.join('').includes(marker),false);
        assert.deepEqual(JSON.parse(output.join('')),{schemaVersion:'judge-rehearsal-run-v1',status:'failed',phase:'worker',code:'worker_failed'});
      }
    } finally { process.stdout.write = originalWrite; childProcess.spawn = originalSpawn; syncBuiltinESMExports(); }
    console.log('worker result privacy passed');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    cwd: directory, env: createRehearsalWorkerEnvironment(process.env), encoding: "utf8", timeout: 15000,
  });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "worker result privacy passed"); safeText(result.stderr);
});

test("existing files and symlinked output directories are refused without following or overwriting them", () => {
  const target = join(directory, "symlink-target"), link = join(directory, "output-link");
  mkdirSync(target); writeFileSync(join(target, "sentinel"), "untouched"); symlinkSync(target, link, "dir");
  for (const path of [database, link, join(link, "nested")]) {
    const result = launch(["--output", path]); assert.notEqual(result.status, 0);
    const summary = JSON.parse(result.stdout); assert.equal(summary.status, "failed");
    safeText(result.stdout); safeText(result.stderr);
    assert.deepEqual(readFileSync(database), initialDatabase);
    assert.deepEqual(readdirSync(target), ["sentinel"]); assert.equal(readFileSync(join(target, "sentinel"), "utf8"), "untouched");
  }
});

test("a failed second artifact removes only the new partial output and preserves the existing collision", () => {
  const destination = join(directory, "partial-output"); mkdirSync(destination);
  const preserved = "Existing report content " + marker;
  writeFileSync(join(destination, "report.html"), preserved);
  const result = spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", "--experimental-loader",
    join(root, "scripts/consent-ts-test-loader.mjs"), join(root, "scripts/judge-rehearsal-worker.mjs"), destination], {
    cwd: directory, env: createRehearsalWorkerEnvironment(poisoned), encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.error, undefined); assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, "failed"); assert.equal(summary.code, "output_unavailable"); assert.equal(summary.phase, "report");
  assert.equal(summary.failurePath, join(destination, "failure.json"));
  assert.deepEqual(readdirSync(destination).sort(), ["failure.json", "report.html"]);
  assert.equal(readFileSync(join(destination, "report.html"), "utf8"), preserved);
  const failure = readFileSync(summary.failurePath, "utf8");
  safeText(failure); safeText(result.stdout); safeText(result.stderr);
  assert.equal(JSON.parse(failure).code, "output_unavailable");
  assert.deepEqual(readFileSync(database), initialDatabase);
});
