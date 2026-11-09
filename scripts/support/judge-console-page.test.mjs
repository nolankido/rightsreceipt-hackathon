import test from 'node:test';
import assert from 'node:assert/strict';
import { renderJudgeConsolePage, judgeConsoleStylePolicy } from './judge-console-page.mjs';

const token = 'a'.repeat(48);
const nonce = 'b'.repeat(32);
const ready = () => ({ token, nonce, state: { count: 0, running: false, result: null } });

test('ready page makes local simulation and human authority obvious', () => {
  const html = renderJudgeConsolePage(ready());
  assert.match(html, /Simulated payment only\./u);
  assert.match(html, /injected PayPal-like/u);
  assert.match(html, /Within this transaction rehearsal, no live AI inference, real PayPal payment/u);
  assert.match(html, /read-only AI diagnostic below executes the trained model/u);
  assert.match(html, /href="\/model"/u);
  assert.match(html, /Human approval/uim);
  assert.match(html, /USD 425\.00/u);
  assert.match(html, /Harbor After Rain/u);
  assert.match(html, /The generated transaction report is not genuine Sandbox acceptance evidence/u);
  assert.match(html, /final release also requires separate genuine PayPal Sandbox evidence/u);
});
test('existing form and token contract are preserved exactly', () => {
  const html = renderJudgeConsolePage(ready());
  assert.match(html, /<form method="post" action="\/run">/u);
  assert.match(html, new RegExp(`name="token" value="${token}"`));
  assert.match(html, /<button class="run" type="submit">Run application rehearsal<\/button>/u);
  assert.doesNotMatch(html, /href="\/report"/u);
  assert.doesNotMatch(html, /href="\/evidence"/u);
});
test('after a passing run, the report and JSON evidence become accessible', () => {
  const args = ready();args.state.count=1;args.state.result={ report: 'private', evidence: 'private' };
  const html=renderJudgeConsolePage(args);
  assert.match(html, /Local rehearsal passed\./u);
  assert.match(html, /href="\/report"/u);
  assert.match(html, /href="\/evidence"/u);
  assert.doesNotMatch(html, /report: private/u);
  assert.doesNotMatch(html, /http-equiv="refresh"/u);
});
test('busy state disables duplicate submissions and shows live status', () => {
  const args=ready();args.state.running=true;
  const html=renderJudgeConsolePage(args);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /Rehearsal running\./u);
  assert.match(html, /<meta http-equiv="refresh" content="2">/u);
  assert.match(html, /Checking the result every two seconds\./u);
  assert.doesNotMatch(html, /href="\/(?:report|evidence)"/u);
  assert.match(html, /type="submit" disabled/u);
});
test('five-run limit is reflected in server-rendered controls', () => {
  const args=ready();args.state.count=5;
  const html=renderJudgeConsolePage(args);
  assert.match(html, /type="submit" disabled/u);
  assert.match(html, /5 of 5/u);
});
test('failed runs do not offer previous successful artifacts', () => {
  const args=ready();args.state.count=1;args.state.result=null;
  const html=renderJudgeConsolePage(args);
  assert.match(html, /last rehearsal failed/u);
  assert.doesNotMatch(html, /http-equiv="refresh"/u);
  assert.doesNotMatch(html, /href="\/report"/u);
});
test('style nonce is required and compatible with restrictive CSP', () => {
  const csp=judgeConsoleStylePolicy(nonce);
  assert.equal(csp,`default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
  assert.match(renderJudgeConsolePage(ready()), new RegExp(`<style nonce="${nonce}">`));
  for(const invalid of ['nonce', 'b'.repeat(33), 'b"onclick=', null]) {
    assert.throws(()=>judgeConsoleStylePolicy(invalid), /invalid_style_nonce/u);
  }
});
test('page is accessible and responsive without external assets or executable scripts', () => {
  const html=renderJudgeConsolePage(ready());
  assert.match(html, /<main class="wrap"/u);
  assert.match(html, /<ol class="steps">/u);
  assert.match(html, /@media\(max-width:480px\)/u);
  assert.match(html, /focus-visible/u);
  assert.match(html, /aria-labelledby="page-title"/u);
  assert.doesNotMatch(html, /<script|<iframe|<img|https?:\/\//iu);
});
test('rejects malformed token or page state rather than interpolating it into HTML', () => {
  const args=ready();args.token='<script>'.padEnd(48, 'a');
  assert.throws(()=>renderJudgeConsolePage(args),/invalid_page_state/u);
  const invalid=ready();invalid.state.count=6;
  assert.throws(()=>renderJudgeConsolePage(invalid),/invalid_page_state/u);
});
