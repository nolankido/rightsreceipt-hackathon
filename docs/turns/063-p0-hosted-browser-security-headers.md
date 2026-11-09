# Turn 063: Hosted judge browser-security headers

## Problem

The signed-out hosted smoke was designed to reject missing routes, local-only mock behavior, leaked public receipt fields and a missing judge explanation. Yet its response checks only required `no-store` for most native surfaces. A proxy, Worker modification or deployment regression could remove browser protections against clickjacking, indexing, referrer leaks or risky script sources and still appear to pass the submission-readiness check.

## Improvement

`scripts/hosted-judge-smoke.mjs` now checks the response headers for the native judge tour, buyer intake page, buyer script, private receipt viewer, receipt script and unknown public verification response.

The smoke requires:

- Cache-Control includes both `private` and `no-store`.
- Referrer-Policy is `no-referrer` and X-Content-Type-Options is `nosniff`.
- X-Frame-Options is `DENY`; X-Robots-Tag includes `noindex` and `nofollow`.
- Content Security Policy has exactly one each of `default-src 'none'`, `frame-ancestors 'none'` and `base-uri 'none'`, with permitted restricted form actions.
- Script and connection directives may only be absent or `'self'`; image directives may only be absent, `'none'`, `'self'` or `'self' data:`. Object sources are absent or denied.
- Duplicate CSP directives fail even when one of the values looks acceptable.
- The inline CSS nonce in the actual judge and buyer HTML must match the CSP's style nonce.

The public SPA landing is intentionally exempt from this private-page security profile. The tool still sends the same ten bounded, signed-out, credential-free GET requests, forbids redirects and does not make provider or state-changing calls. Failures remain sanitized by probe ID, HTTP status and fixed diagnostic code, without persisting response bodies or header values.

## Regression coverage

The local smoke fixture now gives buyer and receipt responses their distinct real-world header profiles. The judge fixture directly invokes the actual `createJudgeTourRoute` module rather than a hand-written HTML approximation. New adversarial cases remove cache privacy, anti-indexing, framing, sniffing, referrer protections and CSP, then test weak default/script/connect/form directives, duplicate directives and mismatched CSS nonces.

Twenty-one isolated Node 24.22.1 tests passed using in-memory modules and TypeScript stripping. The full dependency-backed Node 22 release suite and a real hosted Cloudflare deployment were not available in this environment. No remote D1 request or genuine PayPal Sandbox transaction was performed.

## Limitations and next gate

A green security-header smoke is one deployed-response snapshot, not a comprehensive penetration test, payment proof, authenticated journey or guaranteed mitigation of all browser risks. The main release blockers remain the approved remote D1/Worker environment, genuine Sandbox acceptance, exact clean Node 22 release verification, final public-source export and judging materials.

Suggested next unit: run the approved deployment with its D1 ledger proof and execute this strengthened ten-probe smoke against the exact public HTTPS origin. Genuine Sandbox payment evidence remains a separate requirement.
