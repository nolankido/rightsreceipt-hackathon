import assert from "node:assert/strict";
import test from "node:test";
import { checkHostedJudge, checkedJudgeOrigin } from "./hosted-judge-smoke.mjs";
import { createJudgeTourRoute } from "../apps/api/src/judge-tour.ts";
import { createJudgeRuntimeProfileRoute, RESTRICTED_JUDGE_VARS } from "../apps/api/src/judge-runtime-profile.ts";

const origin = "https://judge.example.test";
const publicId = "Z".repeat(32);
const legacyId = "Z".repeat(43);
const nonce = "a".repeat(32);
const actualJudgeTour = createJudgeTourRoute();
const actualRuntimeProfile = createJudgeRuntimeProfileRoute();
function runtimeEnv() {
  return { ...RESTRICTED_JUDGE_VARS, RIGHTS_RECEIPT_PUBLIC_ORIGIN: origin,
    HUMAN_CONSENT_ORIGIN: origin, DB: { prepare() { return {}; } },
    ASSETS: { fetch() { return new Response(); } } };
}
function browserHeaders(kind = "buyer") {
  const common = {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const boundary = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; ";
  const policy = kind === "receipt"
    ? boundary + "script-src 'self'; connect-src 'self'; img-src 'self' data:; "
      + "style-src 'unsafe-inline'; form-action 'self'; object-src 'none'"
    : kind === "tour"
      ? boundary + "img-src 'self'; style-src 'nonce-" + nonce + "'; form-action 'none'"
      : boundary + "script-src 'self'; connect-src 'self'; "
        + "style-src 'nonce-" + nonce + "'; form-action 'none'";
  return { ...common, "Content-Security-Policy": policy };
}
const json = (value, status = 200, secured = false) => new Response(JSON.stringify(value), {
  status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(secured ? browserHeaders("receipt") : {}),
  },
});
const html = (value, kind = "buyer") => new Response(
  "<!doctype html><html><head><title>RightsReceipt</title>"
    + (kind === "receipt" ? "" : '<style nonce="' + nonce + '">body{color:black}</style>')
    + "</head><body>" + value + "</body></html>",
  { status: 200, headers: {
    "Content-Type": "text/html; charset=utf-8", ...browserHeaders(kind),
  } },
);
const script = (value, kind = "buyer") => new Response(value, { status: 200,
  headers: { "Content-Type": "text/javascript; charset=utf-8", ...browserHeaders(kind) } });

function baseRoutes() {
  return new Map([
    ["/api/health", () => json({ status: "ok", service: "rightsreceipt", mode: "judge", persistence: "ready" })],
    ["/api/judge/runtime-profile", () => actualRuntimeProfile(new Request(origin + "/api/judge/runtime-profile"), runtimeEnv())],
    ["/", () => html("<div id='root'>RightsReceipt</div>")],
    ["/judge", () => actualJudgeTour(new Request(origin + "/judge"))],
    ["/buyer/request", () => html('<form id="access-form"><input id="access-code"></form><form id="intake-form">Request</form>')],
    ["/assets/buyer-request-intake.js", () => script("/* buyer intake client */" + "x".repeat(150))],
    ["/receipts/buyer", () => html("<main>Receipt access</main>", "receipt")],
    ["/assets/receipt-access.js", () => script("/* receipt access client */" + "x".repeat(150), "receipt")],
    ["/api/receipt-verification/" + publicId, () => json({ schemaVersion: "rightsreceipt-public-verification-v1", environment: "sandbox", status: "not_found", integrity: "not_verified", checkedAt: "2026-10-31T00:00:00.000Z", receipt: null }, 404, true)],
    ["/api/creator/workspace", () => json({ code: "creator_session_required" }, 403)],
    ["/api/mock/verify/" + legacyId, () => json({ code: "mock_mode_unavailable" }, 503)],
  ]);
}
function client(routes = baseRoutes()) {
  const calls = [];
  const request = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ url, options });
    assert.ok(routes.has(path), "unexpected route: " + path);
    return routes.get(path)();
  };
  return { request, calls, routes };
}

