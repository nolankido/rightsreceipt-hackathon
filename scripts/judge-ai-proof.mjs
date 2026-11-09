#!/usr/bin/env node
/** Dependency-free read-only proof of the bundled model's executable judge diagnostic. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJudgeAiDemo } from './judge-ai-demo.mjs';

const SCHEMA = 'rightsreceipt-local-ai-proof-v1';
const SHA256 = /^[a-f0-9]{64}$/u;

function invalid() {
  return Object.assign(new Error('Local AI diagnostic proof failed.'), { code: 'ai_proof_invalid' });
}

/** The actual runner verifies model artifact bytes and computes real predictions. */
export function evaluateJudgeAiProof(result) {
  const html = result?.html;
  const hash = result?.modelSha256;
  if (!SHA256.test(hash ?? '') || result?.caseCount !== 2 || result?.fieldCount !== 12
    || typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 131072
    || !html.includes('<title>Actual local AI diagnostic | RightsReceipt</title>')
    || !html.includes(`Verified artifact SHA-256: <code>${hash}</code>`)
    || !html.includes('Explicit synthetic request')
    || !html.includes('Contradictory synthetic request')
    || !html.includes('Conflicting territories: human decision required')
    || !html.includes('Classifier margins are not calibrated probabilities.')
    || (html.match(/<tr><td>/gu) ?? []).length !== 24) throw invalid();

  return Object.freeze({
    schemaVersion: SCHEMA,
    status: 'passed',
    modelArtifactSha256: hash,
    syntheticRequestCount: 2,
    evaluatedRightsFields: 24,
    contradictionWarningVisible: true,
    modelExecution: 'real_local_inference',
    paymentEvidence: 'none',
    limitation: 'Synthetic model demonstration only. No rights approval, real-world model calibration or PayPal payment is established.',
  });
}

export async function runJudgeAiProof({ runner = runJudgeAiDemo } = {}) {
  if (typeof runner !== 'function') throw invalid();
  return evaluateJudgeAiProof(await runner());
}

export async function main(args = process.argv.slice(2), write = text => process.stdout.write(text)) {
  if (args.length !== 0) {
    write(JSON.stringify({ schemaVersion: SCHEMA, status: 'failed', code: 'ai_proof_args_invalid' }) + '\n');
    return 2;
  }
  try {
    write(JSON.stringify(await runJudgeAiProof()) + '\n');
    return 0;
  } catch {
    // No model data, request text, local paths or exception details escape.
    write(JSON.stringify({ schemaVersion: SCHEMA, status: 'failed', code: 'ai_proof_invalid' }) + '\n');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
