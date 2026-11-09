/** Dependency-free, accessible judge-console page. All controls remain server-rendered. */
const STYLE = `
:root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;background:#101c21;color:#eff7f4}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 85% 0%,#20443e 0%,#101c21 52%);min-height:100vh}
a{color:#9ee7cd;text-underline-offset:3px}a:hover{color:#d3ffe9}
a:focus-visible,button:focus-visible{outline:3px solid #f6c777;outline-offset:4px}
.wrap{max-width:1060px;padding:clamp(20px,4vw,48px);margin:auto}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #365451;padding-bottom:18px}
.brand{font-weight:800;letter-spacing:-.04em;font-size:1.3rem}.brand span{color:#86d4b5}
.eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.15em;font-weight:800;color:#a1d8c4}
.hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr);gap:36px;padding:56px 0 36px;align-items:start}
h1{font-size:clamp(2.3rem,5vw,4.25rem);letter-spacing:-.065em;line-height:1.06;margin:12px 0 22px;max-width:14ch}
.lead{font-size:1.08rem;color:#c5d8d0;line-height:1.7;max-width:62ch}
.notice{border:1px solid #d3ac64;border-left:5px solid #f0c878;border-radius:12px;background:#30291d;padding:20px;line-height:1.55}
.notice strong{display:block;color:#ffe3a9;margin-bottom:5px}.notice p{margin:0;color:#f5e9d3}
.panel{padding:28px;border:1px solid #375751;border-radius:18px;background:#192d2e}
.panel h2,.journeys h2{font-size:1.4rem;letter-spacing:-.03em;margin:0 0 12px}.panel p{color:#cadbd4;line-height:1.55}
.status{border-radius:10px;background:#233d3b;padding:12px 16px;font-weight:700;margin:22px 0;color:#daf9e9}
.run{display:block;width:100%;padding:15px 18px;border-radius:10px;border:0;background:#a8eccb;color:#102d28;font-size:1rem;font-weight:800;cursor:pointer;min-height:50px}
.run:hover{background:#d0ffe8}.run:disabled{background:#536660;color:#c5cbc7;cursor:not-allowed}
.links{display:grid;gap:10px;margin-top:20px}
.ai-access{margin-top:28px}.ai-access a{display:inline-block;border:1px solid #76a895;border-radius:9px;padding:12px 16px;text-decoration:none;font-weight:800}.links a{border:1px solid #587a71;border-radius:8px;padding:11px 14px;text-decoration:none;font-weight:700}
.steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;list-style:none;padding:0;margin:20px 0 0}
.steps li{border:1px solid #385651;background:#192b2c;border-radius:12px;padding:18px;line-height:1.5}
.steps b{display:block;color:#9ee7cd;font-size:.8rem;margin-bottom:8px}.steps span{font-size:.91rem;color:#d4e3dd}
.foot{margin-top:36px;border-top:1px solid #365451;padding-top:18px;color:#a7c2b7;font-size:.86rem;line-height:1.5}
@media(max-width:800px){.hero{grid-template-columns:1fr;padding:32px 0}.steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:480px){.steps{grid-template-columns:1fr}.topbar{align-items:flex-start;flex-direction:column}.panel{padding:20px}}
`;
const TOKEN = /^[0-9a-f]{48}$/u;
const NONCE = /^[0-9a-f]{32}$/u;

/** An exact nonce can be used in the server's style-src CSP. */
export function judgeConsoleStylePolicy(nonce) {
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) throw new Error('invalid_style_nonce');
  return `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
}

/** No user-generated or provider-derived text is interpolated into this page. */
export function renderJudgeConsolePage({ token, nonce, state }) {
  if (typeof token !== 'string' || !TOKEN.test(token)
    || !state || typeof state !== 'object' || !Number.isSafeInteger(state.count)
    || state.count < 0 || state.count > 5 || typeof state.running !== 'boolean'
    || !['object', 'undefined'].includes(typeof state.result)) throw new Error('invalid_page_state');
  judgeConsoleStylePolicy(nonce);
  const unavailable = state.running || state.count >= 5;
  const status = state.running ? 'Rehearsal running. The report will appear when it finishes.'
    : state.result ? 'Local rehearsal passed. The evidence is ready to inspect.'
      : state.count ? 'The last rehearsal failed. Restart the console if needed.'
        : 'Ready to run the executable local demonstration.';
  const links = state.result ? `<nav class="links" aria-label="Execution evidence">
