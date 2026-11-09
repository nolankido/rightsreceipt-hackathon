import type {
  PricingPolicyReaderPort,
  QuoteAggregate,
  QuoteRepositoryPort,
} from "@rightsreceipt/application";
import type { PricingPolicyVersion } from "@rightsreceipt/pricing";
import type { D1DatabasePort } from "./ports";

interface PolicyRow {
  pricing_policy_id: string;
  workspace_id: string;
  version_number: number;
  policy_name: string;
  currency: "USD";
  rules_json: string;
  policy_hash: string;
  status: "active" | "superseded";
}

interface QuoteRowDb {
  quote_id: string;
  case_id: string;
  quote_version_number: number;
  terms_version_id: string;
  pricing_policy_id: string;
  pricing_policy_version: number;
  amount_cents: number;
  currency: "USD";
  status: "current" | "superseded";
  calculation_hash: string;
  created_at: string;
}

interface QuoteLineDb {
  quote_line_id: string;
  quote_id: string;
  line_position: number;
  line_code: QuoteAggregate["lines"][number]["lineCode"];
  description: string;
  amount_cents: number;
  created_at: string;
}

export function createD1PricingPolicyReader(database: D1DatabasePort): PricingPolicyReaderPort {
  return {
    async getAssignedActive(workspaceId, pricingPolicyId, versionNumber) {
      const row = await database
        .prepare<PolicyRow>(
          `SELECT pricing_policy_id, workspace_id, version_number, policy_name,
                  currency, rules_json, policy_hash, status
           FROM pricing_policy_versions
           WHERE workspace_id = ? AND pricing_policy_id = ?
             AND version_number = ? AND status = 'active' LIMIT 1`,
        )
        .bind(workspaceId, pricingPolicyId, versionNumber)
        .first<PolicyRow>();
      if (!row) return null;
      const policy: PricingPolicyVersion = {
        pricingPolicyId: row.pricing_policy_id,
        workspaceId: row.workspace_id,
        versionNumber: row.version_number,
        policyName: row.policy_name,
        currency: row.currency,
        rulesJson: row.rules_json,
        policyHash: row.policy_hash,
        status: row.status,
      };
      return policy;
    },
  };
}

export function createD1QuoteRepository(database: D1DatabasePort): QuoteRepositoryPort {
  return {
    async getLatest(caseId) {
      const row = await database
        .prepare<QuoteRowDb>(
          `SELECT quote_id, case_id, quote_version_number, terms_version_id,
                  pricing_policy_id, pricing_policy_version, amount_cents,
                  currency, status, calculation_hash, created_at
           FROM quotes WHERE case_id = ? ORDER BY quote_version_number DESC LIMIT 1`,
        )
        .bind(caseId)
        .first<QuoteRowDb>();
      if (!row) return null;
      const result = await database
        .prepare<QuoteLineDb>(
          `SELECT quote_line_id, quote_id, line_position, line_code,
                  description, amount_cents, created_at
           FROM quote_lines WHERE quote_id = ? ORDER BY line_position`,
        )
        .bind(row.quote_id)
        .all();
      return {
        record: {
          quoteId: row.quote_id,
          caseId: row.case_id,
          quoteVersionNumber: row.quote_version_number,
          termsVersionId: row.terms_version_id,
          pricingPolicyId: row.pricing_policy_id,
          pricingPolicyVersion: row.pricing_policy_version,
          amountCents: row.amount_cents,
          currency: row.currency,
          status: row.status,
          calculationHash: row.calculation_hash,
          createdAt: row.created_at,
        },
        lines: (result.results ?? []).map((line) => ({
          quoteLineId: line.quote_line_id,
          quoteId: line.quote_id,
          linePosition: line.line_position,
          lineCode: line.line_code,
          description: line.description,
          amountCents: line.amount_cents,
          createdAt: line.created_at,
        })),
      };
    },

    async saveNew(quote, lines, audit, expectedCaseRowVersion) {
      const statements = [
        database.prepare(
          `UPDATE quotes SET status = 'superseded'
           WHERE case_id = ? AND status = 'current'`,
        ).bind(quote.caseId),
        database.prepare(
          `INSERT INTO quotes (
             quote_id, case_id, quote_version_number, terms_version_id,
             pricing_policy_id, pricing_policy_version, amount_cents, currency,
             status, calculation_hash, created_at
           ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM licensing_cases lc
           WHERE lc.case_id = ? AND lc.row_version = ? AND lc.case_outcome = 'open'
             AND lc.latest_terms_version_id = ? AND lc.request_submission_id IS NOT NULL`,
        ).bind(
          quote.quoteId, quote.caseId, quote.quoteVersionNumber,
          quote.termsVersionId, quote.pricingPolicyId,
          quote.pricingPolicyVersion, quote.amountCents, quote.currency,
          quote.status, quote.calculationHash, quote.createdAt,
          quote.caseId, expectedCaseRowVersion, quote.termsVersionId,
        ),
        ...lines.map((line) => database.prepare(
          `INSERT INTO quote_lines (
             quote_line_id, quote_id, line_position, line_code,
             description, amount_cents, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          line.quoteLineId, line.quoteId, line.linePosition,
          line.lineCode, line.description, line.amountCents, line.createdAt,
        )),
        database.prepare(
          `UPDATE licensing_cases SET latest_quote_id = ?, updated_at = ?,
             row_version = row_version + 1
           WHERE case_id = ? AND row_version = ? AND latest_terms_version_id = ?`,
        ).bind(
          quote.quoteId, quote.createdAt, quote.caseId,
          expectedCaseRowVersion, quote.termsVersionId,
        ),
        database.prepare(
          `INSERT INTO audit_events (
             audit_event_id, case_id, aggregate_type, aggregate_id,
             aggregate_sequence, event_type, actor_type, actor_reference,
             payload_json, correlation_id, idempotency_key, created_at
           ) VALUES (?, ?, 'quote', ?,
             (SELECT COALESCE(MAX(aggregate_sequence), 0) + 1
                FROM audit_events WHERE case_id = ? AND aggregate_type = 'quote'),
             ?, 'system', 'pricing-engine', ?, ?, ?, ?)`,
        ).bind(
          audit.auditEventId, audit.caseId, audit.aggregateId,
          audit.caseId, audit.eventType, audit.payloadJson,
          audit.correlationId, quote.calculationHash, audit.createdAt,
        ),
      ];
      const result = await database.batch(statements);
      if (result.some((entry) => !entry.success)) {
        throw new Error("Quote creation did not commit successfully.");
      }
      // A zero-row conditional insert makes the first line fail its FK, so D1
      // atomically rolls back a stale or closed-case attempt.
      const insertResult = result[1];
      if (insertResult?.meta?.changes !== undefined && insertResult.meta.changes !== 1) {
        throw new Error("Quote write did not match the expected terms version.");
      }
    },
  };
}
