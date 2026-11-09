/** Runtime attestation for the strictly limited public judge preview. Never exposes env values. */
const schemaVersion = "rightsreceipt-judge-runtime-profile-v1";
const routePath = "/api/judge/runtime-profile";

// Pinned against wrangler.judge.example.jsonc by judge-runtime-profile-local.test.mjs.
export const RESTRICTED_JUDGE_VARS: Readonly<Record<string, string>> = Object.freeze({
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
  "PAYPAL_BASE_URL": "https://api-m.sandbox.paypal.com",
});
const allowedKeys = [...Object.keys(RESTRICTED_JUDGE_VARS),
  "RIGHTS_RECEIPT_PUBLIC_ORIGIN", "HUMAN_CONSENT_ORIGIN", "ASSETS", "DB"].sort();
const headers = {
  "Cache-Control": "private, no-store",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; style-src 'none'; img-src 'none'; "
    + "base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function restrictedJudgeRuntime(env: unknown, origin: string): boolean {
  if (!record(env) || !origin.startsWith("https://")
    || JSON.stringify(Object.keys(env).sort()) !== JSON.stringify(allowedKeys)) return false;
  if (Object.entries(RESTRICTED_JUDGE_VARS).some(([key, value]) => env[key] !== value)) return false;
  if (env.RIGHTS_RECEIPT_PUBLIC_ORIGIN !== origin || env.HUMAN_CONSENT_ORIGIN !== origin) return false;
  if (!record(env.DB) || typeof env.DB.prepare !== "function"
    || !record(env.ASSETS) || typeof env.ASSETS.fetch !== "function") return false;
  return true;
}

function json(body: object, status: number, allow?: string): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8",
      ...(allow ? { Allow: allow } : {}) },
  });
}

export function createJudgeRuntimeProfileRoute() {
  return (request: Request, env: unknown): Response | null => {
    const url = new URL(request.url);
    if (url.pathname !== routePath) return null;
    if (url.search) return json({ error: "invalid_request" }, 400);
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, "GET");
    if (!restrictedJudgeRuntime(env, url.origin)) {
      return json({ schemaVersion, status: "unavailable" }, 503);
    }
    return json({ schemaVersion, status: "restricted", mode: "judge", bindings: "present" }, 200);
  };
}
