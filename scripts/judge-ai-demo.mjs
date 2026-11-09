#!/usr/bin/env node
/** Real, local, read-only classifier + source-span diagnostic on authored synthetic requests. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_REQUEST = [
  'This is commercial promotional use.', 'Paid Facebook and Instagram posts.',
  'We will pay for sponsored advertisements.', 'Territory is the US and Canada.',
  'Start the license on 2026-11-15.', 'Duration: 90 days.',
  'No more than 500000 impressions.', 'We want nonexclusive permission.',
  'Only crop adjustments are permitted.', 'Attribution is required.',
  'Sublicensing is prohibited.', 'AI model training is forbidden.',
].join(' ');
const CASES = Object.freeze([
  ['complete', SAMPLE_REQUEST],
  ['contradictory', SAMPLE_REQUEST.replace('Territory is the US and Canada.',
    'Target the US and Canada. Rights should be for Germany only.')],
]);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const allowedState = new Set(['resolved', 'unresolved', 'contradictory', 'unsupported']);
const FIELDS = ['use_purpose', 'channels', 'paid_advertising', 'territories', 'start_date',
  'duration_days', 'max_impressions', 'exclusivity', 'modification_scope', 'attribution',
  'sublicensing', 'ai_use'];
const CSS = `:root{color-scheme:dark;font:16px/1.55 system-ui,sans-serif;background:#10201f;color:#f1f7f2}
*{box-sizing:border-box}body{margin:0}main{max-width:1060px;margin:auto;padding:36px 24px 70px}
h1{font-size:clamp(2rem,5vw,3rem);line-height:1.12;margin:0 0 16px}h2{margin-top:32px}
a{color:#b0efcb}a:focus-visible{outline:3px solid #ffdc82;outline-offset:3px}
.notice{background:#32291c;border-left:4px solid #edbe65;padding:18px;margin:26px 0}
.conflict{border:2px solid #edbe65;border-radius:12px;padding:16px;margin:18px 0;background:#2d281a}.conflict strong{display:block;color:#ffe1a1}
.request{white-space:pre-wrap;overflow-wrap:anywhere;background:#1b3533;border:1px solid #47625b;padding:16px;border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;vertical-align:top;padding:11px;border-bottom:1px solid #426058}
th{color:#b2e8ce}td:first-child{font-weight:700}code{overflow-wrap:anywhere}
.small{color:#c1d7c9;font-size:.9rem}section{margin-top:40px}footer{border-top:1px solid #426058;padding-top:22px;margin-top:35px}
@media(max-width:650px){main{padding:22px 12px}table{display:block;overflow-x:auto}th,td{min-width:150px}}`;
const escapeHtml = input => String(input).replace(/[&<>"']/gu,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const format = value => value === null ? 'none' : typeof value === 'string' ? value : JSON.stringify(value);
const displayEvidence = (text, observation) => {
  if (!Array.isArray(observation.evidenceSpans) || observation.evidenceSpans.length === 0) return 'not stated';
  return observation.evidenceSpans.map(span => {
    if (!Number.isInteger(span.startUtf16) || !Number.isInteger(span.endUtf16)
      || span.startUtf16 < 0 || span.endUtf16 > text.length || span.endUtf16 <= span.startUtf16) {
      throw Error('invalid_source_span');
    }
    return text.slice(span.startUtf16, span.endUtf16);
  }).join(' / ');
};

/** Render only bounded project-authored cases and authority-free diagnostics. */
export function renderJudgeAiDemo({ modelId, modelVersion, artifactSha256, cases }) {
  if (!Array.isArray(cases) || cases.length !== 2 || cases.some(c => c.rows.length !== 12)) {
    throw Error('invalid_diagnostic');
  }
  const sections = cases.map(({ name, text, rows }) => `<section aria-label="${escapeHtml(name)} request">
<h2>${name === 'complete' ? 'Explicit synthetic request' : 'Contradictory synthetic request'}</h2>
<p class="small">The same frozen request is used for both methods. Disagreements require human review, not automatic resolution.</p>
<div class="request">${escapeHtml(text)}</div>${name === 'contradictory' ? `<div class="conflict" role="note"><strong>Conflicting territories: human decision required</strong><p>This synthetic request says both US and Canada and Germany only. Those statements conflict about the permitted territories. The learned model may still suggest US and Canada as resolved. A suggested label is not proof that contradictory terms were agreed. The creator must resolve the conflict before licensing.</p></div>` : ''}<table><thead><tr><th scope="col">Right</th><th scope="col">Source-backed rule</th><th scope="col">Actual learned suggestion</th></tr></thead><tbody>
${rows.map(row => `<tr><td>${escapeHtml(row.fieldName)}</td><td>${escapeHtml(row.ruleState)}: ${escapeHtml(format(row.ruleValue))}<div class="small">Evidence: ${escapeHtml(row.evidence)}</div></td><td>${escapeHtml(row.modelState)}: ${escapeHtml(format(row.modelValue))}<div class="small">Read-only, uncalibrated</div></td></tr>`).join('\n')}
</tbody></table></section>`).join('\n');
  const hash = createHash('sha256').update(CSS).digest('base64');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'">
<title>Actual local AI diagnostic | RightsReceipt</title><style>${CSS}</style></head><body><main>
<a href="/">Back to licensing rehearsal</a><h1>Actual local model, no payment authority.</h1>
<p>This page runs the SHA-256-verified locally trained lexical classifier and the independent source-span extractor on project-authored synthetic text. It is not a static mockup.</p>
<div class="notice"><strong>Human review required.</strong> Classifier margins are not calibrated probabilities. A resolved suggestion may be incorrect, especially on contradictory wording. Neither method can approve rights, set prices, verify PayPal payment or activate a license. The separate transaction rehearsal uses injected PayPal replies.</div>
<p class="small">Model: <code>${escapeHtml(modelId)}</code> (${escapeHtml(modelVersion)}). Verified artifact SHA-256: <code>${escapeHtml(artifactSha256)}</code>.</p>
${sections}<footer>RightsReceipt local AI diagnostic. No credentials, user data, paid API, network request or production financial operation is needed.</footer>
</main></body></html>`;
}

/** No provider access, user input, payment state, file writes or network requests. */
export async function runJudgeAiDemo({ artifactText, trainingReport, loadModel, extract } = {}) {
  const original = artifactText ?? readFileSync(new URL('../data/model/v1/artifact.json', import.meta.url), 'utf8');
  const training = trainingReport ?? JSON.parse(readFileSync(new URL('../data/model/v1/training-report.json', import.meta.url), 'utf8'));
  const expected = training?.trainingArtifactSha256;
  if (typeof original !== 'string' || original.length > 1_000_000
    || typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)
    || sha256(original) !== expected) throw Error('model_integrity_invalid');
  // Bind the displayed model identity to the exact SHA-checked artifact, not
  // to a later, unvalidated predictor call.
  let identity;
  try {
    const artifact = JSON.parse(original);
    if (typeof artifact?.modelId !== 'string' || !artifact.modelId || artifact.modelId.length > 120
      || typeof artifact?.modelVersion !== 'string' || !artifact.modelVersion
      || artifact.modelVersion.length > 120) throw Error('invalid_identity');
    identity = { modelId: artifact.modelId, modelVersion: artifact.modelVersion };
  } catch { throw Error('model_integrity_invalid'); }
  const loader = loadModel ?? (await import('../packages/ai-runtime/src/portable-model.ts')).loadVerifiedPortableModel;
  const extractor = extract ?? (await import('../packages/ai-runtime/src/deterministic-rules.ts')).extractDeterministicFields;
  const model = await loader(original, expected);
  const cases = CASES.map(([name, text]) => {
    if (name === 'contradictory' && (!text.includes('US and Canada') || !text.includes('Germany only'))) {
      throw Error('contradictory_fixture_invalid');
    }
    const result = model.predict(text), observations = extractor(text);
    if (result?.modelId !== identity.modelId || result?.modelVersion !== identity.modelVersion) {
      throw Error('model_identity_invalid');
    }
    if (result.status !== 'uncalibrated_review_only' || result.reviewRequired !== true
      || result.quoteEligible !== false || result.permittedActions?.length !== 0
      || result.artifactSha256 !== expected || !Array.isArray(result.fields)
      || result.fields.length !== 12 || !Array.isArray(observations) || observations.length !== 12) {
      throw Error('model_authority_invalid');
    }
    const rows = FIELDS.map((fieldName, index) => {
      const learned = result.fields[index], rule = observations[index];
      if (learned?.fieldName !== fieldName || rule?.fieldName !== fieldName
        || !allowedState.has(learned.label?.resolutionState)
        || !allowedState.has(rule.resolutionState) || learned.confidenceBasisPoints !== null
        || learned.evidenceSpans?.length !== 0) throw Error('model_result_invalid');
      return { fieldName, modelState: learned.label.resolutionState, modelValue: learned.label.normalizedValue,
        ruleState: rule.resolutionState, ruleValue: rule.normalizedValue,
        evidence: displayEvidence(text, rule) };
    });
    return { name, text, rows };
  });
  return { html: renderJudgeAiDemo({ modelId: identity.modelId,
    modelVersion: identity.modelVersion, artifactSha256: expected, cases }),
    modelSha256: expected, caseCount: cases.length, fieldCount: 12 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    process.stdout.write('Usage: node --experimental-strip-types scripts/judge-ai-demo.mjs\nActual, read-only local model on synthetic text. No PayPal or network.\n');
  } else if (process.argv.length !== 2) process.exitCode = 2;
  else try { process.stdout.write((await runJudgeAiDemo()).html); }
  catch { process.stderr.write('Local AI diagnostic unavailable. Verify bundled model artifacts and Node 22.\n'); process.exitCode = 1; }
}
