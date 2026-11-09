import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateJudgeConfig, checkedConfigPath } from "./judge-deploy-preflight.mjs";

const template = JSON.parse(readFileSync(new URL("../wrangler.judge.example.jsonc", import.meta.url), "utf8"));
const localDefault = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
function candidate() {
  const config = clone(template);
  config.d1_databases[0].database_id = "11111111-2222-4333-8444-555555555555";
  config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN = "https://rightsreceipt-judge.sandbox-candidate.workers.dev";
  config.vars.HUMAN_CONSENT_ORIGIN = config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN;
  return config;
}
function codes(value) { return evaluateJudgeConfig(value).errorCodes; }

test("restricted judge preview accepts a distinct Worker, D1 and safe public origin", () => {
  const result = evaluateJudgeConfig(candidate());
  assert.equal(result.status, "passed");
  assert.deepEqual(result.errorCodes, []);
  assert.match(result.limitation, /No Cloudflare, D1, PayPal/u);
});

test("tracked example is intentionally undeployable until both placeholders change", () => {
  const result = evaluateJudgeConfig(template);
  assert.equal(result.status, "failed");
  assert.ok(result.errorCodes.includes("d1_binding_invalid"));
  assert.ok(result.errorCodes.includes("judge_origin_invalid"));
  assert.ok(result.errorCodes.includes("consent_origin_invalid"));
});

test("the existing local-only Wrangler config cannot be deployed as judge preview", () => {
  const result = evaluateJudgeConfig(localDefault);
  assert.equal(result.status, "failed");
  assert.ok(result.errorCodes.includes("worker_target_invalid"));
  assert.ok(result.errorCodes.includes("d1_binding_invalid"));
  assert.ok(result.errorCodes.includes("variables_invalid"));
});

test("buyer consent origin must equal the approved public judge origin", () => {
  for (const value of [
    "", "http://rightsreceipt-judge.sandbox-candidate.workers.dev",
    "https://different-judge.workers.dev",
    "https://user:pass@rightsreceipt-judge.sandbox-candidate.workers.dev",
    "https://rightsreceipt-judge.sandbox-candidate.workers.dev/",
  ]) {
    const config = candidate();
    config.vars.HUMAN_CONSENT_ORIGIN = value;
    assert.ok(codes(config).includes("consent_origin_invalid"), value);
  }
  const config = candidate();
  delete config.vars.HUMAN_CONSENT_ORIGIN;
  assert.ok(codes(config).includes("variables_invalid"));
  assert.ok(codes(config).includes("consent_origin_invalid"));
});

test("changing the public host without updating consent host fails deployment preflight", () => {
  const config = candidate();
  config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN = "https://another-judge.workers.dev";
  assert.ok(codes(config).includes("consent_origin_invalid"));
});

test("production PayPal or local-mode configuration is refused", () => {
  const config = candidate();
  config.vars.PAYPAL_BASE_URL = "https://api-m.paypal.com";
  config.vars.APP_MODE = "local";
  config.vars.PAYPAL_MODE = "fake";
  assert.ok(codes(config).includes("variables_invalid"));
});

test("enabling creator access, payment or webhook side effects is not a preview", () => {
  for (const flag of [
    "CREATOR_ACCESS_ENABLED", "RIGHTS_INVOICE_CREATION_ENABLED",
    "RIGHTS_INVOICE_SENDING_ENABLED", "PAYPAL_WEBHOOK_INTAKE_ENABLED",
    "BUYER_PAYMENT_ENABLED", "RIGHTS_RECEIPT_ISSUANCE_ENABLED",
  ]) {
    const config = candidate();
    config.vars[flag] = "true";
    assert.ok(codes(config).includes("variables_invalid"), flag);
  }
});

test("buyer intake, clarification, human consent and receipt-read prerequisites stay enabled", () => {
  for (const flag of [
    "REQUEST_INTAKE_ENABLED", "CLARIFICATION_ENABLED",
    "HUMAN_CONSENT_ENABLED", "RIGHTS_RECEIPT_READ_ENABLED",
  ]) {
    const config = candidate(); config.vars[flag] = "false";
    assert.ok(codes(config).includes("variables_invalid"), flag);
  }
});

