import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequestIntakePageRoutes } from "../apps/api/src/request-intake-pages.ts";
import { evaluateJudgeConfig } from "./judge-deploy-preflight.mjs";

const template = JSON.parse(readFileSync(new URL("../wrangler.judge.example.jsonc", import.meta.url), "utf8"));
const origin = "https://rightsreceipt-judge.sandbox-candidate.workers.dev";
const assetId = "11111111-2222-4333-8444-555555555555";

function candidate() {
  const config = structuredClone(template);
  config.d1_databases[0].database_id = assetId;
  config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN = origin;
  config.vars.HUMAN_CONSENT_ORIGIN = origin;
  assert.equal(evaluateJudgeConfig(config).status, "passed");
  return { ...config.vars, DB: { prepare() { throw new Error("page shell must not query D1"); } } };
}

function routes() {
  let creatorCalls = 0;
  const auth = {
    async session() { creatorCalls++; throw new Error("creator access must stay disabled"); },
    async authorizeAsset() { creatorCalls++; throw new Error("creator access must stay disabled"); },
  };
  return { serve: createRequestIntakePageRoutes(auth, () => 1793548800000),
    creatorCalls: () => creatorCalls };
}

test("the restricted judge configuration serves the actual signed-out buyer form", async () => {
  const { serve, creatorCalls } = routes();
  const response = await serve(new Request(origin + "/buyer/request"), candidate());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/u);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await response.text();
  assert.match(html, /id="intake-form"/u);
  assert.match(html, /id="access-code"/u);
  assert.equal(html.includes("00000000-0000-0000-0000-000000000000"), false);
  assert.equal(creatorCalls(), 0);
});

test("the old blank consent origin fails before deployment and at the public buyer page", async () => {
  const env = candidate();
  env.HUMAN_CONSENT_ORIGIN = "";
  const config = structuredClone(template);
  config.d1_databases[0].database_id = assetId;
  config.vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN = origin;
  config.vars.HUMAN_CONSENT_ORIGIN = "";
  assert.ok(evaluateJudgeConfig(config).errorCodes.includes("consent_origin_invalid"));
  const { serve } = routes();
  const response = await serve(new Request(origin + "/buyer/request"), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "request_intake_unavailable" });
});

test("the public buyer script loads without creator authority or a database query", async () => {
  const { serve } = routes();
  const response = await serve(new Request(origin + "/assets/buyer-request-intake.js"), candidate());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/javascript/u);
  assert.ok((await response.text()).length > 100);
});

test("the restricted preview still denies creator issuance routes and scripts", async () => {
  const { serve, creatorCalls } = routes();
  for (const path of ["/creator/requests/" + assetId, "/assets/creator-request-intake.js"]) {
    const response = await serve(new Request(origin + path), candidate());
    assert.equal(response.status, 503, path);
    assert.deepEqual(await response.json(), { error: "request_intake_unavailable" });
  }
  assert.equal(creatorCalls(), 0);
});

test("a missing D1 binding or disabled human consent blocks buyer routes", async () => {
  const { serve } = routes();
  for (const mutate of [
    env => { delete env.DB; },
    env => { env.HUMAN_CONSENT_ENABLED = "false"; },
    env => { env.PAYPAL_MODE = "production"; },
  ]) {
    const env = candidate(); mutate(env);
    const response = await serve(new Request(origin + "/buyer/request"), env);
    assert.equal(response.status, 503);
  }
});

test("the page enforces its exact HTTPS origin and GET-only public surface", async () => {
  const { serve } = routes();
  const wrongOrigin = candidate();
  wrongOrigin.HUMAN_CONSENT_ORIGIN = "https://different-judge.workers.dev";
  assert.equal((await serve(new Request(origin + "/buyer/request"), wrongOrigin)).status, 400);
  assert.equal((await serve(new Request(origin + "/buyer/request?next=creator"), candidate())).status, 400);
  assert.equal((await serve(new Request(origin + "/buyer/request", { method: "POST" }), candidate())).status, 405);
  assert.equal(await serve(new Request(origin + "/unrelated"), candidate()), null);
});
