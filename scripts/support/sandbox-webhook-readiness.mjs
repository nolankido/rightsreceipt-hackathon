/** Read-only registered webhook readiness for the SAME PayPal Sandbox REST app as invoicing. */
import { createHash } from "node:crypto";
import { confirmSandboxCallback } from "./sandbox-webhook-callback.mjs";
import { expectedSandboxWebhookUrl } from "./sandbox-webhook-target.mjs";
import { verifyLocalSandboxCollector } from "./sandbox-webhook-local-health.mjs";

const ORIGIN = "https://api-m.sandbox.paypal.com";
const EVENT = "INVOICING.INVOICE.PAID";
const OAUTH = ORIGIN + "/v1/oauth2/token";
const LIST = ORIGIN + "/v1/notifications/webhooks";
const MAX_JSON = 64 * 1024;

function failure(code) {
  return Object.assign(new Error("PayPal Sandbox webhook preflight did not pass."), { code });
}
function required(env, name) {
  const value = env?.[name];
  // eslint-disable-next-line no-control-regex -- Reject ASCII control characters in required webhook configuration.
  if (typeof value !== "string" || !value || value !== value.trim() || /[\x00-\x1f\x7f]/u.test(value)) {
    throw failure("webhook_preflight_configuration_missing");
  }
  return value;
}
function publicHttpsListener(input) {
  if (typeof input !== "string" || input.length > 2048) return false;
  let url;
  try { url = new URL(input); } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || !/^[a-z0-9.-]+$/u.test(host) || !host.includes(".") || host.includes("..")
    || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host.endsWith(".internal") || host.endsWith(".invalid") || host.endsWith(".test")
    || host.endsWith(".example") || host === "example.com" || host.endsWith(".example.com")
    || /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(host) || url.pathname === "/") return false;
  return true;
}
async function boundedJson(response) {
  if (!(response instanceof Response) || response.redirected || response.status !== 200
    || !/^application\/json(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) {
    throw failure("webhook_preflight_response_invalid");
  }
  if (response.url && ![OAUTH, LIST].includes(response.url)) throw failure("webhook_preflight_response_invalid");
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/u.test(length) || Number(length) > MAX_JSON)) {
    throw failure("webhook_preflight_response_invalid");
  }
  if (!response.body) throw failure("webhook_preflight_response_invalid");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON) {
        void reader.cancel().catch(() => {});
        throw failure("webhook_preflight_response_invalid");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error?.code === "webhook_preflight_response_invalid") throw error;
    throw failure("webhook_preflight_response_invalid");
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw failure("webhook_preflight_response_invalid"); }
}
async function request(fetchImpl, url, init) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(8_000) });
  } catch { throw failure("webhook_preflight_transport_unavailable"); }
  return boundedJson(response);
}

/** No invoices, webhooks, payment operations, registration changes or secrets are written. */
export async function verifySandboxWebhookRegistration({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const clientId = required(env, "PAYPAL_SANDBOX_CLIENT_ID");
  const secret = required(env, "PAYPAL_SANDBOX_CLIENT_SECRET");
  const webhookId = required(env, "PAYPAL_SANDBOX_WEBHOOK_ID");
  // Use either the existing explicit callback URL or a derived one-shot
  // callback from an owned private route file. Both fail before Sandbox OAuth.
  const expectedCallback = expectedSandboxWebhookUrl(env);
  // Only the private-file collector mode needs loopback liveness. A stopped
  // local collector must be rejected before we request a Sandbox OAuth token.
  const collector = env.PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE === undefined
    ? null : await verifyLocalSandboxCollector(env.PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE);
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(webhookId) || webhookId === "WEBHOOK_ID") {
    throw failure("webhook_preflight_configuration_invalid");
  }
  if (typeof fetchImpl !== "function") throw failure("webhook_preflight_transport_unavailable");
  const token = await request(fetchImpl, OAUTH, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(clientId + ":" + secret).toString("base64"),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (token?.token_type !== "Bearer" || typeof token.access_token !== "string"
    || token.access_token.length < 1 || token.access_token.length > 4096
    || /\s/u.test(token.access_token)) throw failure("webhook_preflight_oauth_invalid");
  const inventory = await request(fetchImpl, LIST, {
    method: "GET",
    headers: { Authorization: "Bearer " + token.access_token, Accept: "application/json" },
  });
  if (!Array.isArray(inventory?.webhooks) || inventory.webhooks.length > 50) {
    throw failure("webhook_preflight_response_invalid");
  }
  const matches = inventory.webhooks.filter(item => item?.id === webhookId);
  if (matches.length !== 1) throw failure("webhook_preflight_registration_missing");
  const registered = matches[0];
  if (!publicHttpsListener(registered.url)) throw failure("webhook_preflight_listener_invalid");
  const callback = confirmSandboxCallback(registered.url, expectedCallback);
  const subscribed = Array.isArray(registered.event_types) && registered.event_types.some(event =>
    [EVENT, "*"].includes(event?.name) && event?.status !== "DISABLED");
  if (!subscribed) throw failure("webhook_preflight_subscription_missing");
  return Object.freeze({
    schemaVersion: "rightsreceipt-sandbox-webhook-readiness-v1", status: "passed",
    environment: "sandbox", subscribedEvent: EVENT, webhookIdSha256: createHash("sha256").update(webhookId).digest("hex"),
    exactCallbackChecked: callback.exactCallbackChecked,
    localCollectorReady: collector?.localCollectorReady ?? null,
    note: "Authenticated exact callback and paid-event registration check for the invoicing REST app. Does not establish listener reachability, signed delivery or payment.",
  });
}
