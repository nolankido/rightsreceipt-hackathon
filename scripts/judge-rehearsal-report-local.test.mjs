import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  JUDGE_REHEARSAL_TABLES, JUDGE_STEP_CATALOG, judgeScenarioOutcomeSha256,
  projectJudgeRehearsalReport, renderJudgeRehearsalReport, serializeJudgeRehearsalReport,
} from "./support/judge-rehearsal-report.mjs";

const rows = () => Object.fromEntries(JUDGE_REHEARSAL_TABLES.map(name => [name, ["assets", "creator_workspaces", "pricing_policy_versions", "demo_reset_epochs"].includes(name) ? 1 : 0]));
const recoverySteps = ["recovery_review", "delivery_recovered", "recovery_replay"];
function scenario(id) {
  const label = { ordinary: "Ordinary licensing journey", recovery: "Invoice delivery recovery", repeat: "Repeated ordinary journey" }[id];
  let creates = 0, sends = 0, gets = 0, payment = 0, permission = 0, receipt = 0;
  const steps = Object.entries(JUDGE_STEP_CATALOG).filter(([key]) => id === "recovery" || !recoverySteps.includes(key)).map(([key, item]) => {
    if (key === "draft_created") creates = 1;
    if (key === "invoice_sent") { sends = 1; gets = id === "recovery" ? 1 : 2; }
    if (key === "delivery_recovered") gets = 2;
    if (key === "financial_reconciliation") { payment = 1; permission = 1; gets = 3; }
    if (key === "receipt_issued") receipt = 1;
    return {
      id: key, title: item.title, actor: item.actor, operation: item.operation, httpStatus: item.httpStatus,
      outcome: key === "invoice_sent" && id === "recovery" ? "awaiting_reconciliation" : item.outcomes[0],
      evidence: { providerCreates: creates, providerSends: sends, providerReads: gets,
        paymentEvidenceRows: payment, permissionRows: permission, receiptRows: receipt },
    };
  });
  return {
    id, label, status: "passed", steps, summary: {
      quoteCents: 42500, currency: "USD", providerCalls: { oauth: 3, create: 1, send: 1, get: 3 },
      durableRows: { licensing_cases: 1, request_submissions: 1, clarification_submissions: 1, clarification_reviews: 1,
        terms_versions: 1, quotes: 1, creator_decisions: 1, buyer_acceptances: 1, invoice_bindings: 1,
        payment_operations: 2, payment_evidence: 1, permissions: 1, receipt_revisions: 1 },
      permissionState: "scheduled", receiptIntegrity: "verified", receiptRevision: 1, foreignKeys: "ok", integrity: "ok",
    },
  };
}
function fixture() {
  const scenarios = ["ordinary", "recovery", "repeat"].map(scenario);
  return {
    schemaVersion: "judge-rehearsal-v1", mode: "local_injected", status: "passed", runtime: "v22.18.0",
    generatedAt: "2026-10-28T07:00:00.000Z", sourceRevision: "a".repeat(40), sourceFingerprint: "b".repeat(64),
    sourceClean: false, scenarioClock: "2026-10-27T19:00:00.000Z",
    baseline: { hash: "c".repeat(64), migrationCount: 9, domainTableCount: 33, rows: rows() }, scenarios,
    resets: scenarios.map(item => ({
      afterScenario: item.id, baselineMatches: true, transactionsCleared: true, oldCapabilityDenied: true,
      oldReceiptDenied: true, oldCreatorCaseDenied: true,
      rowsBefore: { ...rows(), ...item.summary.durableRows, quote_lines: 5, audit_events: 20 }, rowsAfter: rows(),
    })),
    repeatability: { ordinaryMatchesRepeat: true, normalizedOutcomeSha256: judgeScenarioOutcomeSha256(scenarios[0]) },
    isolation: { database: "memory", externalRequests: 0, credentialsUsed: false },
  };
}
function step(report, id, scenarioIndex = 0) { return report.scenarios[scenarioIndex].steps.find(item => item.id === id); }

