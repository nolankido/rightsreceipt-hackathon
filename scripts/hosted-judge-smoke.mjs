#!/usr/bin/env node
/** Read-only signed-out smoke checks for a deployed Sandbox judge build. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaVersion = "rightsreceipt-hosted-judge-smoke-v1";
const maxResponseBytes = 64 * 1024;
const requestTimeoutMs = 8_000;
const fakePublicId = "Z".repeat(32);
const fakeLegacyId = "Z".repeat(43);
const probes = [
  { id: "worker_health", path: "/api/health", kind: "health" },
  { id: "restricted_runtime", path: "/api/judge/runtime-profile", kind: "profile" },
  { id: "landing_page", path: "/", kind: "landing" },
  { id: "judge_walkthrough", path: "/judge", kind: "tour" },
  { id: "buyer_intake_page", path: "/buyer/request", kind: "buyer" },
  { id: "buyer_intake_script", path: "/assets/buyer-request-intake.js", kind: "script" },
  { id: "buyer_receipt_page", path: "/receipts/buyer", kind: "receipt" },
  { id: "receipt_script", path: "/assets/receipt-access.js", kind: "script" },
  { id: "unknown_public_receipt", path: "/api/receipt-verification/" + fakePublicId, kind: "unknown" },
  { id: "legacy_creator_denied", path: "/api/creator/workspace", kind: "creator" },
  { id: "mock_verification_denied", path: "/api/mock/verify/" + fakeLegacyId, kind: "mock" },
];

export function checkedJudgeOrigin(input) {
  if (typeof input !== "string" || input.length > 200 || input.length < 10) throw new Error("invalid_origin");
  let value;
  try { value = new URL(input); } catch { throw new Error("invalid_origin"); }
  const host = value.hostname.toLowerCase();
  if (value.protocol !== "https:" || value.origin !== input || value.pathname !== "/"
    || value.username || value.password || value.search || value.hash || value.port
    || !/^[a-z0-9.-]+$/u.test(host) || !host.includes(".")
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host.endsWith(".internal") || host.endsWith(".invalid") || host.includes("..")
    || /^([0-9]+\.){3}[0-9]+$/u.test(host)) throw new Error("invalid_origin");
  return value.origin;
}

async function boundedText(response) {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maxResponseBytes) throw new Error("response_too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, result = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return result + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) {
        await reader.cancel();
        throw new Error("response_too_large");
      }
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

const nativePrivateKinds = new Set(["profile", "tour", "buyer", "receipt", "script", "unknown"]);
function secureBrowserHeaders(probe, response, body) {
  const headers = response.headers;
  const cache = (headers.get("cache-control") ?? "").toLowerCase().split(",").map(x => x.trim());
  if (!cache.includes("no-store") || !cache.includes("private")
    || headers.get("referrer-policy")?.toLowerCase().trim() !== "no-referrer"
    || headers.get("x-content-type-options")?.toLowerCase().trim() !== "nosniff"
    || headers.get("x-frame-options")?.toLowerCase().trim() !== "deny") return false;
  const robots = (headers.get("x-robots-tag") ?? "").toLowerCase().split(",").map(x => x.trim());
  if (!robots.includes("noindex") || !robots.includes("nofollow")) return false;

  const policy = headers.get("content-security-policy") ?? "";
  if (!policy || policy.length > 2000) return false;
  const directives = new Map();
  for (const part of policy.split(";").map(x => x.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/u);
    if (!/^[a-z-]+$/u.test(name) || directives.has(name)) return false;
    directives.set(name, values.join(" "));
  }
  if (directives.get("default-src") !== "'none'"
    || directives.get("frame-ancestors") !== "'none'"
    || directives.get("base-uri") !== "'none'"
    || !["'none'", "'self'"].includes(directives.get("form-action"))
    || ![undefined, "'self'"].includes(directives.get("script-src"))
    || ![undefined, "'self'"].includes(directives.get("connect-src"))
    || ![undefined, "'self'", "'self' data:", "'none'"].includes(directives.get("img-src"))
    || ![undefined, "'none'"].includes(directives.get("object-src"))) return false;

  if (probe.kind === "profile" && (directives.get("style-src") !== "'none'"
    || directives.get("img-src") !== "'none'" || directives.get("object-src") !== "'none'"
    || directives.has("script-src") || directives.has("connect-src"))) return false;

  if (probe.kind === "buyer" || probe.kind === "tour") {
    const nonce = /<style nonce="([a-f0-9]{32})">/u.exec(body)?.[1];
    if (!nonce || directives.get("style-src") !== "'nonce-" + nonce + "'") return false;
  }
  return true;
}

function validResponse(probe, response, body) {
  const mime = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (probe.kind !== "landing" && !(response.headers.get("cache-control") ?? "").toLowerCase().includes("no-store")) return false;
  if (nativePrivateKinds.has(probe.kind) && !secureBrowserHeaders(probe, response, body)) return false;
  const json = () => {
    if (!mime.startsWith("application/json")) return null;
    try { return JSON.parse(body); } catch { return null; }
  };
  if (probe.kind === "health") {
    const value = json();
    return response.status === 200 && value?.status === "ok" && value?.service === "rightsreceipt"
      && value?.mode === "judge"
      && value?.persistence === "ready";
  }
  if (probe.kind === "profile") {
    const value = json();
    return response.status === 200 && value?.schemaVersion === "rightsreceipt-judge-runtime-profile-v1"
      && value?.status === "restricted" && value?.mode === "judge"
      && value?.bindings === "present"
      && Object.keys(value).sort().join(",") === "bindings,mode,schemaVersion,status";
  }
  if (probe.kind === "landing") return response.status === 200 && mime.startsWith("text/html")
    && body.includes("<html") && body.includes("RightsReceipt");
  if (probe.kind === "tour") return response.status === 200 && mime.startsWith("text/html")
    && body.includes('data-judge-tour="illustrative"') && body.includes("Illustrative only.")
    && body.includes("SYNTHETIC EXAMPLE") && body.includes("USD 425.00")
    && body.includes("Scheduled, not active")
    && body.includes("not genuine PayPal Sandbox evidence")
    && body.includes('data-judge-evidence="rights"')
    && body.includes('data-judge-evidence="quote"')
    && body.includes('data-judge-evidence="state"')
    && body.includes('data-total-cents="42500"')
    && body.includes("manual-review-v1")
    && body.includes('href="/buyer/request"') && body.includes('href="/receipts/buyer"');
  if (probe.kind === "buyer") return response.status === 200 && mime.startsWith("text/html")
    && body.includes("RightsReceipt") && body.includes('id="access-form"')
    && body.includes('id="access-code"') && body.includes('id="intake-form"');
  if (probe.kind === "receipt") return response.status === 200 && mime.startsWith("text/html")
    && body.includes("RightsReceipt");
  if (probe.kind === "script") return response.status === 200
    && (mime.startsWith("text/javascript") || mime.startsWith("application/javascript"))
    && body.length > 100;
  if (probe.kind === "unknown") {
    const value = json();
    return response.status === 404 && value?.status === "not_found"
      && value?.schemaVersion === "rightsreceipt-public-verification-v1"
      && value?.environment === "sandbox" && value?.integrity === "not_verified"
      && value?.receipt === null && typeof value?.checkedAt === "string"
      && Object.keys(value).sort().join(",") === "checkedAt,environment,integrity,receipt,schemaVersion,status";
  }
  if (probe.kind === "creator") return response.status === 403 && json()?.code === "creator_session_required";
  if (probe.kind === "mock") return response.status === 503 && json()?.code === "mock_mode_unavailable";
  return false;
}

export async function checkHostedJudge(originInput, request = fetch) {
  const origin = checkedJudgeOrigin(originInput);
  const checks = await Promise.all(probes.map(async probe => {
    let httpStatus = null;
    try {
      const response = await request(origin + probe.path, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { Accept: "application/json, text/html, text/javascript" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      httpStatus = response.status;
      const body = await boundedText(response);
      const passed = validResponse(probe, response, body);
      return { id: probe.id, status: passed ? "passed" : "failed",
        httpStatus, code: passed ? "ok" : "unexpected_response" };
    } catch (error) {
      return { id: probe.id, status: "failed", httpStatus,
        code: error instanceof Error && error.message === "response_too_large"
          ? "response_too_large" : "request_failed" };
    }
  }));
  return {
    schemaVersion, origin, status: checks.every(item => item.status === "passed") ? "passed" : "failed",
    checks, limitations: [
      "Only signed-out, read-only HTTP checks were performed. No payment or webhook action was called.",
      "The illustrative judge walkthrough is static and does not prove a genuine PayPal Sandbox transaction.",
      "Browser security headers were checked on native routes; a passing check does not prove complete browser or infrastructure security.",
      "The runtime profile proves only declared bindings and feature flags at the queried Worker origin, not the source commit or absence of application bugs.",
      "A passing smoke check does not verify real PayPal Sandbox payment, D1 migrations, interactive browser flows, or judge credentials.",
      "Run full release verification and genuine Sandbox acceptance as separate gates.",
    ],
  };
}

function parseArgs(rawArgs) {
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { help: true };
  if (args.length === 2 && args[0] === "--origin") return { origin: checkedJudgeOrigin(args[1]) };
  throw new Error("invalid_arguments");
}

export async function main(args = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(args); } catch {
    process.stderr.write("Usage: node scripts/hosted-judge-smoke.mjs --origin https://judge.example.test\n");
    return 2;
  }
  if (options.help) {
    process.stdout.write("Read-only signed-out checks: health, public pages, browser security headers, assets, disabled mock and creator routes.\n"
      + "Usage: node scripts/hosted-judge-smoke.mjs --origin https://judge.example.test\n");
    return 0;
  }
  const evidence = await checkHostedJudge(options.origin);
  const directory = join(root, ".data", "hosted-judge-smoke",
    "run-" + new Date().toISOString().replace(/[:.]/gu, "-") + "-" + process.pid);
  mkdirSync(directory, { recursive: true });
  const evidencePath = join(directory, "evidence.json");
  writeFileSync(evidencePath, JSON.stringify({
    ...evidence, checkedAt: new Date().toISOString(),
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({
    schemaVersion, status: evidence.status, origin: evidence.origin,
    passed: evidence.checks.filter(item => item.status === "passed").length,
    total: evidence.checks.length,
    failedChecks: evidence.checks.filter(item => item.status === "failed").map(item => item.id),
    evidencePath,
  }, null, 2) + "\n");
  return evidence.status === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
