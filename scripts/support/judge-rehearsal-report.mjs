/** Fixed public evidence vocabulary for the local judge rehearsal. */
import { createHash } from "node:crypto";

export const JUDGE_STEP_CATALOG = Object.freeze(Object.fromEntries([
  ["baseline", "Start from the seeded asset and policy", "Local harness", "SQLite seed verification", null, ["seed_only"]],
  ["creator_asset_review", "Review the asset as the creator", "Scripted creator", "GET /api/intake/creator/assets/:assetId/review", 200, ["reviewed"]],
  ["private_link", "Issue a private request link", "Scripted creator", "POST /api/intake/creator/assets/:assetId/links", 200, ["issued"]],
  ["buyer_request", "Submit the original intended use", "Scripted buyer", "POST /api/intake/buyer/request", 200, ["submitted"]],
  ["buyer_answers", "Answer the missing rights questions", "Scripted buyer", "POST /api/clarification/buyer/answers", 200, ["recorded"]],
  ["creator_terms", "Review all twelve rights and calculate the quote", "Scripted creator", "POST /api/clarification/creator/cases/:caseId/terms", 200, ["complete"]],
  ["creator_approval", "Approve the exact rights and price", "Scripted creator", "POST /api/consent/creator/cases/:caseId/decision", 200, ["recorded"]],
  ["buyer_acceptance", "Accept the exact approved offer", "Scripted buyer", "POST /api/consent/buyer/accept", 200, ["recorded"]],
  ["draft_created", "Create one accepted invoice draft", "Scripted creator", "POST /api/invoices/creator/cases/:caseId/create", 200, ["draft_bound"]],
  ["invoice_sent", "Send the accepted invoice", "Scripted creator", "POST /api/invoices/creator/cases/:caseId/send", 200, ["delivery_observed", "awaiting_reconciliation"]],
  ["recovery_review", "Review the unfinished send attempt", "Scripted creator", "GET /api/invoices/creator/cases/:caseId/recovery", 200, ["delivery_unresolved"]],
  ["delivery_recovered", "Check and record the existing invoice delivery", "Scripted creator", "POST /api/invoices/creator/cases/:caseId/recover", 200, ["delivery_observed"]],
  ["recovery_replay", "Reject the stale completed recovery command", "Scripted creator", "POST /api/invoices/creator/cases/:caseId/recover", 409, ["stale_revision"]],
  ["provider_paid", "Simulate payment without granting authority", "Provider fixture", "Injected provider state", null, ["paid_label_only"]],
  ["financial_reconciliation", "Verify financial evidence through reconciliation", "Application service", "Canonical reconciliation consumer", null, ["applied"]],
  ["receipt_issued", "Issue the canonical rights receipt", "Application service", "Canonical receipt issuer", null, ["issued"]],
  ["receipt_export", "Verify the protected canonical receipt export", "Scripted buyer", "GET /api/receipts/buyer?format=json", 200, ["verified"]],
  ["public_verification", "Verify the minimized public receipt", "Public reader", "GET /api/receipt-verification/:publicId", 200, ["verified"]],
  ["original_link_continuation", "Resume the receipt from the original private link", "Scripted buyer", "GET /api/intake/buyer/review", 200, ["receipt_available"]],
  ["completed_recovery", "Confirm no unfinished recovery remains", "Scripted creator", "GET /api/invoices/creator/cases/:caseId/recovery", 200, ["complete"]],
].map(([id, title, actor, operation, httpStatus, outcomes]) => [id, Object.freeze({
  title, actor, operation, httpStatus, outcomes: Object.freeze(outcomes),
})])));