test("public projection keeps only the fixed safe evidence schema and detaches caller references", () => {
  const input = fixture(), result = projectJudgeRehearsalReport(input);
  assert.deepEqual(result, input);
  input.scenarios[0].summary.providerCalls.create = 9;
  input.baseline.rows.assets = 9;
  assert.equal(result.scenarios[0].summary.providerCalls.create, 1);
  assert.equal(result.baseline.rows.assets, 1);
  assert.equal(result.scenarios[0].steps.length, 17);
  assert.equal(result.scenarios[1].steps.length, 20);
  const serialized = serializeJudgeRehearsalReport(result);
  assert.ok(serialized.endsWith("\n"));
  assert.deepEqual(JSON.parse(serialized), result);
});

test("repeat identity is excluded from the stable semantic outcome", () => {
  const input = fixture();
  assert.equal(judgeScenarioOutcomeSha256(input.scenarios[0]), judgeScenarioOutcomeSha256(input.scenarios[2]));
  assert.notEqual(judgeScenarioOutcomeSha256(input.scenarios[0]), judgeScenarioOutcomeSha256(input.scenarios[1]));
});

for (const [name, mutate] of [
  ["unknown top-level token", input => { input.token = "PRIVATE_TOKEN"; }],
  ["unknown summary payload", input => { input.scenarios[0].summary.providerPayload = "PRIVATE_BODY"; }],
  ["unknown trace evidence", input => { step(input, "private_link").evidence.rawRequest = "PRIVATE_REQUEST"; }],
  ["private record identifier", input => { step(input, "private_link").caseId = "PRIVATE_CASE"; }],
  ["arbitrary title text", input => { step(input, "private_link").title = "PRIVATE_REQUEST"; }],
  ["arbitrary actor identity", input => { step(input, "private_link").actor = "person@example.test"; }],
  ["concrete capability path", input => { step(input, "private_link").operation = "GET /buyer/PRIVATE_TOKEN"; }],
  ["unsupported lifecycle assertion", input => { input.scenarios[0].summary.permissionState = "active"; }],
  ["unverified receipt", input => { input.scenarios[0].summary.receiptIntegrity = "unverified"; }],
  ["wrong quote", input => { input.scenarios[0].summary.quoteCents = 1; }],
  ["duplicate create", input => { input.scenarios[0].summary.providerCalls.create = 2; }],
  ["duplicate send", input => { input.scenarios[1].summary.providerCalls.send = 2; }],
  ["authority from provider status alone", input => { step(input, "provider_paid").evidence.paymentEvidenceRows = 1; }],
  ["early receipt issuance", input => { step(input, "financial_reconciliation").evidence.receiptRows = 1; }],
  ["counter rollback", input => { step(input, "completed_recovery").evidence.providerReads = 1; }],
  ["unreported provider read", input => { input.scenarios[0].summary.providerCalls.get = 4; }],
  ["ordinary send uncertainty", input => { step(input, "invoice_sent").outcome = "awaiting_reconciliation"; }],
  ["recovery send represented as ordinary success", input => { step(input, "invoice_sent", 1).outcome = "delivery_observed"; }],
  ["fabricated successful stale replay", input => { step(input, "recovery_replay", 1).httpStatus = 200; }],
  ["missing required step", input => { input.scenarios[0].steps.splice(2, 1); }],
  ["reordered trace", input => { input.scenarios[0].steps.reverse(); }],
  ["wrong scenario order", input => { input.scenarios.reverse(); }],
  ["missing final reset", input => { input.resets.pop(); }],
  ["reset still allows previous capability", input => { input.resets[0].oldCapabilityDenied = false; }],
  ["reset still allows previous receipt", input => { input.resets[1].oldReceiptDenied = false; }],
  ["reset still allows previous case", input => { input.resets[2].oldCreatorCaseDenied = false; }],
  ["transaction survives reset", input => { input.resets[0].rowsAfter.licensing_cases = 1; }],
  ["baseline contains a manufactured transaction", input => { input.baseline.rows.payment_evidence = 1; }],
  ["wrong baseline asset count", input => { input.baseline.rows.assets = 2; }],
  ["missing reset epoch", input => { input.baseline.rows.demo_reset_epochs = 0; }],
  ["reset source disagrees with completed run", input => { input.resets[0].rowsBefore.permissions = 9; }],
  ["missing domain table", input => { delete input.baseline.rows.assets; }],
  ["unexpected domain table", input => { input.baseline.rows.private_customer_data = 1; }],
  ["fractional count", input => { input.scenarios[0].summary.providerCalls.oauth = 1.5; }],
  ["negative count", input => { input.scenarios[0].summary.providerCalls.oauth = -1; }],
  ["unbounded count", input => { input.scenarios[0].summary.providerCalls.oauth = Number.MAX_SAFE_INTEGER; }],
  ["mismatching repeat", input => { input.scenarios[2].summary.providerCalls.oauth = 4; }],
  ["false repeat flag", input => { input.repeatability.ordinaryMatchesRepeat = false; }],
  ["wrong repeat digest", input => { input.repeatability.normalizedOutcomeSha256 = "0".repeat(64); }],
  ["external network call", input => { input.isolation.externalRequests = 1; }],
  ["actual credentials", input => { input.isolation.credentialsUsed = true; }],
  ["persistent database", input => { input.isolation.database = "production"; }],
  ["wrong mode", input => { input.mode = "live"; }],
  ["wrong status", input => { input.status = "failed"; }],
  ["invalid generated date", input => { input.generatedAt = "2026-02-30T00:00:00.000Z"; }],
  ["noncanonical virtual date", input => { input.scenarioClock = "2026-10-27"; }],
  ["unbounded runtime identity", input => { input.runtime = "<script>alert('PRIVATE')</script>"; }],
  ["bad source fingerprint", input => { input.sourceFingerprint = "PRIVATE_PATH"; }],
  ["bad source revision", input => { input.sourceRevision = "PRIVATE_PATH"; }],
  ["invalid cleanliness", input => { input.sourceClean = "yes"; }],
]) test("report rejects " + name + " without reflecting input", () => {
  const input = fixture(); mutate(input);
  for (const operation of [projectJudgeRehearsalReport, serializeJudgeRehearsalReport, renderJudgeRehearsalReport])
    assert.throws(() => operation(input), error => error instanceof TypeError && error.message === "Invalid judge rehearsal report.");
});

