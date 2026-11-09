/** Release-time inspection of the actual local judge rehearsal artifacts.
 * This confirms internal result consistency, never provider origin or an external payment.
 */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { judgeConsoleEvidenceValid } from './judge-console-evidence.mjs';
import { projectJudgeRehearsalReport, renderJudgeRehearsalReport, serializeJudgeRehearsalReport } from './judge-rehearsal-report.mjs';

const SHA = /^[a-f0-9]{40}$/u;
const NODE = /^22\.(?:1[3-9]|[2-9]\d)\.\d+$/u;
const LIMIT = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

function safeText(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > LIMIT) return null;
  return decoder.decode(readFileSync(path));
}

/** The full release verifier must fail closed before recording a passing status. */
export function releaseJudgeGate(runDirectory, commit, node) {
  return releaseJudgeEvidenceValid(join(runDirectory, 'judge'), { commit, node });
}

/** Require the two real run products, source identity and verified three-journey result. */
export function releaseJudgeEvidenceValid(directory, { commit, node } = {}) {
  if (typeof directory !== 'string' || !SHA.test(commit ?? '') || !NODE.test(node ?? '')) return false;
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    // judge-rehearsal.mjs always creates an owned run-* directory under --output.
    const runs = readdirSync(directory);
    if (runs.length !== 1 || !/^run-[A-Za-z0-9_-]{6}$/u.test(runs[0])) return false;
    const run = join(directory, runs[0]);
    const runStat = lstatSync(run);
    if (!runStat.isDirectory() || runStat.isSymbolicLink()) return false;
    const entries = readdirSync(run).sort();
    if (entries.length !== 2 || entries[0] !== 'evidence.json' || entries[1] !== 'report.html') return false;
    const json = safeText(join(run, 'evidence.json'));
    const html = safeText(join(run, 'report.html'));
    if (json === null || html === null) return false;
    // The console's minimum contract alone accepts abbreviated traces. The release
    // must pass the same closed, step-by-step semantic validator as the producer.
    const evidence = projectJudgeRehearsalReport(JSON.parse(json));
    if (json !== serializeJudgeRehearsalReport(evidence)
      || !judgeConsoleEvidenceValid(evidence) || evidence.sourceRevision !== commit
      || evidence.sourceClean !== true || evidence.runtime !== 'v' + node) return false;
    // The release must publish the report actually derived from the validated
    // evidence, not an edited page that merely retains a few expected phrases.
    if (html !== renderJudgeRehearsalReport(evidence)) return false;
    return html.includes('<title>Local judge rehearsal | RightsReceipt</title>')
      && html.includes('The local rehearsal passed.')
      && html.includes('LOCAL EVIDENCE ONLY')
      && html.includes('PayPal HTTP and the managed gateway are simulated locally.')
      && html.includes(commit) && html.includes(evidence.sourceFingerprint);
  } catch { return false; }
}
