/** Require the three offline acceptance records to describe one test transaction. */
const HASH = /^[a-f0-9]{64}$/u;
const PAID_EVENT = 'INVOICING.INVOICE.PAID';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** These checks are internal consistency tests, never independent PayPal proof. */
export function acceptanceLinkageErrors({ create, paid, webhook } = {}) {
  const failures = [];
  const registration = create?.webhookRegistration;
  if (!record(registration) || registration.status !== 'passed'
    || registration.subscribedEvent !== PAID_EVENT || registration.exactCallbackChecked !== true
    || !HASH.test(registration.webhookIdSha256 ?? '')) {
    failures.push('webhook_registration_not_proven');
  }
  if (!HASH.test(create?.stateSha256 ?? '')
    || !HASH.test(paid?.stateSha256 ?? '')
    || create.stateSha256 !== paid.stateSha256) {
    failures.push('invoice_state_identity_mismatch');
  }
  if (!HASH.test(registration?.webhookIdSha256 ?? '')
    || !HASH.test(webhook?.webhook?.webhookIdSha256 ?? '')
    || registration.webhookIdSha256 !== webhook.webhook.webhookIdSha256) {
    failures.push('webhook_registration_identity_mismatch');
  }
  return Object.freeze(failures);
}