<a href="/report">Read the execution report</a><a href="/evidence">Inspect minimized JSON evidence</a></nav>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">
${state.running ? '<meta http-equiv="refresh" content="2">' : ''}
<title>RightsReceipt | Executable judge review</title><style nonce="${nonce}">${STYLE}</style></head>
<body><main class="wrap" id="main-content">
<header class="topbar"><div class="brand">Rights<span>Receipt</span></div><div class="eyebrow">Local evaluation / No account required</div></header>
<section class="hero" aria-labelledby="page-title"><div>
<p class="eyebrow">AI-assisted licensing with human decisions</p><h1 id="page-title">See the rights workflow run.</h1>
<p class="lead">A reproducible walkthrough of creative-rights review, a deterministic USD 425.00 quote, invoice recovery and receipt issuance using actual application handlers and an isolated in-memory database.</p>
<div class="notice" role="note"><strong>Simulated payment only.</strong><p>People and sessions are scripted, and injected PayPal-like responses are used. Within this transaction rehearsal, no live AI inference, real PayPal payment, legal license or external network request occurs. The separate read-only AI diagnostic below executes the trained model on synthetic requests. The generated transaction report is not genuine Sandbox acceptance evidence.</p></div>
</div><section class="panel" aria-labelledby="run-title"><p class="eyebrow">Executable demonstration</p><h2 id="run-title">Run three local journeys</h2>
<p>Runs the normal license, interrupted invoice recovery and a fresh repeat. Each journey ends with proof that previously issued access has been retired.</p>
<p class="status" role="status" aria-live="polite">${status}</p>
<form method="post" action="/run"><input type="hidden" name="token" value="${token}"><button class="run" type="submit"${unavailable ? ' disabled' : ''}>Run application rehearsal</button></form>
${links}<p><small>Runs this session: ${state.count} of 5. ${state.running ? 'Checking the result every two seconds.' : 'You can refresh to review the latest result.'}</small></p>
</section></section>
<section class="panel ai-access" aria-labelledby="ai-model-title"><p class="eyebrow">Actual learned AI, separate from payment simulation</p>
<h2 id="ai-model-title">Inspect real local model predictions</h2><p>Run the pinned, SHA-256-verified lexical model and a source-backed rule extractor on two synthetic requests. One deliberately contains contradictory wording. These suggestions have no consent or payment authority and require human review.</p>
<a href="/model">Run read-only AI diagnostic</a><p><small>No account, paid inference API or external network required. This is a separate model run, not the transaction rehearsal above.</small></p></section>
<section class="journeys" aria-labelledby="journey-title"><h2 id="journey-title">What the evidence covers</h2>
<ol class="steps"><li><b>01 / Scope</b><span>Review the proposed creative use and rights constraints.</span></li>
<li><b>02 / Decision</b><span>Record human approval and the deterministic quote.</span></li>
<li><b>03 / Invoice</b><span>Exercise simulated payment, recovery and receipt generation.</span></li>
<li><b>04 / Reset</b><span>Prove old capabilities, receipts and creator cases are denied.</span></li></ol></section>
<footer class="foot">Case: Harbor After Rain. Test quote: USD 425.00. Runs only on 127.0.0.1 with Node 22. Stop with Ctrl+C. The final release also requires separate genuine PayPal Sandbox evidence.</footer>
</main></body></html>`;
}
