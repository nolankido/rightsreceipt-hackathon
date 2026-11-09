/** Canonical local rehearsal fixture for release-gate regression tests only.
 * This does not claim that application journeys or PayPal Sandbox requests ran.
 */
import {
  JUDGE_REHEARSAL_TABLES, JUDGE_STEP_CATALOG, judgeScenarioOutcomeSha256,
  projectJudgeRehearsalReport, renderJudgeRehearsalReport,
} from './judge-rehearsal-report.mjs';

const recoverySteps = ['recovery_review','delivery_recovered','recovery_replay'];
const rows = () => Object.fromEntries(JUDGE_REHEARSAL_TABLES.map(name =>
  [name, ['assets','creator_workspaces','pricing_policy_versions','demo_reset_epochs'].includes(name) ? 1 : 0]));

function scenario(id) {
  const label = {
    ordinary: 'Ordinary licensing journey',
    recovery: 'Invoice delivery recovery',
    repeat: 'Repeated ordinary journey',
  }[id];
  let creates = 0, sends = 0, gets = 0, payment = 0, permission = 0, receipt = 0;
  const steps = Object.entries(JUDGE_STEP_CATALOG)
    .filter(([key]) => id === 'recovery' || !recoverySteps.includes(key))
    .map(([key, item]) => {
      if (key === 'draft_created') creates = 1;
      if (key === 'invoice_sent') { sends = 1; gets = id === 'recovery' ? 1 : 2; }
      if (key === 'delivery_recovered') gets = 2;
      if (key === 'financial_reconciliation') { payment = 1; permission = 1; gets = 3; }
      if (key === 'receipt_issued') receipt = 1;
      return {
        id: key, title: item.title, actor: item.actor, operation: item.operation, httpStatus: item.httpStatus,
        outcome: key === 'invoice_sent' && id === 'recovery' ? 'awaiting_reconciliation' : item.outcomes[0],
        evidence: {
          providerCreates: creates, providerSends: sends, providerReads: gets,
          paymentEvidenceRows: payment, permissionRows: permission, receiptRows: receipt,
        },
      };
    });
  return {
    id, label, status: 'passed', steps,
    summary: {
      quoteCents: 42500, currency: 'USD',
      providerCalls: { oauth: 3, create: 1, send: 1, get: 3 },
      durableRows: {
        licensing_cases: 1, request_submissions: 1, clarification_submissions: 1, clarification_reviews: 1,
        terms_versions: 1, quotes: 1, creator_decisions: 1, buyer_acceptances: 1,
        invoice_bindings: 1, payment_operations: 2, payment_evidence: 1,
        permissions: 1, receipt_revisions: 1,
      },
      permissionState: 'scheduled', receiptIntegrity: 'verified', receiptRevision: 1,
      foreignKeys: 'ok', integrity: 'ok',
    },
  };
}

export function makeReleaseJudgeFixture({ commit = 'a'.repeat(40), node = '22.16.0' } = {}) {
  const scenarios = ['ordinary','recovery','repeat'].map(scenario);
  const raw = {
    schemaVersion: 'judge-rehearsal-v1', mode: 'local_injected', status: 'passed',
    runtime: 'v' + node, generatedAt: '2026-11-04T15:00:00.000Z',
    sourceRevision: commit, sourceFingerprint: 'b'.repeat(64), sourceClean: true,
    scenarioClock: '2026-10-27T19:00:00.000Z',
    baseline: { hash: 'c'.repeat(64), migrationCount: 9, domainTableCount: 33, rows: rows() },
    scenarios,
    resets: scenarios.map(item => ({
      afterScenario: item.id, baselineMatches: true, transactionsCleared: true,
      oldCapabilityDenied: true, oldReceiptDenied: true, oldCreatorCaseDenied: true,
      rowsBefore: { ...rows(), ...item.summary.durableRows, quote_lines: 5, audit_events: 20 },
      rowsAfter: rows(),
    })),
    repeatability: { ordinaryMatchesRepeat: true, normalizedOutcomeSha256: judgeScenarioOutcomeSha256(scenarios[0]) },
    isolation: { database: 'memory', externalRequests: 0, credentialsUsed: false },
  };
  return projectJudgeRehearsalReport(raw);
}

export function releaseJudgeFixtureHtml(e) {
  return renderJudgeRehearsalReport(e);
}