export const JUDGE_REHEARSAL_TABLES = Object.freeze([
  "assets", "audit_events", "buyer_acceptances", "buyer_capabilities", "clarification_answers",
  "clarification_questions", "clarification_rounds", "clarification_submissions", "clarification_reviews",
  "creator_decisions", "creator_workspaces", "demo_reset_epochs", "extraction_attempts", "field_observations",
  "invoice_bindings", "licensing_cases", "payment_evidence", "payment_operations", "paypal_delivery_journal",
  "paypal_webhook_projections", "paypal_webhook_processing_receipts", "paypal_reconciliation_outbox",
  "paypal_reconciliation_receipts", "paypal_lifecycle_observations", "permissions", "pricing_policy_versions",
  "quote_lines", "quotes", "receipt_revisions", "request_submissions", "terms_versions", "verification_records",
  "webhook_inbox_events",
]);
const SUMMARY_TABLES = Object.freeze([
  "licensing_cases", "request_submissions", "clarification_submissions", "clarification_reviews", "terms_versions",
  "quotes", "creator_decisions", "buyer_acceptances", "invoice_bindings", "payment_operations", "payment_evidence",
  "permissions", "receipt_revisions",
]);
const EVIDENCE_KEYS = Object.freeze([
  "providerCreates", "providerSends", "providerReads", "paymentEvidenceRows", "permissionRows", "receiptRows",
]);
const SCENARIOS = Object.freeze({
  ordinary: "Ordinary licensing journey",
  recovery: "Invoice delivery recovery",
  repeat: "Repeated ordinary journey",
});
const SCENARIO_IDS = Object.freeze(Object.keys(SCENARIOS));
const RECOVERY_STEPS = Object.freeze(["recovery_review", "delivery_recovered", "recovery_replay"]);
const SEED_TABLES = Object.freeze(["assets", "creator_workspaces", "pricing_policy_versions", "demo_reset_epochs"]);
const HASH = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const BASE_KEYS = Object.freeze([
  "schemaVersion", "mode", "status", "runtime", "generatedAt", "sourceRevision", "sourceFingerprint",
  "sourceClean", "scenarioClock", "baseline", "scenarios", "resets", "repeatability", "isolation",
]);

function invalid() { throw new TypeError("Invalid judge rehearsal report."); }
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).sort().join() !== [...keys].sort().join()) invalid();
  return value;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) invalid();
  return value;
}
function counts(value, keys) {
  exact(value, keys);
  return Object.fromEntries(keys.map(key => [key, count(value[key])]));
}
function iso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)) invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalid();
  return value;
}
function flag(value) { if (value !== true) invalid(); return true; }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function totalTransactions(rows) {
  return JUDGE_REHEARSAL_TABLES.filter(table => !SEED_TABLES.includes(table)).reduce((total, table) => total + rows[table], 0);
}

function projectScenario(raw) {
  exact(raw, ["id", "label", "status", "steps", "summary"]);
  if (!SCENARIO_IDS.includes(raw.id) || raw.label !== SCENARIOS[raw.id] || raw.status !== "passed") invalid();
  const order = Object.keys(JUDGE_STEP_CATALOG).filter(id => raw.id === "recovery" || !RECOVERY_STEPS.includes(id));
  if (!Array.isArray(raw.steps) || raw.steps.length !== order.length) invalid();
  let previous = Object.fromEntries(EVIDENCE_KEYS.map(key => [key, 0]));
  const steps = raw.steps.map((step, index) => {
    exact(step, ["id", "title", "actor", "operation", "httpStatus", "outcome", "evidence"]);
    const definition = JUDGE_STEP_CATALOG[order[index]];
    if (step.id !== order[index] || step.title !== definition.title || step.actor !== definition.actor
      || step.operation !== definition.operation || step.httpStatus !== definition.httpStatus
      || !definition.outcomes.includes(step.outcome)) invalid();
    const evidence = counts(step.evidence, EVIDENCE_KEYS);
    if (EVIDENCE_KEYS.some(key => evidence[key] < previous[key]) || evidence.providerCreates > 1 || evidence.providerSends > 1) invalid();
    if (index < order.indexOf("financial_reconciliation")
      && (evidence.paymentEvidenceRows !== 0 || evidence.permissionRows !== 0 || evidence.receiptRows !== 0)) invalid();
    if (index < order.indexOf("receipt_issued") && evidence.receiptRows !== 0) invalid();
    if (step.id === "baseline" && EVIDENCE_KEYS.some(key => evidence[key] !== 0)) invalid();
    if (step.id === "invoice_sent" && step.outcome !== (raw.id === "recovery" ? "awaiting_reconciliation" : "delivery_observed")) invalid();
    if (RECOVERY_STEPS.includes(step.id) && (evidence.providerCreates !== 1 || evidence.providerSends !== 1)) invalid();
    previous = evidence;
    return {
      id: step.id, title: definition.title, actor: definition.actor, operation: definition.operation,
      httpStatus: definition.httpStatus, outcome: step.outcome, evidence,
    };
  });
  const input = exact(raw.summary, [
    "quoteCents", "currency", "providerCalls", "durableRows", "permissionState", "receiptIntegrity",
    "receiptRevision", "foreignKeys", "integrity",
  ]);
  if (input.quoteCents !== 42500 || input.currency !== "USD" || input.permissionState !== "scheduled"
    || input.receiptIntegrity !== "verified" || input.receiptRevision !== 1 || input.foreignKeys !== "ok" || input.integrity !== "ok") invalid();
  const providerCalls = counts(input.providerCalls, ["oauth", "create", "send", "get"]);
  const durableRows = counts(input.durableRows, SUMMARY_TABLES);
  if (providerCalls.create !== 1 || providerCalls.send !== 1
    || providerCalls.create !== previous.providerCreates || providerCalls.send !== previous.providerSends
    || providerCalls.get !== previous.providerReads
    || durableRows.payment_evidence !== previous.paymentEvidenceRows || durableRows.permissions !== previous.permissionRows
    || durableRows.receipt_revisions !== previous.receiptRows
    || SUMMARY_TABLES.some(table => durableRows[table] !== (table === "payment_operations" ? 2 : 1))) invalid();
  return {
    id: raw.id, label: SCENARIOS[raw.id], status: "passed", steps,
    summary: {
      quoteCents: 42500, currency: "USD", providerCalls, durableRows, permissionState: "scheduled",
      receiptIntegrity: "verified", receiptRevision: 1, foreignKeys: "ok", integrity: "ok",
    },
  };
}