test("signed-out judge smoke passes eleven read-only probes including the live runtime profile", async () => {
  const { request, calls } = client();
  const result = await checkHostedJudge(origin, request);
  assert.equal(result.status, "passed");
  assert.equal(result.checks.length, 11);
  assert.equal(result.checks.every(value => value.status === "passed"), true);
  assert.equal(result.origin, origin);
  assert.equal(calls.length, 11);
  for (const { url, options } of calls) {
    assert.equal(new URL(url).origin, origin);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    assert.equal(Object.hasOwn(options.headers, "Authorization"), false);
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(JSON.stringify(result).includes("intake-form"), false);
});


test("the hosted check rejects a missing or unrelated runtime attestation", async () => {
  const fixture = client();
  fixture.routes.set("/api/judge/runtime-profile", () => json({ error: "not_found" }, 404));
  let result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(x => x.status === "failed").map(x => x.id),
    ["restricted_runtime"]);
  fixture.routes.set("/api/judge/runtime-profile", () => json({
    schemaVersion: "rightsreceipt-judge-runtime-profile-v1", status: "restricted",
    mode: "judge", bindings: "present", leaked: "private-fixture",
  }, 200, true));
  result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(x => x.status === "failed").map(x => x.id),
    ["restricted_runtime"]);
  assert.equal(JSON.stringify(result).includes("private-fixture"), false);
});

test("the runtime profile blocks a deployed Worker with enabled financial or creator flags", async () => {
  for (const key of ["RIGHTS_INVOICE_SENDING_ENABLED", "CREATOR_ACCESS_ENABLED",
    "PAYPAL_WEBHOOK_INTAKE_ENABLED"]) {
    const fixture = client();
    const env = runtimeEnv();
    env[key] = "true";
    fixture.routes.set("/api/judge/runtime-profile", () =>
      actualRuntimeProfile(new Request(origin + "/api/judge/runtime-profile"), env));
    const result = await checkHostedJudge(origin, fixture.request);
    assert.deepEqual(result.checks.filter(x => x.status === "failed").map(x => x.id),
      ["restricted_runtime"], key);
  }
});

test("the runtime profile requires strict browser protection and no active content", async () => {
  for (const change of [
    headers => headers.delete("X-Robots-Tag"),
    headers => headers.set("Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; "
      + "base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'"),
    headers => headers.set("Cache-Control", "public, max-age=3600"),
  ]) {
    const fixture = client();
    await changeHeaders(fixture, "/api/judge/runtime-profile", change);
    const result = await checkHostedJudge(origin, fixture.request);
    assert.deepEqual(result.checks.filter(x => x.status === "failed").map(x => x.id),
      ["restricted_runtime"]);
  }
});

test("the smoke requires judge mode even if other routes claim Sandbox readiness", async () => {
  const fixture = client();
  fixture.routes.set("/api/health", () => json({
    status: "ok", service: "rightsreceipt", mode: "sandbox", persistence: "ready",
  }));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(x => x.status === "failed").map(x => x.id),
    ["worker_health"]);
});

test("a placeholder judge page fails even when the other public routes respond", async () => {
  const fixture = client();
  fixture.routes.set("/judge", () => html("<main>Judge launch will be available later.</main>"));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id),
    ["judge_walkthrough"]);
});


test("judge smoke refuses missing evidence panels or a mismatched seeded quote", async () => {
  const original = actualJudgeTour(new Request(origin + "/judge"));
  const html = await original.text();
  for (const [from, to] of [
    ['data-judge-evidence="rights"', 'data-judge-evidence="missing"'],
    ['data-judge-evidence="quote"', 'data-judge-evidence="missing"'],
    ['data-judge-evidence="state"', 'data-judge-evidence="missing"'],
    ['data-total-cents="42500"', 'data-total-cents="42000"'],
    ["manual-review-v1", "unknown-extractor"],
  ]) {
    const fixture = client();
    fixture.routes.set("/judge", () => new Response(html.replace(from, to), {
      status: original.status, headers: original.headers,
    }));
    const result = await checkHostedJudge(origin, fixture.request);
    assert.deepEqual(result.checks.filter(x => x.status === "failed").map(x => x.id),
      ["judge_walkthrough"], from);
  }
});

test("a judge page without explicit synthetic and payment-evidence warnings fails", async () => {
  const fixture = client();
  fixture.routes.set("/judge", () => html('<main data-judge-tour="illustrative">USD 425.00'
    + '<a href="/buyer/request">Buyer</a><a href="/receipts/buyer">Receipt</a></main>'));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id),
    ["judge_walkthrough"]);
});

async function changeHeaders(fixture, path, mutate) {
  const current = await fixture.routes.get(path)();
  const headers = new Headers(current.headers);
  mutate(headers);
  const body = await current.text();
  fixture.routes.set(path, () => new Response(body, { status: current.status, headers }));
}

