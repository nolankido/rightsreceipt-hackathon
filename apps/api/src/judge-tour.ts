/** Public, no-login judge tour with synthetic evidence labels and no state-changing calls. */
const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="description" content="An honest, read-only illustrated walkthrough of RightsReceipt's synthetic PayPal AI Hackathon scenario.">
  <title>Illustrative judge walkthrough | RightsReceipt</title>
  <style nonce="__NONCE__">
    :root{font-family:ui-sans-serif,system-ui,sans-serif;color:#17302d;background:#f5f5ef;line-height:1.55}
    *{box-sizing:border-box}
    body{margin:0}
    a{color:#075f56}
    a:focus-visible{outline:3px solid #bd641f;outline-offset:4px}
    .skip{position:absolute;top:-80px;left:12px;padding:10px;background:#fff;z-index:2}
    .skip:focus{top:12px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px max(5vw,20px);background:#fff;border-bottom:1px solid #cbd7d2}
    .brand{font-weight:800;letter-spacing:.02em;text-decoration:none;color:#17302d}
    .badge{display:inline-block;border-radius:99px;border:1px solid #ad6541;padding:4px 12px;font-size:.8rem;font-weight:800;letter-spacing:.045em;color:#783b1c;background:#fff3e9}
    main{max-width:1060px;margin:auto;padding:36px 20px 72px}
    h1,h2,h3{line-height:1.2}
    h1{font-size:clamp(2rem,5vw,3.3rem);max-width:16ch;margin:14px 0}
    h2{font-size:1.5rem}
    h3{font-size:1.05rem}
    .eyebrow{text-transform:uppercase;font-weight:800;font-size:.8rem;letter-spacing:.13em;color:#155f56}
    .lead{font-size:1.15rem;max-width:72ch}
    .notice{margin:24px 0;padding:17px 20px;background:#fff3e9;border-left:5px solid #ad6541}
    .grid{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,1.5fr);gap:24px;margin:36px 0}
    .card{background:#fff;border:1px solid #cbd7d2;border-radius:14px;padding:24px;min-width:0}
    figure{margin:0}
    figure img{display:block;width:100%;height:auto;max-height:280px;object-fit:contain;background:#e4efeb;border-radius:8px}
    figcaption,.muted{color:#455d59;font-size:.9rem}
    dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0 0}
    dt{color:#455d59;font-size:.83rem}
    dd{font-weight:700;margin:2px 0 12px}
    ol.steps{list-style:none;counter-reset:steps;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .steps li{counter-increment:steps;background:#fff;border:1px solid #cbd7d2;border-radius:12px;padding:20px}
    .steps h3:before{content:counter(steps) ". ";color:#155f56}
    .steps p{margin:8px 0 0}
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}
    .button{display:inline-block;background:#155f56;color:#fff;text-decoration:none;border-radius:9px;padding:12px 16px;font-weight:750;min-height:44px}
    .button.secondary{background:#fff;color:#075f56;border:1px solid #155f56}
    .jump{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}
    .jump a{display:inline-block;background:#e4efeb;border:1px solid #bad2cb;border-radius:99px;padding:7px 13px;font-weight:700;text-decoration:none}
    .evidence-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:28px 0}
    .evidence-grid .card{margin:0}
    .sample{background:#f1f7f4;border-left:4px solid #155f56;padding:12px 16px}
    .sample p{margin:5px 0}
    details{margin-top:16px;border-top:1px solid #cbd7d2;padding-top:14px}
    summary{cursor:pointer;color:#075f56;font-weight:800;min-height:44px}
    summary:focus-visible{outline:3px solid #bd641f;outline-offset:3px}
    .rights{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .rights dd{margin-bottom:7px}
    table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
    caption{text-align:left;color:#455d59;font-size:.9rem;margin-bottom:8px}
    th,td{padding:10px 3px;text-align:left;border-bottom:1px solid #dce5df}
    th{font-weight:700}
    .amount{text-align:right;white-space:nowrap}
    tfoot th,tfoot td{border-top:2px solid #155f56;font-size:1.2rem;color:#17302d}
    .state-card{margin:0 0 32px}
    .state-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:0;list-style:none}
    .state-list li{border:1px solid #cbd7d2;border-radius:9px;padding:14px;background:#f9fbf9}
    .state-list strong{display:block;color:#17302d}
    .state-list span{display:block;font-size:.9rem;color:#455d59}
    .source-trace{font-size:.85rem;color:#455d59;overflow-wrap:anywhere}
    .limits{background:#e4efeb;border-left:5px solid #155f56;padding:18px 24px;margin-top:28px}
    footer{margin-top:36px;padding-top:18px;border-top:1px solid #cbd7d2;color:#455d59}
    @media(max-width:760px){.grid,.evidence-grid,ol.steps,dl,.rights,.state-list{grid-template-columns:1fr}main{padding:24px 16px 60px}.card{padding:18px}}
    @media(min-width:540px) and (max-width:760px){.rights{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media print{.top,.actions,.skip,.jump{display:none}body{background:#fff}.card,.steps li,.state-list li{break-inside:avoid}details:not([open])>div{display:grid}}
  </style>
</head>
<body data-judge-tour="illustrative">
  <a class="skip" href="#main">Skip to walkthrough</a>
  <header class="top"><a class="brand" href="/">RightsReceipt</a><span class="badge">SYNTHETIC EXAMPLE</span></header>
  <main id="main">
    <section aria-labelledby="tour-title">
      <p class="eyebrow">PayPal AI Hackathon / judge walkthrough</p>
      <h1 id="tour-title">From a creative request to reviewable permission.</h1>
      <p class="lead">An illustrative tour of what RightsReceipt is designed to do. It is available without a login or private access code and makes no payment or state-changing requests.</p>
      <div class="notice" role="note"><strong>Illustrative only.</strong> The names, price and journey below are synthetic local-rehearsal fixtures, not a live buyer case. The rehearsal injects PayPal-like responses. This page is not genuine PayPal Sandbox evidence, a payment confirmation or a grant of rights.</div>
      <nav class="jump" aria-label="Jump to example evidence"><a href="#rights-evidence">Reviewed rights</a><a href="#quote-evidence">Quote calculation</a><a href="#state-evidence">Receipt state</a></nav>
    </section>
    <section class="grid" aria-labelledby="case-title">
      <figure class="card">
        <img src="/demo/harbor-after-rain.svg" alt="Illustrative landscape artwork titled Harbor After Rain" width="640" height="400">
        <figcaption>Harbor After Rain, demo artwork. No ownership or license is asserted by this illustration.</figcaption>
      </figure>
      <div class="card">
        <p class="eyebrow">Synthetic case file</p>
        <h2 id="case-title">A license request with clear handoffs</h2>
        <dl>
          <div><dt>Creator</dt><dd>Maya Chen</dd></div>
          <div><dt>Buyer</dt><dd>Cedar &amp; Tide Travel</dd></div>
          <div><dt>Asset</dt><dd>Harbor After Rain</dd></div>
          <div><dt>Deterministic quote</dt><dd>USD 425.00</dd></div>
          <div><dt>Local rehearsal outcome</dt><dd>Scheduled, not active</dd></div>
          <div><dt>Provider evidence</dt><dd>Injected fixture, not PayPal</dd></div>
        </dl>
      </div>
    </section>
    <section class="evidence-grid" aria-label="Synthetic case evidence">
      <article class="card" id="rights-evidence" data-judge-evidence="rights" aria-labelledby="rights-title">
        <p class="eyebrow">Illustrative evidence 1 of 3</p>
        <h2 id="rights-title">The request becomes reviewed rights</h2>
        <div class="sample"><p><strong>Buyer request, paraphrased</strong></p><p>Paid Instagram and Facebook ads in the US and Canada, roughly three months, up to 500,000 impressions, with crops for vertical placements.</p></div>
        <p class="muted">The original synthetic request is paraphrased here. The rehearsal records clarifications and uses <code>manual-review-v1</code> human-corrected terms. This static page does not run AI or show a learned model result.</p>
        <details><summary>Inspect all 12 creator-reviewed rights</summary>
          <div><dl class="rights">
            <div><dt>Purpose</dt><dd>Commercial</dd></div>
            <div><dt>Channels</dt><dd>Paid Instagram and Facebook</dd></div>
            <div><dt>Advertising</dt><dd>Paid ads permitted</dd></div>
            <div><dt>Territories</dt><dd>United States and Canada</dd></div>
            <div><dt>Start date</dt><dd>November 1, 2026</dd></div>
            <div><dt>Duration</dt><dd>90 days</dd></div>
            <div><dt>Impressions cap</dt><dd>500,000</dd></div>
            <div><dt>Exclusivity</dt><dd>Non-exclusive</dd></div>
            <div><dt>Modifications</dt><dd>Crop only</dd></div>
            <div><dt>Attribution</dt><dd>Not required</dd></div>
            <div><dt>Sublicensing</dt><dd>Prohibited</dd></div>
            <div><dt>AI use</dt><dd>Prohibited</dd></div>
          </dl></div>
        </details>
      </article>
      <article class="card" id="quote-evidence" data-judge-evidence="quote" aria-labelledby="quote-title">
        <p class="eyebrow">Illustrative evidence 2 of 3</p>
        <h2 id="quote-title">A deterministic USD 425.00 quote</h2>
        <table>
          <caption>Seeded creator pricing policy, version 1. All amounts in USD.</caption>
          <thead><tr><th scope="col">Policy rule</th><th scope="col" class="amount">Amount</th></tr></thead>
          <tbody>
            <tr data-rule="base_commercial_digital"><th scope="row">Base commercial digital</th><td class="amount" data-cents="20000">$200.00</td></tr>
            <tr data-rule="paid_social"><th scope="row">Paid social advertising</th><td class="amount" data-cents="10000">$100.00</td></tr>
            <tr data-rule="territory_us_ca"><th scope="row">US and Canada</th><td class="amount" data-cents="5000">$50.00</td></tr>
            <tr data-rule="duration_31_90"><th scope="row">31 to 90 days</th><td class="amount" data-cents="5000">$50.00</td></tr>
            <tr data-rule="crop_only"><th scope="row">Crop permission</th><td class="amount" data-cents="2500">$25.00</td></tr>
          </tbody>
          <tfoot><tr><th scope="row">Total</th><td class="amount" data-total-cents="42500">$425.00</td></tr></tfoot>
        </table>
        <p class="muted">Versioned policy rules calculate this total in integer cents. AI cannot choose the price, and an invoice does not by itself grant rights.</p>
      </article>
    </section>
    <section class="card state-card" id="state-evidence" data-judge-evidence="state" aria-labelledby="state-title">
      <p class="eyebrow">Illustrative evidence 3 of 3</p>
      <h2 id="state-title">Who can change permission status?</h2>
      <p>These are <strong>offline rehearsal outcomes</strong>, not events on this public Worker. The scenario's test clock is October 27, 2026, before the November 1 license start.</p>
      <ol class="state-list">
        <li><strong>Creator approval</strong><span>Recorded in local fixture after review</span></li>
        <li><strong>Buyer acceptance</strong><span>Recorded separately for the same quote</span></li>
        <li><strong>Invoice sent</strong><span>One injected provider creation and send</span></li>
        <li><strong>Payment status</strong><span>Injected PAID label, no authority on its own</span></li>
        <li><strong>Reconciliation</strong><span>Local fixture records evidence before permission</span></li>
        <li><strong>Receipt</strong><span>Scheduled, not active; public view minimizes details</span></li>
      </ol>
      <p class="source-trace">Fixture source trace: <code>seed/demo-reset.sql</code>, <code>packages/pricing/src/index.ts</code>, and <code>scripts/support/judge-rehearsal-journey.mjs</code>. No private buyer text, code or invoice identifier appears here.</p>
    </section>
    <section aria-labelledby="journey-title">
      <p class="eyebrow">Five authority checkpoints</p>
      <h2 id="journey-title">Follow the rights and payment boundary</h2>
      <ol class="steps">
        <li><h3>Buyer requests use</h3><p>The buyer states how they plan to use the image. A real request starts with a private, creator-issued code. No code is included here.</p></li>
        <li><h3>AI assists, creator decides</h3><p>AI can extract wording and flag uncertain rights. The human creator reviews material terms and can clarify or reject them.</p></li>
        <li><h3>Price and acceptance are explicit</h3><p>Policy code computes the example USD 425.00 quote. Human creator approval and separate buyer acceptance are required.</p></li>
        <li><h3>Payment evidence has its own authority</h3><p>The offline rehearsal exercises invoice, delivery and settlement logic using injected provider responses. No PayPal payment has been proven here.</p></li>
        <li><h3>Receipt reflects current permission</h3><p>The example ends with a scheduled, not active, permission receipt. Public verification minimizes private details and cannot invent payment evidence.</p></li>
      </ol>
    </section>
    <section class="card" aria-labelledby="screens-title">
      <p class="eyebrow">Read-only public preview</p>
      <h2 id="screens-title">Open the actual entry screens</h2>
      <p>On a configured restricted judge Worker, these links open real browser pages. The buyer request and receipt viewer need private creator-issued access to show case data. This tour provides none, and the restricted preview cannot issue it because creator access is disabled.</p>
      <nav aria-label="Preview entry screens" class="actions">
        <a class="button" href="/buyer/request">Buyer private-code entry</a>
        <a class="button secondary" href="/receipts/buyer">Private receipt viewer</a>
        <a class="button secondary" href="/api/health">Read-only service health</a>
      </nav>
      <p class="muted">These links can be unavailable in local-only mode or an unprovisioned deployment. The walkthrough above remains self-contained.</p>
    </section>
    <section class="limits" aria-labelledby="limits-title">
      <h2 id="limits-title">What this page does not prove</h2>
      <p>No actual creator login, buyer authorization, genuine PayPal Sandbox payment, invoice delivery, webhook processing, deployed database seed or live permission activation has been verified by this page. A clean Node 22 release gate, genuine Sandbox acceptance and separately approved authenticated deployment remain required.</p>
      <p>For reviewers with source access, <code>node scripts/judge-rehearsal.mjs</code> runs the deterministic offline evidence tour, explicitly labeled as simulated.</p>
    </section>
    <footer>RightsReceipt is a hackathon prototype. AI does not price rights, grant permission or declare payment complete.</footer>
  </main>
</body>
</html>
`;

const HEADERS = {
  "Cache-Control": "no-store, private",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
};

function pageResponse(body: string, status: number, mime: string, nonce = "", extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: {
    ...HEADERS, ...extra, "Content-Type": mime,
    "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  } });
}

export function createJudgeTourRoute() {
  return (request: Request): Response | null => {
    const url = new URL(request.url);
    if (url.pathname !== "/judge") return null;
    if (url.search) return pageResponse(JSON.stringify({ error: "invalid_request" }), 400, "application/json; charset=utf-8");
    if (request.method !== "GET") return pageResponse(JSON.stringify({ error: "method_not_allowed" }), 405,
      "application/json; charset=utf-8", "", { Allow: "GET" });
    const nonce = crypto.randomUUID().replace(/-/gu, "");
    return pageResponse(HTML.replace("__NONCE__", nonce), 200, "text/html; charset=utf-8", nonce);
  };
}