/** Stable semantic outcome excludes the run name and all private runtime identities. */
export function judgeScenarioOutcomeSha256(scenario) {
  const value = projectScenario(scenario);
  return createHash("sha256").update(JSON.stringify({ steps: value.steps, summary: value.summary })).digest("hex");
}

/** Closed public projection. Unknown fields and contradictory success claims fail before serialization. */
export function projectJudgeRehearsalReport(raw) {
  exact(raw, BASE_KEYS);
  if (raw.schemaVersion !== "judge-rehearsal-v1" || raw.mode !== "local_injected" || raw.status !== "passed"
    || typeof raw.runtime !== "string" || !/^v\d+\.\d+\.\d+$/u.test(raw.runtime)
    || (raw.sourceRevision !== null && (typeof raw.sourceRevision !== "string" || !REVISION.test(raw.sourceRevision)))
    || typeof raw.sourceFingerprint !== "string" || !HASH.test(raw.sourceFingerprint)
    || ![true, false, null].includes(raw.sourceClean)) invalid();
  const baseline = exact(raw.baseline, ["hash", "migrationCount", "domainTableCount", "rows"]);
  if (typeof baseline.hash !== "string" || !HASH.test(baseline.hash)
    || baseline.migrationCount !== 9 || baseline.domainTableCount !== 33) invalid();
  const baselineRows = counts(baseline.rows, JUDGE_REHEARSAL_TABLES);
  if (totalTransactions(baselineRows) !== 0 || SEED_TABLES.some(key => baselineRows[key] !== 1)) invalid();
  if (!Array.isArray(raw.scenarios) || raw.scenarios.length !== 3) invalid();
  const scenarios = raw.scenarios.map(projectScenario);
  if (scenarios.some((scenario, index) => scenario.id !== SCENARIO_IDS[index])) invalid();
  if (!Array.isArray(raw.resets) || raw.resets.length !== 3) invalid();
  const resets = raw.resets.map((reset, index) => {
    exact(reset, [
      "afterScenario", "baselineMatches", "transactionsCleared", "oldCapabilityDenied", "oldReceiptDenied",
      "oldCreatorCaseDenied", "rowsBefore", "rowsAfter",
    ]);
    if (reset.afterScenario !== SCENARIO_IDS[index]) invalid();
    const rowsBefore = counts(reset.rowsBefore, JUDGE_REHEARSAL_TABLES);
    const rowsAfter = counts(reset.rowsAfter, JUDGE_REHEARSAL_TABLES);
    if (!same(rowsAfter, baselineRows) || totalTransactions(rowsAfter) !== 0
      || SUMMARY_TABLES.some(table => rowsBefore[table] !== scenarios[index].summary.durableRows[table])) invalid();
    return {
      afterScenario: reset.afterScenario, baselineMatches: flag(reset.baselineMatches),
      transactionsCleared: flag(reset.transactionsCleared), oldCapabilityDenied: flag(reset.oldCapabilityDenied),
      oldReceiptDenied: flag(reset.oldReceiptDenied), oldCreatorCaseDenied: flag(reset.oldCreatorCaseDenied),
      rowsBefore, rowsAfter,
    };
  });
  const repeatability = exact(raw.repeatability, ["ordinaryMatchesRepeat", "normalizedOutcomeSha256"]);
  const ordinaryHash = judgeScenarioOutcomeSha256(scenarios[0]);
  if (repeatability.normalizedOutcomeSha256 !== ordinaryHash
    || ordinaryHash !== judgeScenarioOutcomeSha256(scenarios[2])) invalid();
  const isolation = exact(raw.isolation, ["database", "externalRequests", "credentialsUsed"]);
  if (isolation.database !== "memory" || isolation.externalRequests !== 0 || isolation.credentialsUsed !== false) invalid();
  return {
    schemaVersion: "judge-rehearsal-v1", mode: "local_injected", status: "passed", runtime: raw.runtime,
    generatedAt: iso(raw.generatedAt), sourceRevision: raw.sourceRevision, sourceFingerprint: raw.sourceFingerprint,
    sourceClean: raw.sourceClean, scenarioClock: iso(raw.scenarioClock),
    baseline: { hash: baseline.hash, migrationCount: 9, domainTableCount: 33, rows: baselineRows },
    scenarios, resets,
    repeatability: { ordinaryMatchesRepeat: flag(repeatability.ordinaryMatchesRepeat), normalizedOutcomeSha256: ordinaryHash },
    isolation: { database: "memory", externalRequests: 0, credentialsUsed: false },
  };
}