test("native pages and scripts require anti-indexing, framing, sniffing and referrer protections", async () => {
  const samples = [
    ["/judge", "X-Robots-Tag", "judge_walkthrough"],
    ["/buyer/request", "X-Frame-Options", "buyer_intake_page"],
    ["/receipts/buyer", "X-Content-Type-Options", "buyer_receipt_page"],
    ["/assets/buyer-request-intake.js", "Cache-Control", "buyer_intake_script"],
    ["/assets/receipt-access.js", "Referrer-Policy", "receipt_script"],
    ["/api/receipt-verification/" + publicId, "X-Robots-Tag", "unknown_public_receipt"],
  ];
  for (const [path, name, expected] of samples) {
    const fixture = client();
    await changeHeaders(fixture, path, headers => {
      if (name === "Cache-Control") headers.set(name, "public, no-store");
      else headers.delete(name);
    });
    const result = await checkHostedJudge(origin, fixture.request);
    assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), [expected], path);
  }
});

test("weakened CSP defaults, framing, script and connection restrictions fail closed", async () => {
  const unsafe = [
    ["/judge", "frame-ancestors 'none'", "frame-ancestors *", "judge_walkthrough"],
    ["/buyer/request", "base-uri 'none'", "base-uri 'self'", "buyer_intake_page"],
    ["/receipts/buyer", "default-src 'none'", "default-src 'self'", "buyer_receipt_page"],
    ["/assets/buyer-request-intake.js", "script-src 'self'", "script-src 'unsafe-inline'", "buyer_intake_script"],
    ["/assets/receipt-access.js", "connect-src 'self'", "connect-src https://unsafe.example.test", "receipt_script"],
    ["/api/receipt-verification/" + publicId, "form-action 'self'", "form-action *", "unknown_public_receipt"],
  ];
  for (const [path, from, to, expected] of unsafe) {
    const fixture = client();
    await changeHeaders(fixture, path, headers => {
      const policy = headers.get("Content-Security-Policy");
      assert.ok(policy.includes(from));
      headers.set("Content-Security-Policy", policy.replace(from, to));
    });
    const result = await checkHostedJudge(origin, fixture.request);
    assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), [expected], path);
  }
});

test("a duplicated script directive or absent CSP fails the native private route", async () => {
  for (const mutate of [
    headers => headers.delete("Content-Security-Policy"),
    headers => headers.set("Content-Security-Policy",
      headers.get("Content-Security-Policy") + "; script-src 'unsafe-inline'"),
  ]) {
    const fixture = client();
    await changeHeaders(fixture, "/receipts/buyer", mutate);
    const result = await checkHostedJudge(origin, fixture.request);
    assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id),
      ["buyer_receipt_page"]);
  }
});

test("judge and buyer CSS nonces must match the response CSP", async () => {
  for (const [path, expected] of [
    ["/judge", "judge_walkthrough"], ["/buyer/request", "buyer_intake_page"],
  ]) {
    const fixture = client();
    await changeHeaders(fixture, path, headers => {
      headers.set("Content-Security-Policy",
        headers.get("Content-Security-Policy").replace(/style-src 'nonce-[a-f0-9]{32}'/u,
          "style-src 'nonce-" + "b".repeat(32) + "'"));
    });
    const result = await checkHostedJudge(origin, fixture.request);
    assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), [expected]);
  }
});

test("the public SPA landing does not need private native-page CSP headers", async () => {
  const fixture = client();
  fixture.routes.set("/", () => new Response("<!doctype html><html>RightsReceipt</html>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.equal(result.status, "passed");
  assert.equal(result.checks.length, 11);
});

test("buyer smoke rejects an unusable form without the private-code entry", async () => {
  const fixture = client();
  fixture.routes.set("/buyer/request", () => html('<form id="intake-form">Request</form>'));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id),
    ["buyer_intake_page"]);
});

test("a local-mode health response cannot masquerade as a hosted Sandbox build", async () => {
  const fixture = client();
  fixture.routes.set("/api/health", () => json({ status: "ok", service: "rightsreceipt", mode: "local" }));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), ["worker_health"]);
});

test("hosted health rejects old deployments that have not checked D1 readiness", async () => {
  const fixture = client();
  fixture.routes.set("/api/health", () => json({
    status: "ok", service: "rightsreceipt", mode: "judge",
  }));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), ["worker_health"]);
});

