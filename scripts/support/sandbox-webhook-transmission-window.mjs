/**
 * Collection-stage timestamp screening only. Keep these bounds in step with
 * packages/paypal/src/webhook-intake.ts headersChecked, which performs the
 * later independently authenticated PayPal signature postback.
 *
 * PayPal may retry a failed delivery over three days. A five-minute past-age
 * limit in the unverified capture stage could discard an otherwise verifiable
 * retry before the actual PayPal verifier gets the event.
 */
export const SANDBOX_WEBHOOK_MAX_FUTURE_MS = 300_000;
export const SANDBOX_WEBHOOK_MAX_PAST_MS = 259_500_000;

export function acceptsSandboxWebhookTransmissionTime(value, now = Date.now()) {
  if (typeof value !== 'string' || !Number.isSafeInteger(now)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)) return false;
  const sent = Date.parse(value);
  if (!Number.isFinite(sent)
    || new Date(sent).toISOString().slice(0, 19) !== value.slice(0, 19)) return false;
  return sent <= now + SANDBOX_WEBHOOK_MAX_FUTURE_MS
    && now - sent <= SANDBOX_WEBHOOK_MAX_PAST_MS;
}