export function serializeJudgeRehearsalReport(raw) {
  return JSON.stringify(projectJudgeRehearsalReport(raw), null, 2) + "\n";
}

const REPORT_CSS = `
:root{color-scheme:light;--ink:#172c33;--muted:#52676b;--line:#d7e2df;--paper:#f4f7f5;--white:#fff;--teal:#096960;--pale:#e7f3ed;--amber:#8c4d10;--amber-pale:#fff2df;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}body{margin:0}a{color:var(--teal);text-decoration-thickness:1px;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #bc641d;outline-offset:5px}main{max-width:1180px;margin:0 auto;padding:40px 28px 64px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:750;margin:0 0 14px}.topline{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:26px}.topline p{margin:0}.topline nav{display:flex;gap:20px;flex-wrap:wrap;font-size:.9rem}.hero{background:var(--ink);color:#fff;border-radius:20px;padding:38px;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(230px,1fr);gap:38px;align-items:start}.hero .eyebrow{color:#b6dfca}h1{font-size:clamp(2.15rem,4.4vw,3.55rem);letter-spacing:-.045em;line-height:1.06;margin:0 0 20px;font-weight:760}.hero p{max-width:660px;margin:0;color:#d8e6e1}.hero .lead{font-size:1.08rem}.scope-card{border:1px solid #668078;border-radius:12px;padding:22px;background:#233e43}.scope-card h2{font-size:1rem;margin:14px 0 8px;color:white}.scope-card p{font-size:.92rem;line-height:1.6}.pill{display:inline-block;border-radius:999px;padding:5px 10px;font-size:.71rem;font-weight:750;letter-spacing:.035em;white-space:normal}.pill.light{color:#173d33;background:#cef0dc}.pill.pass{color:#095a40;background:var(--pale)}.pill.expected{color:var(--amber);background:var(--amber-pale)}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:20px 0 38px}.stat{border:1px solid var(--line);border-radius:12px;background:var(--white);padding:20px}.stat strong{display:block;font-size:1.95rem;line-height:1.18;letter-spacing:-.04em}.stat span{display:block;font-size:.84rem;color:var(--muted);margin-top:7px}.section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin:0 0 18px}.section-title h2{font-size:1.5rem;letter-spacing:-.025em;margin:0 0 6px}.section-title p{margin:0;color:var(--muted);max-width:760px}.section{margin-top:38px;scroll-margin-top:24px}.scenario-grid,.reset-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.scenario,.reset-card{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:22px;min-width:0}.scenario.recovery{border-top:4px solid #b56b29;padding-top:19px}.run-id{font-size:.74rem;color:var(--muted);font-weight:700;letter-spacing:.05em;margin:0 0 12px}.scenario h3,.reset-card h3{font-size:1.1rem;line-height:1.32;letter-spacing:-.02em;margin:10px 0 16px}.writes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.writes div{background:var(--paper);border-radius:8px;padding:12px}.writes strong{font-size:1.4rem;display:block;line-height:1.15}.writes span{font-size:.74rem;color:var(--muted)}.scenario p.result{font-size:.88rem;color:var(--muted);margin:16px 0 0}.scenario .result strong{color:var(--ink)}.quiet{font-size:.83rem;color:var(--muted)}.proof-banner{display:flex;gap:16px;align-items:flex-start;background:var(--pale);border:1px solid #b7d8c5;border-radius:10px;padding:18px 20px;margin-top:18px}.proof-banner p{margin:0;font-size:.91rem}.proof-mark{font-size:1.15rem;color:#0b6f4c;font-weight:800}.traces{display:grid;gap:12px;margin-top:22px}details.trace-detail,details.table-detail{border:1px solid var(--line);border-radius:12px;background:var(--white);overflow:hidden}summary{cursor:pointer;padding:18px 22px;font-weight:680;min-height:56px}summary .quiet{font-weight:400;margin-left:12px}details[open]>summary{border-bottom:1px solid var(--line)}.trace{list-style:none;margin:0;padding:10px 22px 16px;counter-reset:step}.trace li{counter-increment:step;display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;padding:18px 0;border-bottom:1px solid #e8eeeb}.trace li:last-child{border-bottom:0}.trace li::before{content:counter(step,decimal-leading-zero);height:30px;width:30px;border-radius:50%;background:var(--pale);color:var(--teal);font-size:.7rem;font-weight:750;display:flex;align-items:center;justify-content:center;margin-top:2px}.step-heading{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.step-heading h4{font-size:.95rem;margin:0;line-height:1.4}.actor{font-size:.76rem;color:var(--muted);margin:4px 0 9px}.operation{font-size:.76rem;color:#35545a;margin:0;overflow-wrap:anywhere;word-break:break-word}.operation code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.evidence{display:flex;gap:12px;flex-wrap:wrap;font-size:.73rem;color:var(--muted);margin:9px 0 0}.reset-card .amount{font-size:1.7rem;line-height:1.2;font-weight:750;letter-spacing:-.035em;margin:0 0 5px}.reset-card .amount span{font-weight:400;color:var(--muted);font-size:1rem;padding:0 6px}.checks{padding:0;margin:16px 0 0;list-style:none}.checks li{padding:5px 0 5px 22px;font-size:.82rem;position:relative}.checks li::before{content:"✓";position:absolute;left:0;color:var(--teal);font-weight:750}.table-detail{margin-top:18px}.table-wrap{padding:0 18px 18px}table{width:100%;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:.78rem}th,td{border-bottom:1px solid var(--line);padding:10px 8px;overflow-wrap:anywhere;vertical-align:top}th:first-child{width:48%}thead th{color:var(--muted);font-size:.7rem;font-weight:750}tbody th{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.7rem;font-weight:450}tbody td{font-variant-numeric:tabular-nums}.scope-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px}.scope-block{background:var(--white);border:1px solid var(--line);padding:24px;border-radius:12px}.scope-block h3{font-size:1rem;margin:0 0 12px}.scope-block p{font-size:.9rem;color:var(--muted);margin:0}.scope-block ul{padding-left:20px;margin:12px 0 0;font-size:.88rem;color:var(--muted)}.scope-block li{margin:8px 0}.scope-block.pending{border-color:#e1ccb0;background:#fffaf2}.meta{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;margin:0}.meta>div{min-width:0}.meta dt{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:700}.meta dd{margin:6px 0 0;font-size:.85rem}.digest{display:block;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.72rem;line-height:1.6;word-break:break-all;overflow-wrap:anywhere}.source-note{display:inline-block;padding:4px 8px;border-radius:5px;font-size:.75rem;background:var(--amber-pale);color:var(--amber);margin-top:8px}.metadata{border-top:1px solid var(--line);padding-top:24px}.footer{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-top:28px;padding-top:22px;border-top:1px solid var(--line);font-size:.78rem;color:var(--muted)}.footer p{margin:0;max-width:760px}.footer a{white-space:nowrap}
@media(max-width:840px){main{padding:24px 20px 44px}.hero{padding:28px;grid-template-columns:1fr;gap:24px}.scope-card{max-width:none}.scenario-grid,.reset-grid{grid-template-columns:1fr}.scenario h3{margin-bottom:12px}.writes{max-width:360px}.scope-grid{grid-template-columns:1fr}.stats{gap:10px}.stat{padding:16px}.stat strong{font-size:1.65rem}}
@media(max-width:520px){main{padding:20px 14px 36px}.topline{margin-bottom:20px}.topline nav{gap:16px}.hero{padding:24px 20px;border-radius:14px}.hero .lead{font-size:1rem}.stats{grid-template-columns:1fr 1fr;margin-bottom:28px}.stat{padding:16px}.stat strong{font-size:1.65rem}.section{margin-top:30px}.scenario,.reset-card,.scope-block{padding:20px}.section-title h2{font-size:1.35rem}summary{padding:16px}.trace{padding:4px 14px 12px}.trace li{grid-template-columns:28px minmax(0,1fr);gap:8px}.trace li::before{width:26px;height:26px}.step-heading{gap:8px}.meta{grid-template-columns:1fr}.footer{display:block}.footer a{display:inline-block;margin-top:14px}.table-wrap{padding:0 8px 12px}th,td{padding:8px 4px}.proof-banner{padding:16px;gap:10px}}
@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}body{background:white;font-size:10pt}main{max-width:none;padding:0}.topline nav,.footer a{display:none}.hero{padding:24px;border-radius:8px;grid-template-columns:1.5fr 1fr;gap:24px}h1{font-size:30pt}.stats{margin:14px 0 24px}.stat{padding:12px}.stat strong{font-size:20pt}.scenario-grid,.reset-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.scenario,.reset-card{padding:14px}.section{margin-top:24px}.scope-grid{grid-template-columns:1fr 1fr}.scenario,.reset-card,.scope-block,.trace li{break-inside:avoid}details{overflow:visible!important}details>summary{display:none}details::details-content{display:block!important;content-visibility:visible!important}details:not([open])>*{display:block}.trace-detail{border:0!important;margin:0}.trace{padding:0;counter-reset:step}.traces{display:block}.trace li{padding:9px 0}.operation,.evidence{font-size:8pt}.metadata{break-inside:avoid}.meta{grid-template-columns:1fr 1fr}.footer{margin-top:16px}}
`.trim();