test("a missing or unmigrated D1 binding blocks hosted judge access", async () => {
  const fixture = client();
  fixture.routes.set("/api/health", () => json({
    status: "unavailable", service: "rightsreceipt", mode: "judge",
    code: "persistence_unavailable",
  }, 503));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), ["worker_health"]);
});

test("a publicly readable legacy creator workspace fails the privacy boundary", async () => {
  const fixture = client();
  fixture.routes.set("/api/creator/workspace", () => json({ workspace: "private-data" }));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), ["legacy_creator_denied"]);
  assert.equal(JSON.stringify(result).includes("private-data"), false);
});

test("enabled local mock transaction verification fails the hosted boundary", async () => {
  const fixture = client();
  fixture.routes.set("/api/mock/verify/" + legacyId, () => json({ status: "active" }));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), ["mock_verification_denied"]);
});

test("disabled buyer intake and receipt routes fail the judge readiness check", async () => {
  const fixture = client();
  fixture.routes.set("/buyer/request", () => json({ error: "request_intake_unavailable" }, 503));
  fixture.routes.set("/receipts/buyer", () => json({ status: "receipt_reads_unavailable" }, 503));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id),
    ["buyer_intake_page", "buyer_receipt_page"]);
});

test("external redirects are not followed or mistaken for judge access", async () => {
  const fixture = client();
  fixture.routes.set("/", () => new Response("", { status: 302, headers: {
    Location: "https://login.example.test",
  } }));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.equal(result.status, "failed");
  assert.equal(result.checks.find(item => item.id === "landing_page").httpStatus, 302);
  assert.equal(fixture.calls.length, 11);
  assert.equal(fixture.calls.some(item => item.url.includes("login.example.test")), false);
});

test("origin validation rejects credentials, paths, queries and unsafe local targets", async () => {
  for (const value of [
    "http://judge.example.test", "https://judge.example.test/", "https://judge.example.test/path",
    "https://judge.example.test?key=fixture", "https://user:pass@judge.example.test",
    "https://localhost", "https://127.0.0.1", "https://internal.local",
    "https://10.1.2.3", "https://judge.example.test:8443",
  ]) assert.throws(() => checkedJudgeOrigin(value), /invalid_origin/u, value);
  assert.equal(checkedJudgeOrigin(origin), origin);
  let called = false;
  await assert.rejects(checkHostedJudge("http://localhost", async () => {
    called = true;
  }), /invalid_origin/u);
  assert.equal(called, false);
});

test("oversized responses fail closed without copying response data", async () => {
  const fixture = client();
  fixture.routes.set("/assets/receipt-access.js", () => script("x".repeat(65 * 1024)));
  const result = await checkHostedJudge(origin, fixture.request);
  const failed = result.checks.filter(item => item.status === "failed");
  assert.deepEqual(failed.map(item => item.id), ["receipt_script"]);
  assert.equal(failed[0].code, "response_too_large");
  assert.ok(JSON.stringify(result).length < 4_000);
});

test("transport errors remain sanitized even if their messages contain private values", async () => {
  const fixture = client();
  fixture.routes.set("/api/health", () => { throw new Error("private@example.invalid"); });
  const result = await checkHostedJudge(origin, fixture.request);
  assert.equal(result.status, "failed");
  assert.equal(result.checks[0].code, "request_failed");
  assert.equal(JSON.stringify(result).includes("private@example.invalid"), false);
});

test("a broken public receipt verification route cannot be mistaken for a working one", async () => {
  const fixture = client();
  fixture.routes.set("/api/receipt-verification/" + publicId, () => html("Not found"));
  const result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), ["unknown_public_receipt"]);
});

test("public receipt response with unexpected fields or missing private no-store is rejected", async () => {
  const fixture = client();
  fixture.routes.set("/api/receipt-verification/" + publicId, () => json({
    schemaVersion: "rightsreceipt-public-verification-v1", environment: "sandbox",
    status: "not_found", integrity: "not_verified", checkedAt: "2026-10-31T00:00:00.000Z",
    receipt: null, privateBuyer: "fixture-only",
  }, 404, true));
  let result = await checkHostedJudge(origin, fixture.request);
  assert.deepEqual(result.checks.filter(item => item.status === "failed").map(item => item.id), ["unknown_public_receipt"]);
  fixture.routes.set("/buyer/request", () => new Response('<html>RightsReceipt<form id="intake-form"></form></html>', {
    headers: { "Content-Type": "text/html" },
  }));
  result = await checkHostedJudge(origin, fixture.request);
  assert.ok(result.checks.some(item => item.id === "buyer_intake_page" && item.status === "failed"));
});
