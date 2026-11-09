#!/usr/bin/env node
/** Fail-closed, offline guard for a restricted Cloudflare judge preview deployment. */
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaVersion = "rightsreceipt-judge-deploy-preflight-v1";
const expectedVars = Object.freeze({
  "APP_MODE": "judge",
  "PAYPAL_WEBHOOK_INTAKE_ENABLED": "false",
  "PAYPAL_WEBHOOK_PROCESSING_ENABLED": "false",
  "PAYPAL_RECONCILIATION_ENABLED": "false",
  "PAYPAL_PERMISSION_LIFECYCLE_ENABLED": "false",
  "RIGHTS_RECEIPT_ISSUANCE_ENABLED": "false",
  "RIGHTS_PERMISSION_CLOCK_ENABLED": "false",
  "RIGHTS_RECEIPT_READ_ENABLED": "true",
  "HUMAN_CONSENT_ENABLED": "true",
  "RIGHTS_INVOICE_CREATION_ENABLED": "false",
  "RIGHTS_INVOICE_SENDING_ENABLED": "false",
  "CREATOR_ACCESS_ENABLED": "false",
  "CREATOR_ACCESS_ORIGIN": "",
  "CREATOR_ACCESS_ISSUER": "",
  "CREATOR_ACCESS_AUDIENCE": "",
  "CREATOR_ACCESS_PRINCIPALS": "[]",
  "CREATOR_REVIEW_ENABLED": "false",
  "BUYER_REVIEW_ENABLED": "false",
  "BUYER_PAYMENT_ENABLED": "false",
  "CLARIFICATION_ENABLED": "true",
  "REQUEST_INTAKE_ENABLED": "true",
  "RIGHTS_INVOICE_CONTROLS_ENABLED": "false",
  "INVOICE_RECOVERY_ENABLED": "false",
  "PAYPAL_SANDBOX_MERCHANT_NAME": "",
  "PAYPAL_SANDBOX_MERCHANT_EMAIL": "",
  "PAYPAL_MODE": "paypal_sandbox",
  "PAYPAL_BASE_URL": "https://api-m.sandbox.paypal.com"
});
const workerFirstRoutes = Object.freeze([
  "/api/*",
  "/request/*",
  "/health",
  "/judge",
  "/webhooks/*",
  "/verify/receipt/*",
  "/receipts/buyer",
  "/assets/receipt-access.js",
  "/creator/review/*",
  "/assets/creator-review.js",
  "/buyer/review",
  "/assets/buyer-review.js",
  "/buyer/clarification",
  "/creator/clarification/*",
  "/assets/buyer-clarification.js",
  "/assets/creator-clarification.js",
  "/buyer/request",
  "/creator/requests/*",
  "/assets/buyer-request-intake.js",
  "/assets/creator-request-intake.js"
]);
const topKeys = new Set([
  "$schema", "name", "main", "compatibility_date", "compatibility_flags",
  "upload_source_maps", "vars", "assets", "observability", "workers_dev", "d1_databases",
]);
const shaLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function safeOrigin(input) {
  if (typeof input !== "string" || input.length < 12 || input.length > 200) return false;
  try {
    const u = new URL(input), host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.origin !== input || u.username || u.password
      || u.search || u.hash || u.port || u.pathname !== "/"
      || !/^[a-z0-9.-]+$/u.test(host) || host.includes("..")
      || host.startsWith("-") || host.endsWith("-") || !host.includes(".")
      || host.includes("example") || host.includes("replace")
      || /(?:^|\.)(?:localhost|local|internal|invalid|test|onion)$/u.test(host)
      || /^([0-9]+\.){3}[0-9]+$/u.test(host) || host.startsWith("xn--")) return false;
    return true;
  } catch { return false; }
}