test("report uses a script-free offline document with a matching stylesheet integrity policy", () => {
  const html = renderJudgeRehearsalReport(fixture());
  assert.match(html, /^<!doctype html>/u);
  assert.match(html, /<html lang="en">/u);
  assert.equal((html.match(/<h1 /gu) ?? []).length, 1);
  assert.ok(!/<script|<iframe|<form|<img|<link|onload=|onclick=|@import|url\(/iu.test(html));
  assert.ok(!/https?:\/\//u.test(html));
  assert.match(html, /default-src 'none'; script-src 'none'; style-src 'sha256-/u);
  const css = html.match(/<style>([\s\S]+?)<\/style>/u)?.[1];
  const digest = html.match(/style-src 'sha256-([^']+)'/u)?.[1];
  assert.equal(createHash("sha256").update(css).digest("base64"), digest);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/gu)].map(match => match[1]),
    ["#journeys", "#reset", "#scope", "evidence.json"]);
  assert.ok(html.endsWith("\n"));
});

test("report makes simulation, authority boundaries and scheduled outcome explicit", () => {
  const html = renderJudgeRehearsalReport(fixture());
  for (const label of ["Local simulation", "Injected sessions and provider replies", "Scripted creator", "Scripted buyer",
    "Release gates remain open", "Scheduled permission", "Canonical reconciliation consumer", "Status label only",
    "Stale retry rejected", "Includes local changes", "Virtual scenario clock", "disposable in-memory database",
    "Managed creator-session revocation remains outside the reset evidence"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("License activated"));
  assert.ok(!html.includes("Live payment verified"));
  assert.ok(!html.includes("undefined"));
});

test("unknown Git metadata remains explicit while actual source fingerprint stays available", () => {
  const input = fixture(); input.sourceRevision = null; input.sourceClean = null;
  const html = renderJudgeRehearsalReport(input);
  assert.ok(html.includes("Git revision unavailable"));
  assert.ok(html.includes("Working tree status unavailable"));
  assert.ok(html.includes(input.sourceFingerprint));
});

test("clean source attribution is distinct from a rehearsal with local changes", () => {
  const input = fixture(); input.sourceClean = true;
  const html = renderJudgeRehearsalReport(input);
  assert.ok(html.includes("Clean working tree at execution"));
  assert.ok(!html.includes("Includes local changes"));
});
