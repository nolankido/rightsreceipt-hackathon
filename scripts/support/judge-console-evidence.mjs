/** Minimum real-journey evidence contract for the local judge-facing console.
 * This checks outcome consistency, not cryptographic provenance or PayPal payment.
 */
const SCENARIOS = Object.freeze(['ordinary', 'recovery', 'repeat']);
const HASH = /^[a-f0-9]{64}$/u;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;

/** The UI may not announce success from a passed flag and array counts alone. */
export function judgeConsoleEvidenceValid(value) {
  if (!record(value) || value.schemaVersion !== 'judge-rehearsal-v1'
    || value.mode !== 'local_injected' || value.status !== 'passed'
    || !HASH.test(value.sourceFingerprint ?? '')
    || !record(value.baseline) || value.baseline.migrationCount !== 9
    || value.baseline.domainTableCount !== 33 || !record(value.baseline.rows)
    || value.isolation?.database !== 'memory'
    || value.isolation?.externalRequests !== 0
    || value.isolation?.credentialsUsed !== false
    || value.repeatability?.ordinaryMatchesRepeat !== true
    || !HASH.test(value.repeatability?.normalizedOutcomeSha256 ?? '')
    || !Array.isArray(value.scenarios) || value.scenarios.length !== 3
    || !Array.isArray(value.resets) || value.resets.length !== 3) return false;

  const before = value.baseline.rows;
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = value.scenarios[i], reset = value.resets[i];
    const summary = scenario?.summary;
    if (!record(scenario) || scenario.id !== SCENARIOS[i]
      || scenario.status !== 'passed' || !Array.isArray(scenario.steps)
      || scenario.steps.length < 1 || !record(summary)
      || summary.quoteCents !== 42500 || summary.currency !== 'USD'
      || summary.permissionState !== 'scheduled'
      || summary.receiptIntegrity !== 'verified'
      || summary.receiptRevision !== 1
      || summary.foreignKeys !== 'ok' || summary.integrity !== 'ok'
      || !record(summary.providerCalls) || summary.providerCalls.create !== 1
      || summary.providerCalls.send !== 1 || !positive(summary.providerCalls.get)
      || !record(reset) || reset.afterScenario !== SCENARIOS[i]
      || reset.baselineMatches !== true || reset.transactionsCleared !== true
      || reset.oldCapabilityDenied !== true || reset.oldReceiptDenied !== true
      || reset.oldCreatorCaseDenied !== true || !record(reset.rowsAfter)
      || Object.keys(reset.rowsAfter).length !== Object.keys(before).length
      || Object.keys(before).some(key => reset.rowsAfter[key] !== before[key])) return false;
  }
  return true;
}
