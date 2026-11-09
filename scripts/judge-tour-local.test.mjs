import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { createJudgeTourRoute } from "../apps/api/src/judge-tour.ts";

const origin = "https://rightsreceipt-judge.sandbox-candidate.workers.dev";
const serve = createJudgeTourRoute();

test("public judge route is self-contained, read-only and explicitly illustrative", async () => {
  const response = serve(new Request(origin + "/judge"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/u);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const html = await response.text();
  assert.match(html, /data-judge-tour="illustrative"/u);
  assert.match(html, /Illustrative only\./u);
  assert.match(html, /SYNTHETIC EXAMPLE/u);
  assert.match(html, /USD 425\.00/u);
  assert.match(html, /Scheduled, not active/u);
  assert.match(html, /not genuine PayPal Sandbox evidence/u);
  assert.match(html, /href="\/buyer\/request"/u);
  assert.match(html, /href="\/receipts\/buyer"/u);
  assert.match(html, /href="\/api\/health"/u);
  assert.doesNotMatch(html, /<script\b|<form\b|onerror=|onload=/iu);
  assert.doesNotMatch(html, /#[a-z0-9_-]{43}/iu);
  assert.ok(html.length < 16 * 1024);
});

test("strict CSP permits only the generated CSS nonce and same-origin image", async () => {
  const response = serve(new Request(origin + "/judge"));
  const html = await response.text();
  const nonce = /<style nonce="([a-f0-9]{32})">/u.exec(html)?.[1];
  assert.ok(nonce);
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/u);
  assert.ok(csp.includes("style-src 'nonce-" + nonce + "'"));
  assert.match(csp, /img-src 'self'/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:/u);
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /href="#main"/u);
  assert.match(html, /id="main"/u);
  assert.match(html, /<img[^>]*alt="/u);
});

test("repeated requests use fresh nonces but no varying scenario evidence", async () => {
  const a = await serve(new Request(origin + "/judge")).text();
  const b = await serve(new Request(origin + "/judge")).text();
  const nonceA = /<style nonce="([a-f0-9]{32})">/u.exec(a)?.[1];
  const nonceB = /<style nonce="([a-f0-9]{32})">/u.exec(b)?.[1];
  assert.ok(nonceA && nonceB);
  assert.notEqual(nonceA, nonceB);
  assert.equal(a.replace(nonceA, "NONCE"), b.replace(nonceB, "NONCE"));
});

test("query parameters and mutation methods are rejected without reflection", async () => {
  const secret = "synthetic-secret-" + "Q".repeat(43);
  const query = serve(new Request(origin + "/judge?code=" + secret));
  assert.equal(query.status, 400);
  assert.deepEqual(await query.json(), { error: "invalid_request" });
  assert.equal(query.headers.get("cache-control"), "no-store, private");
  const post = serve(new Request(origin + "/judge", { method: "POST", body: secret }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
  const body = await post.text();
  assert.equal(body.includes(secret), false);
  assert.equal(await serve(new Request(origin + "/judge/")), null);
  assert.equal(await serve(new Request(origin + "/api/health")), null);
});


test("public evidence is navigable, semantic and usable without scripts", async () => {
  const html = await serve(new Request(origin + "/judge")).text();
  for (const section of ["rights", "quote", "state"]) {
    assert.ok(html.includes('data-judge-evidence="' + section + '"'));
    assert.ok(html.includes('href="#' + section + '-evidence"'));
    assert.ok(html.includes('id="' + section + '-evidence"'));
  }
  assert.match(html, /<details><summary>Inspect all 12 creator-reviewed rights<\/summary>/u);
  assert.match(html, /<table>[\s\S]*<caption>/u);
  assert.match(html, /<th scope="col">Policy rule<\/th>/u);
  assert.match(html, /<th scope="row">Total<\/th>/u);
  assert.match(html, /@media print/u);
  assert.match(html, /@media\(max-width:760px\)/u);
  assert.doesNotMatch(html, /<script\b|<form\b|onclick=|onload=/iu);
});

test("all five displayed quote rules and the USD 425.00 total match the seeded policy", async () => {
  const html = await serve(new Request(origin + "/judge")).text();
  const seed = readFileSync(new URL("../seed/demo-reset.sql", import.meta.url), "utf8");
  const pricing = readFileSync(new URL("../packages/pricing/src/index.ts", import.meta.url), "utf8");
  const rulesJson = /^\s+'(\{.*"version":1\})',\s*$/mu.exec(seed)?.[1];
  assert.ok(rulesJson, "the canonical pricing-policy JSON must exist in the seed");
  const policy = JSON.parse(rulesJson);
  const selected = ["base_commercial_digital", "paid_social", "territory_us_ca",
    "duration_31_90", "crop_only"];
  let calculatedCents = 0;
  for (const code of selected) {
    const cents = policy.rules.find(rule => rule.code === code)?.amount_cents;
    assert.ok(Number.isSafeInteger(cents), code);
    calculatedCents += cents;
    const rowStart = html.indexOf('<tr data-rule="' + code + '">');
    assert.ok(rowStart >= 0, code);
    const rowEnd = html.indexOf("</tr>", rowStart);
    const row = html.slice(rowStart, rowEnd);
    const money = "$" + (cents / 100).toFixed(2);
    assert.ok(row.includes('data-cents="' + cents + '">' + money + '</td>'), code);
    assert.ok(pricing.includes('"' + code + '"'), code);
  }
  assert.equal(calculatedCents, 42500);
  assert.ok(html.includes('data-total-cents="42500">$425.00</td>'));
  assert.ok(html.includes("Seeded creator pricing policy, version 1"));
});

test("reviewed rights and scheduled receipt trace the source fixture without disclosing request text", async () => {
  const html = await serve(new Request(origin + "/judge")).text();
  const journey = readFileSync(new URL("../scripts/support/judge-rehearsal-journey.mjs", import.meta.url), "utf8");
  const fixture = readFileSync(new URL("../scripts/support/human-consent-fixture.mjs", import.meta.url), "utf8");
  const reviewed = [
    [/use_purpose:\s*"commercial"/u, "<dt>Purpose</dt><dd>Commercial</dd>"],
    [/channels:\s*\["instagram_paid",\s*"facebook_paid"\]/u, "<dt>Channels</dt><dd>Paid Instagram and Facebook</dd>"],
    [/paid_advertising:\s*true/u, "<dt>Advertising</dt><dd>Paid ads permitted</dd>"],
    [/territories:\s*\["US",\s*"CA"\]/u, "<dt>Territories</dt><dd>United States and Canada</dd>"],
    [/start_date:\s*"2026-11-01"/u, "<dt>Start date</dt><dd>November 1, 2026</dd>"],
    [/duration_days:\s*90/u, "<dt>Duration</dt><dd>90 days</dd>"],
    [/max_impressions:\s*500000/u, "<dt>Impressions cap</dt><dd>500,000</dd>"],
    [/exclusivity:\s*"non_exclusive"/u, "<dt>Exclusivity</dt><dd>Non-exclusive</dd>"],
    [/modification_scope:\s*"crop_only"/u, "<dt>Modifications</dt><dd>Crop only</dd>"],
    [/attribution:\s*"not_required"/u, "<dt>Attribution</dt><dd>Not required</dd>"],
    [/sublicensing:\s*"prohibited"/u, "<dt>Sublicensing</dt><dd>Prohibited</dd>"],
    [/ai_use:\s*"prohibited"/u, "<dt>AI use</dt><dd>Prohibited</dd>"],
  ];
  for (const [pattern, label] of reviewed) {
    assert.match(journey, pattern);
    assert.ok(html.includes(label), label);
  }
  assert.match(journey, /extractor_version === "manual-review-v1"/u);
  assert.match(fixture, /NOW="2026-10-27T19:00:00.000Z"/u);
  assert.match(html, /manual-review-v1/u);
  assert.match(html, /scenario's test clock is October 27, 2026/u);
  const privateRequest = /const REQUEST = "([^"]+)"/u.exec(journey)?.[1];
  assert.ok(privateRequest);
  assert.equal(html.includes(privateRequest), false);
  for (const privateValue of ["Jordan Lee", "jordan@example.test", "INV2-", "BROWSERPAYMENT036"]) {
    assert.equal(html.includes(privateValue), false);
  }
  assert.match(html, /Injected PAID label, no authority on its own/u);
  assert.match(html, /Scheduled, not active/u);
});

test("the Worker and both asset configs route the canonical judge page before the SPA", () => {
  const worker = readFileSync(new URL("../apps/api/src/worker.ts", import.meta.url), "utf8");
  assert.match(worker, /createJudgeTourRoute/u);
  assert.match(worker, /if \(tour\) return tour;/u);
  for (const file of ["wrangler.jsonc", "wrangler.judge.example.jsonc"]) {
    const config = JSON.parse(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
    assert.ok(config.assets.run_worker_first.includes("/judge"), file);
  }
  const art = statSync(new URL("../public/demo/harbor-after-rain.svg", import.meta.url));
  assert.ok(art.isFile() && art.size > 0);
  const app = readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /href="\/judge"/u);
});
