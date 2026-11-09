# RightsReceipt Submission Readiness Audit

**Audit date:** October 29, 2026  
**Target:** PayPal AI Hackathon  
**Official deadline:** November 12, 2026 at 12:00 PM Pacific  
**Current release state:** NOT READY

This document is a submission preflight, not evidence that the release gates are closed. It separates contest requirements from local engineering evidence and account-bound work.

## Executive assessment

RightsReceipt is a strong hackathon concept with unusually deep engineering evidence. The core story is coherent:

1. A buyer describes a proposed commercial use of a creator's image.
2. AI-assisted extraction proposes structured rights with source evidence and abstention.
3. Deterministic creator policy computes the price.
4. The creator approves exact terms.
5. The buyer accepts the same terms.
6. PayPal Sandbox handles invoicing and payment evidence.
7. RightsReceipt issues a tamper-evident permission receipt.

The canonical scenario uses Maya Chen, Cedar & Tide, the asset "Harbor After Rain", and a deterministic USD 425.00 quote.

The project is not submission-ready yet because the strongest remaining blockers are external and release-oriented rather than feature-depth problems.

## Official submission requirements

| Requirement | Current state | Release action |
| --- | --- | --- |
| Meaningful PayPal developer-platform integration | Implemented behind local/injected evidence, genuine Sandbox gate still open | Complete one genuine Sandbox invoice, send, payment/status and verified webhook path |
| Meaningful AI integration | Implemented with local diagnostic model, evidence extraction and human review | Keep claims narrow and show source-grounded suggestions rather than autonomous rights decisions |
| Functional demo | A dependency-free local browser console can run the actual-handler rehearsal with injected providers; genuine Sandbox end-to-end is not yet verified | Verify a clean-clone runnable build and genuine Sandbox behavior; hosting is optional under official rules |
| Public code repository | **BLOCKED: repository is private** | Change repository visibility to public only after secret/privacy audit and release freeze |
| Open-source license | PASS | MIT license is present |
| Complete source/assets/instructions | Substantial documentation exists | Add a concise judge quick start and ensure fresh-clone instructions are exact |
| Text description | Draft needed | Use DEVPOST_DRAFT.md and revise only to match the release commit |
| Identify tools used | Draft needed | List PayPal Sandbox, local TypeScript/ML stack and any other tools actually present in the release |
| Public YouTube demo | BLOCKED | Record and upload final under-3-minute video after release behavior is frozen |
| Video shows working project | BLOCKED on release candidate | Record real application behavior and clearly label any local simulation |
| Free judge access through judging | Not established | Prefer hosted Sandbox demo or exact self-run instructions that remain available through judging |

## Current evidence worth preserving

The project already has strong local evidence:

- 2,317 native regression tests reported passing at Turn 046.
- 733 browser checks across 70 scenarios reported passing at Turn 046.
- One-command local judge rehearsal at `node scripts/judge-rehearsal.mjs`.
- Deterministic USD 425.00 quote for the canonical scenario.
- Human creator approval and buyer acceptance boundaries.
- Durable invoice operation and recovery logic under injected provider responses.
- Canonical receipt generation, public verification states and exact-byte export checks.
- Security hardening around private capabilities, response validation, deadlines and bounded receipt streams.

These are useful judging evidence, but they do not replace genuine PayPal Sandbox or release-candidate verification.

## P0 blockers before submission

### 1. Genuine PayPal Sandbox evidence

Must be completed against `https://api-m.sandbox.paypal.com` with server-only credentials.

Minimum release evidence:

- OAuth client-credentials exchange succeeds.
- One approved and accepted USD 425.00 transaction creates a Sandbox invoice.
- The same invoice is sent exactly once.
- Buyer reaches the PayPal-hosted Sandbox payment experience.
- The application retrieves authoritative current invoice status.
- At least one signed Sandbox webhook is verified against the registered webhook ID.
- Duplicate or out-of-order delivery does not create duplicate side effects.
- Paid state produces the expected receipt state.
- Refund/cancel behavior matches the documented lifecycle policy.
- No production PayPal host or credentials are enabled.

### 2. Pinned clean install and release build

The release commit should pass, from a clean clone:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

At minimum preserve exact evidence for:

- pinned Node 22.x and pnpm version;
- strict TypeScript;
- lint;
- Vitest/native suites;
- Vite build;
- Wrangler dry run;
- judge rehearsal.

### 3. Judge access

A hosted deployment is not required by the contest, but it is preferred because it lowers judge friction.

Best release path:

- deploy a restricted Sandbox-only Cloudflare Worker/D1 build;
- store PayPal credentials only in protected server-side secrets;
- seed the canonical demo;
- keep production payments impossible by configuration;
- provide signed-out judge instructions;
- retain the local judge rehearsal as fallback.

If hosted access cannot safely pass the security gates, submit the functional self-run path instead. Do not substitute the simulated rehearsal for real PayPal Sandbox evidence.

### 4. Public repository

Current GitHub visibility is private.

Before changing visibility:

- run a repository-wide credential and personal-data scan;
- verify generated evidence contains no usable capabilities or sandbox secrets;
- ensure `.dev.vars`, local databases and output directories are ignored;
- confirm the MIT license remains visible;
- freeze the release commit and tag it;
- then make the repository public and test it signed out.

### 5. Final demo video

Record only after the release candidate is frozen.

Requirements:

- under 3:00;
- public YouTube link;
- working application footage;
- no copyrighted music or unlicensed material;
- no third-party marks beyond what is necessary to demonstrate the integration;
- no secret values, buyer capabilities or credentials on screen.

Use VIDEO_STORYBOARD.md.

## Recommended remaining sequence

1. Close Turn 047 and any other local P0 boundary work that can invalidate the browser client.
2. Run the pinned clean-install/build gate.
3. Perform the genuine PayPal Sandbox end-to-end transaction and archive sanitized evidence.
4. Run the release privacy/security audit.
5. Deploy the Sandbox-only judge build, if safe.
6. Freeze one release commit.
7. Record the final video from that exact release.
8. Make the repository public and verify it signed out.
9. Finalize Devpost copy from DEVPOST_DRAFT.md.
10. Submit by November 11 internally, then reopen the Devpost entry and verify every link before the official November 12 deadline.

## Go/no-go rule

Do not submit a build that implies the local injected PayPal flow is genuine Sandbox evidence.

A credible smaller submission with one real Sandbox path is stronger than a broader submission whose payment claims cannot be independently reproduced.