const OUTCOMES = Object.freeze({
  seed_only: "Seed baseline verified", reviewed: "Reviewed", issued: "Issued", submitted: "Submitted",
  recorded: "Recorded", complete: "Complete", draft_bound: "Draft recorded", delivery_observed: "Delivery recorded",
  awaiting_reconciliation: "Expected lost reply", delivery_unresolved: "Delivery unconfirmed",
  stale_revision: "Stale retry rejected", paid_label_only: "Status label only", applied: "Evidence applied",
  verified: "Verified", receipt_available: "Receipt available",
});
const NOTES = Object.freeze({
  ordinary: "The complete path records explicit consent before invoice dispatch, then verifies financial evidence before issuing the receipt.",
  recovery: "The provider commits the send, then its response is lost. Recovery retrieves the same invoice and rejects a stale replay.",
  repeat: "The ordinary journey runs again after reset. Its minimized outcomes match the first run exactly.",
});
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}
function clock(value) { return escapeHtml(value.replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC")); }
function scenarioCards(report) {
  return report.scenarios.map((scenario, index) => `<article class="scenario ${scenario.id === "recovery" ? "recovery" : ""}" aria-labelledby="scenario-${scenario.id}">
<p class="run-id">RUN ${String(index + 1).padStart(2, "0")} / ${scenario.steps.length} VERIFIED STEPS</p><span class="pill pass">Passed</span>
<h3 id="scenario-${scenario.id}">${escapeHtml(scenario.label)}</h3>
<p class="quiet">${NOTES[scenario.id]}</p><div class="writes"><div><strong>${scenario.summary.providerCalls.create}</strong><span>create POST</span></div><div><strong>${scenario.summary.providerCalls.send}</strong><span>send POST</span></div></div>
<p class="result"><strong>Scheduled permission</strong><br>Receipt revision ${scenario.summary.receiptRevision}, integrity verified.<br>${scenario.summary.providerCalls.get} provider reads; no duplicate create or send.</p></article>`).join("\n");
}
function traceDetails(report) {
  return report.scenarios.map(scenario => `<details class="trace-detail" id="trace-${scenario.id}"><summary>${escapeHtml(scenario.label)}<span class="quiet">${scenario.steps.length} recorded steps</span></summary><ol class="trace">${scenario.steps.map(step => {
    const expected = ["awaiting_reconciliation", "delivery_unresolved", "stale_revision", "paid_label_only"].includes(step.outcome);
    return `<li data-step="${step.id}"><div><div class="step-heading"><h4>${escapeHtml(step.title)}</h4><span class="pill ${expected ? "expected" : "pass"}">${OUTCOMES[step.outcome]}</span></div>
<p class="actor">${escapeHtml(step.actor)}${step.httpStatus === null ? "" : ` · HTTP ${step.httpStatus}`}</p>
<p class="operation"><code>${escapeHtml(step.operation)}</code></p><p class="evidence"><span>Provider writes: ${step.evidence.providerCreates} create / ${step.evidence.providerSends} send</span><span>Reads: ${step.evidence.providerReads}</span><span>Payment evidence: ${step.evidence.paymentEvidenceRows}</span><span>Permissions: ${step.evidence.permissionRows}</span><span>Receipts: ${step.evidence.receiptRows}</span></p></div></li>`;
  }).join("\n")}</ol></details>`).join("\n");
}
function resetCards(report) {
  return report.resets.map((reset, index) => `<article class="reset-card"><p class="run-id">RESET ${String(index + 1).padStart(2, "0")}</p><h3>After ${escapeHtml(SCENARIOS[reset.afterScenario].toLowerCase())}</h3>
<p class="amount">${totalTransactions(reset.rowsBefore)} <span>to</span> ${totalTransactions(reset.rowsAfter)}</p><p class="quiet">Transactional rows in the disposable database</p>
<ul class="checks"><li>Seed baseline matches</li><li>Earlier buyer capability denied</li><li>Earlier receipt denied</li><li>Earlier creator case denied</li></ul></article>`).join("\n");
}
function rowTable(report) {
  return `<details class="table-detail"><summary>Inspect all 33 domain table counts after each reset</summary><div class="table-wrap"><table><thead><tr><th scope="col">Domain table</th><th scope="col">Baseline</th><th scope="col">After 01</th><th scope="col">After 02</th><th scope="col">After 03</th></tr></thead><tbody>${JUDGE_REHEARSAL_TABLES.map(table => `<tr><th scope="row">${escapeHtml(table)}</th><td>${report.baseline.rows[table]}</td>${report.resets.map(reset => `<td>${reset.rowsAfter[table]}</td>`).join("")}</tr>`).join("\n")}</tbody></table></div></details>`;
}

/** No script, external asset, account access or live action exists in this offline report. */
export function renderJudgeRehearsalReport(raw) {
  const report = projectJudgeRehearsalReport(raw);
  const styleHash = createHash("sha256").update(REPORT_CSS).digest("base64");
  const steps = report.scenarios.reduce((total, scenario) => total + scenario.steps.length, 0);
  const sourceNote = report.sourceClean === false ? "Includes local changes" : report.sourceClean === true ? "Clean working tree at execution" : "Working tree status unavailable";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'sha256-${styleHash}'; base-uri 'none'; form-action 'none'">
<title>Local judge rehearsal | RightsReceipt</title><style>${REPORT_CSS}</style></head>
<body><main><header class="topline"><p class="eyebrow">RightsReceipt / Judge rehearsal</p><nav aria-label="Report sections"><a href="#journeys">Journeys</a><a href="#reset">Reset proof</a><a href="#scope">Evidence scope</a></nav></header>
<section class="hero" aria-labelledby="report-title"><div><p class="eyebrow">Local simulation / Verified execution</p><h1 id="report-title">The local rehearsal passed.</h1><p class="lead">Three complete journeys verify exact consent, a deterministic quote, invoice recovery and the canonical rights receipt. Each run ends with a checked reset.</p></div>
<aside class="scope-card"><span class="pill light">LOCAL EVIDENCE ONLY</span><h2>Actual handlers. Injected sessions and provider replies.</h2><p>Scripted creator and buyer roles make explicit decisions through the application. PayPal HTTP and the managed gateway are simulated locally. No real payment or live deployment is represented.</p></aside></section>
<div class="stats" aria-label="Rehearsal results"><div class="stat"><strong>${steps}</strong><span>verified journey steps</span></div><div class="stat"><strong>$425.00</strong><span>USD quote in every run</span></div><div class="stat"><strong>${report.resets.length} / ${report.resets.length}</strong><span>resets restore the baseline</span></div><div class="stat"><strong>${report.isolation.externalRequests}</strong><span>external network requests</span></div></div>
<section class="section" id="journeys" aria-labelledby="journeys-title"><div class="section-title"><div><h2 id="journeys-title">A normal journey, a lost reply and a repeat.</h2><p>Every scenario starts with one workspace, asset and pricing policy. The real application produces all request, consent, invoice, financial and receipt records.</p></div></div>
<div class="scenario-grid">${scenarioCards(report)}</div>
<div class="proof-banner"><span class="proof-mark" aria-hidden="true">✓</span><p><strong>The repeat matches the first ordinary journey.</strong> Ordered outcomes, provider counts and durable record counts are identical after private runtime identities are excluded. The final permission is <strong>scheduled</strong>, and receipt integrity is verified.</p></div>
<div class="traces" aria-label="Ordered execution traces">${traceDetails(report)}</div></section>
<section class="section" id="reset" aria-labelledby="reset-title"><div class="section-title"><div><h2 id="reset-title">A clean baseline after every run.</h2><p>The production seed reset runs only on this rehearsal's disposable in-memory database. Each reset verifies the baseline and denies access to the previous case, buyer capability and receipt.</p></div></div>
<div class="reset-grid">${resetCards(report)}</div>${rowTable(report)}
<p class="quiet">This proof covers the in-memory rehearsal store and its retired records. Managed creator-session revocation remains outside the reset evidence.</p></section>
<section class="section" id="scope" aria-labelledby="scope-title"><div class="section-title"><div><h2 id="scope-title">What this evidence establishes.</h2><p>Invoice delivery, payment evidence, permission dates and receipt integrity remain separate checks.</p></div></div>
<div class="scope-grid"><article class="scope-block"><h3>Application behavior verified locally</h3><ul><li>Actual intake, clarification, explicit approval and exact buyer acceptance handlers.</li><li>Integer-cent pricing and one create POST plus one send POST per journey.</li><li>A committed send with a lost response, read-only delivery recovery and rejection of its stale replay.</li><li>Independent financial reconciliation before scheduled permission and canonical receipt issuance.</li><li>Nine production migrations, SQLite integrity, protected export and minimized public verification.</li></ul></article>
<article class="scope-block pending"><h3>Release gates remain open</h3><p>The managed gateway, signed sessions, scripted participants and PayPal responses are injected for this rehearsal.</p><ul><li>Actual managed login and genuine Sandbox payment, refund and webhook exchange.</li><li>Deployed Worker and Cloudflare D1 behavior.</li><li>Pinned clean installation and the full installed-library build, lint and deployment checks.</li></ul></article></div></section>
<section class="section metadata" aria-labelledby="record-title"><div class="section-title"><div><h2 id="record-title">Execution record</h2><p>The generated time is real UTC. The separate scenario clock makes the local lifecycle deterministic.</p></div></div>
<dl class="meta"><div><dt>Generated at</dt><dd>${clock(report.generatedAt)}</dd></div><div><dt>Virtual scenario clock</dt><dd>${clock(report.scenarioClock)}</dd></div>
<div><dt>Base / current checkout revision</dt><dd><code class="digest">${report.sourceRevision === null ? "Git revision unavailable" : escapeHtml(report.sourceRevision)}</code><span class="source-note">${sourceNote}</span></dd></div>
<div><dt>Runtime and storage</dt><dd>Node ${escapeHtml(report.runtime)} · disposable in-memory SQLite<br>${report.baseline.migrationCount} migrations · ${report.baseline.domainTableCount} domain tables</dd></div>
<div><dt>Actual source fingerprint</dt><dd><code class="digest">${report.sourceFingerprint}</code></dd></div><div><dt>Normalized ordinary outcome</dt><dd><code class="digest">${report.repeatability.normalizedOutcomeSha256}</code></dd></div>
<div><dt>Seed baseline fingerprint</dt><dd><code class="digest">${report.baseline.hash}</code></dd></div><div><dt>Evidence contract</dt><dd>${report.schemaVersion}<br>Local injected mode; no real credentials used.</dd></div></dl></section>
<footer class="footer"><p>RightsReceipt local rehearsal evidence. Receipt hashes are integrity checks, not ownership guarantees. This report contains no capability, signed assertion, buyer identity or raw provider payload.</p><a href="evidence.json">Open minimized JSON evidence</a></footer></main></body></html>
`;
}