test("inline credentials or unknown runtime values never pass", () => {
  for (const key of ["PAYPAL_SANDBOX_CLIENT_SECRET", "OPENAI_API_KEY", "VITE_API_SECRET"]) {
    const config = candidate();
    config.vars[key] = "synthetic-only";
    assert.ok(codes(config).includes("variables_invalid"), key);
  }
});

test("D1 must be exactly one named DB binding with a real-looking ID and migrations directory", () => {
  for (const mutate of [
    c => { delete c.d1_databases; },
    c => { c.d1_databases.push(clone(c.d1_databases[0])); },
    c => { c.d1_databases[0].binding = "OTHER_DB"; },
    c => { c.d1_databases[0].database_id = "00000000-0000-0000-0000-000000000000"; },
    c => { c.d1_databases[0].migrations_dir = "nonexistent"; },
    c => { c.d1_databases[0].migrations_table = "other_ledger"; },
    c => { delete c.d1_databases[0].migrations_table; },
    c => { c.d1_databases[0].preview_database_id = "11111111-2222-4333-8444-555555555555"; },
  ]) {
    const config = candidate(); mutate(config);
    assert.ok(codes(config).includes("d1_binding_invalid"));
  }
});

test("worker-first API and receipt routing cannot drift or be bypassed", () => {
  for (const change of [
    c => { c.assets.run_worker_first = c.assets.run_worker_first.filter(x => x !== "/api/*"); },
    c => { c.assets.run_worker_first = c.assets.run_worker_first.filter(x => x !== "/judge"); },
    c => { c.assets.not_found_handling = "none"; },
    c => { c.assets.directory = "./public"; },
    c => { c.assets.run_worker_first = true; },
  ]) {
    const config = candidate(); change(config);
    assert.ok(codes(config).includes("asset_routes_invalid"));
  }
});

test("custom route, environment overrides and unsafe exposure are not allowed", () => {
  for (const change of [
    c => { c.routes = ["not-approved.example.test"]; },
    c => { c.route = "example.invalid/*"; },
    c => { c.env = { production: {} }; },
    c => { c.workers_dev = false; },
  ]) {
    const config = candidate(); change(config);
    assert.ok(codes(config).includes("unexpected_exposure_setting"));
  }
});

test("judge origin must be a bare public HTTPS origin, not a placeholder", () => {
  for (const origin of [
    "https://judge.example.invalid", "https://localhost", "https://127.0.0.1",
    "https://judge.internal", "http://judge.workers.dev",
    "https://user:pass@judge.workers.dev", "https://judge.workers.dev/path",
    "https://judge.workers.dev:8443", "https://judge.workers.dev?token=x",
  ]) {
    const config = candidate(); config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN = origin;
    assert.ok(codes(config).includes("judge_origin_invalid"), origin);
  }
});

test("malformed and unexpected config shapes fail with sanitized diagnostic codes", () => {
  for (const value of [null, [], false, "text", {}]) {
    assert.equal(evaluateJudgeConfig(value).status, "failed");
  }
  const config = candidate();
  config.observability = null;
  config.assets = null;
  assert.ok(codes(config).includes("worker_runtime_invalid"));
  assert.ok(codes(config).includes("asset_routes_invalid"));
});

test("pin and explicit target filename are enforced", () => {
  const config = candidate(); config.compatibility_date = "2025-01-01";
  assert.ok(codes(config).includes("worker_runtime_invalid"));
  assert.match(checkedConfigPath("wrangler.judge.local.jsonc"), /wrangler\.judge\.local\.jsonc$/u);
  assert.match(checkedConfigPath("wrangler.jsonc"), /wrangler\.jsonc$/u);
  for (const path of ["../wrangler.jsonc", "/tmp/config.jsonc", "wrangler.judge.example.jsonc"]) {
    assert.throws(() => checkedConfigPath(path), /invalid_path/u);
  }
});