/** Checks only an explicitly restricted preview. This is not a proof of deployment. */
export function evaluateJudgeConfig(config) {
  const problems = new Set();
  if (!record(config)) {
    problems.add("config_invalid");
  } else {
    if (Object.keys(config).some(key => !topKeys.has(key))
      || config.workers_dev !== true) problems.add("unexpected_exposure_setting");
    if (config.name !== "rightsreceipt-judge"
      || config.main !== "./apps/api/src/worker.ts") problems.add("worker_target_invalid");
    if (config["$schema"] !== "./node_modules/wrangler/config-schema.json"
      || config.compatibility_date !== "2026-10-25"
      || JSON.stringify(config.compatibility_flags) !== JSON.stringify(["nodejs_compat"])
      || config.upload_source_maps !== true
      || !record(config.observability) || config.observability.enabled !== false
      || Object.keys(config.observability ?? {}).length !== 1) problems.add("worker_runtime_invalid");
    if (!record(config.assets)
      || config.assets.directory !== "./dist/client"
      || config.assets.binding !== "ASSETS"
      || config.assets.not_found_handling !== "single-page-application"
      || JSON.stringify(config.assets.run_worker_first) !== JSON.stringify(workerFirstRoutes)
      || Object.keys(config.assets).length !== 4) problems.add("asset_routes_invalid");

    const dbs = config.d1_databases;
    const db = Array.isArray(dbs) && dbs.length === 1 ? dbs[0] : null;
    if (!record(db) || db.binding !== "DB" || db.database_name !== "rightsreceipt-judge"
      || db.migrations_dir !== "migrations" || db.migrations_table !== "d1_migrations"
      || typeof db.database_id !== "string" || !shaLikeUuid.test(db.database_id)
      || db.database_id === "00000000-0000-0000-0000-000000000000"
      || Object.keys(db).some(key => !["binding","database_name","database_id","migrations_dir","migrations_table"].includes(key))) {
      problems.add("d1_binding_invalid");
    }

    const vars = config.vars;
    if (!record(vars)) {
      problems.add("variables_invalid");
    } else {
      const actualKeys = Object.keys(vars).sort();
      const allowedKeys = [...Object.keys(expectedVars), "RIGHTS_RECEIPT_PUBLIC_ORIGIN", "HUMAN_CONSENT_ORIGIN"].sort();
      if (JSON.stringify(actualKeys) !== JSON.stringify(allowedKeys)
        || Object.keys(expectedVars).some(key => vars[key] !== expectedVars[key])) problems.add("variables_invalid");
      if (!safeOrigin(vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN)) problems.add("judge_origin_invalid");
      if (!safeOrigin(vars.HUMAN_CONSENT_ORIGIN)
        || vars.HUMAN_CONSENT_ORIGIN !== vars.RIGHTS_RECEIPT_PUBLIC_ORIGIN) problems.add("consent_origin_invalid");
    }
  }
  const errorCodes = [...problems].sort();
  return {
    schemaVersion, status: errorCodes.length === 0 ? "passed" : "failed", errorCodes,
    limitation: "Static restricted-preview configuration check only. No Cloudflare, D1, PayPal, browser or release verification was performed.",
  };
}
export function checkedConfigPath(path) {
  if (!["wrangler.jsonc", "wrangler.judge.local.jsonc"].includes(path)) throw new Error("invalid_path");
  return join(root, path);
}
export function main(rawArgs = process.argv.slice(2)) {
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.length === 1 && ["--help","-h"].includes(args[0])) {
    process.stdout.write("Usage: node scripts/judge-deploy-preflight.mjs --config wrangler.judge.local.jsonc\n");
    return 0;
  }
  if (args.length !== 2 || args[0] !== "--config") {
    process.stderr.write("Provide one explicit --config file. No deployment attempted.\n");
    return 2;
  }
  let result;
  try {
    const path = checkedConfigPath(args[1]);
    const meta = lstatSync(path);
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size === 0 || meta.size > 32 * 1024) throw new Error("unsafe_file");
    result = evaluateJudgeConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    result = {schemaVersion, status:"failed", errorCodes:["config_unavailable"],
      limitation:"The explicit judge configuration was unreadable or invalid. No deployment attempted."};
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
