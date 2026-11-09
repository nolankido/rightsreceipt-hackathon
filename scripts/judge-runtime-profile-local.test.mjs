import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJudgeRuntimeProfileRoute, restrictedJudgeRuntime, RESTRICTED_JUDGE_VARS }
  from "../apps/api/src/judge-runtime-profile.ts";
import { evaluateJudgeConfig } from "./judge-deploy-preflight.mjs";

const origin = "https://rightsreceipt-judge.sandbox-candidate.workers.dev";
const path = "/api/judge/runtime-profile";
const template = JSON.parse(readFileSync(new URL("../wrangler.judge.example.jsonc", import.meta.url), "utf8"));
const route = createJudgeRuntimeProfileRoute();

function candidate() {
  const vars = { ...template.vars, RIGHTS_RECEIPT_PUBLIC_ORIGIN: origin, HUMAN_CONSENT_ORIGIN: origin };
  return { ...vars, DB: { prepare() { return {}; } },
    ASSETS: { fetch() { return new Response(); } } };
}
function configured() {
  const config = structuredClone(template);
  config.d1_databases[0].database_id = "11111111-2222-4333-8444-555555555555";
  config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN = origin;
  config.vars.HUMAN_CONSENT_ORIGIN = origin;
  return config;
}

test("runtime fixed flags stay in sync with the reviewed deployment template", () => {
  const fromTemplate = { ...template.vars };
  delete fromTemplate.RIGHTS_RECEIPT_PUBLIC_ORIGIN;
  delete fromTemplate.HUMAN_CONSENT_ORIGIN;
  assert.deepEqual(RESTRICTED_JUDGE_VARS, fromTemplate);
  assert.equal(evaluateJudgeConfig(configured()).status, "passed");
  assert.equal(restrictedJudgeRuntime(candidate(), origin), true);
});

test("valid restricted Worker reports a minimal runtime profile with strict private headers", async () => {
  const response = route(new Request(origin + path), candidate());
  assert.equal(response?.status, 200);
  assert.deepEqual(await response.json(), {
    schemaVersion: "rightsreceipt-judge-runtime-profile-v1",
    status: "restricted", mode: "judge", bindings: "present",
  });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/u);
  assert.match(csp, /style-src 'none'/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/u);
});

test("an enabled financial, creator, mock or webhook capability blocks attestation", async () => {
  for (const key of [
    "RIGHTS_INVOICE_CREATION_ENABLED", "RIGHTS_INVOICE_SENDING_ENABLED",
    "PAYPAL_WEBHOOK_INTAKE_ENABLED", "PAYPAL_WEBHOOK_PROCESSING_ENABLED",
    "RIGHTS_RECEIPT_ISSUANCE_ENABLED", "BUYER_PAYMENT_ENABLED",
    "CREATOR_ACCESS_ENABLED", "CREATOR_REVIEW_ENABLED",
  ]) {
    const env = candidate();
    env[key] = "true";
    const response = route(new Request(origin + path), env);
    assert.equal(response?.status, 503, key);
    assert.deepEqual(await response.json(), {
      schemaVersion: "rightsreceipt-judge-runtime-profile-v1", status: "unavailable",
    });
  }
});

test("unexpected runtime secrets, absent bindings and wrong origins fail closed", () => {
  const failures = [
    e => { e.PAYPAL_SANDBOX_CLIENT_SECRET = "private-fixture"; },
    e => { e.VITE_OPENAI_API_KEY = "private-fixture"; },
    e => { delete e.DB; },
    e => { e.DB = {}; },
    e => { delete e.ASSETS; },
    e => { e.ASSETS = {}; },
    e => { e.HUMAN_CONSENT_ORIGIN = "https://another.example.test"; },
    e => { e.RIGHTS_RECEIPT_PUBLIC_ORIGIN = "https://another.example.test"; },
    e => { e.PAYPAL_MODE = "production"; },
    e => { delete e.CREATOR_ACCESS_ENABLED; },
    e => { e.APP_MODE = "sandbox"; },
  ];
  for (const mutate of failures) {
    const env = candidate();
    mutate(env);
    assert.equal(restrictedJudgeRuntime(env, origin), false);
    const response = route(new Request(origin + path), env);
    assert.equal(response?.status, 503);
  }
  for (const env of [undefined, null, [], "test"]) {
    assert.equal(restrictedJudgeRuntime(env, origin), false);
  }
  assert.equal(restrictedJudgeRuntime(candidate(), "http://rightsreceipt-judge.local"), false);
});

test("unexpected query strings and mutation methods are rejected without leaking inputs", async () => {
  const secret = "private-fixture-" + "Z".repeat(43);
  const query = route(new Request(origin + path + "?token=" + secret), candidate());
  assert.equal(query?.status, 400);
  assert.deepEqual(await query.json(), { error: "invalid_request" });
  const post = route(new Request(origin + path, { method: "POST", body: secret }), candidate());
  assert.equal(post?.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
  assert.deepEqual(await post.json(), { error: "method_not_allowed" });
  assert.equal(route(new Request(origin + path + "/"), candidate()), null);
  assert.equal(route(new Request(origin + "/api/health"), candidate()), null);
});

test("Worker dispatch and package verification include the restricted runtime profile", () => {
  const worker = readFileSync(new URL("../apps/api/src/worker.ts", import.meta.url), "utf8");
  assert.match(worker, /createJudgeRuntimeProfileRoute/u);
  assert.match(worker, /judgeRuntimeProfile\(request, env\)/u);
  assert.match(worker, /if \(profile\) return profile;/u);
  assert.ok(template.assets.run_worker_first.includes("/api/*"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.scripts["judge:deploy:verify"].includes("scripts/judge-runtime-profile-local.test.mjs"));
});
