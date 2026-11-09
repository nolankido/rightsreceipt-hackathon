/** Synthetic, non-payment data for local judge console regression tests only. */
export function judgeConsoleEvidenceFixture() {
  const ids = ['ordinary', 'recovery', 'repeat'];
  return {
    schemaVersion: 'judge-rehearsal-v1', mode: 'local_injected', status: 'passed',
    sourceFingerprint: 'a'.repeat(64),
    baseline: { migrationCount: 9, domainTableCount: 33, rows: { assets: 1, permissions: 0 } },
    scenarios: ids.map(id => ({ id, status: 'passed', steps: [{ id: 'baseline' }], summary: {
      quoteCents: 42500, currency: 'USD', permissionState: 'scheduled', receiptIntegrity: 'verified',
      receiptRevision: 1, foreignKeys: 'ok', integrity: 'ok',
      providerCalls: { oauth: 1, create: 1, send: 1, get: 1 },
    } })),
    resets: ids.map(afterScenario => ({ afterScenario, baselineMatches: true,
      transactionsCleared: true, oldCapabilityDenied: true, oldReceiptDenied: true,
      oldCreatorCaseDenied: true, rowsAfter: { assets: 1, permissions: 0 } })),
    isolation: { database: 'memory', externalRequests: 0, credentialsUsed: false },
    repeatability: { ordinaryMatchesRepeat: true, normalizedOutcomeSha256: 'b'.repeat(64) },
  };
}
