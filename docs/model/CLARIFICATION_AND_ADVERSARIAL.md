# Clarification and adversarial safety, version 1

**Owner:** Turn 020
**Contract:** `rights-clarification-v1`
**Status:** Deterministic clarification planner and read-only routes implemented with 42 passing dependency-free tests. Installed browser and Cloudflare D1 verification remain blocked by Turn 007.

## What the planner actually does

The planner scans the twelve material P0 rights fields in the frozen canonical order and creates exactly one static, plain-language question per unresolved or contradictory field. It does not write an additional terms version, approve a right, create an invoice, accept an answer, or start a payment.

Each question is selected solely by its field and resolution state. Source text and a potential attacker-written `reasonNote` are never interpolated into the question sentence. When exact UTF-16 source excerpts exist, they appear as separate evidence and must match the unchanged original request. The UI renders them as text, not HTML. Repeated, forged, or out-of-range source spans fail closed.

Question meanings are bounded to supported commercial paid Instagram/Facebook usage, US/Canada, an exact UTC date, 1 to 365 days, 1 to 500,000 impressions, non-exclusive rights, no modification or crop only, fixed credit requirements, no sublicensing, and no AI training.

| Input state | Result |
| --- | --- |
| Resolved with supported value | No question |
| Unresolved or omitted | One field-specific question |
| Ambiguous or low-confidence | One precise question, no inferred default |
| Contradictory | One question requesting a single clear answer, with distinct original-source evidence when available |
| Unsupported | A visible out-of-scope blocker, not a replacement value or false confirmation question |
| All fields resolved only by extraction | No unnecessary questions, human confirmation still required |
| Complete human-saved terms version | No questions; the separate quote service retains pricing authority |

Unsupported and unresolved states may coexist. The planner reports both, but a scope blocker takes precedence and cannot be silently removed by answering other questions.

## Creator workflow

`GET /api/creator/cases/:caseId/clarification` is guarded by the existing local-only demo creator access boundary. The creator receives status, source type, terms version number, unresolved field questions, and unsupported-scope notices. The creator can copy a plain-text question list or return to the existing human rights editor.

If a human-saved terms version exists, its twelve human observations take precedence over prior automated extraction. They must agree with the stored immutable version status. If no human terms exist, the server recomputes deterministic source-grounded observations from the original submitted buyer text without mutating a case or invoking the learned model.

The planner never consumes uncalibrated learned-model rankings as an authority source. The three held-out false resolutions from Turn 018 remain a release blocker for learned auto-resolution.

## Buyer capability access

`GET /api/request/:capability/clarify` is read-only and checks a submitted request, active asset, `clarify` action scope, capability digest, expiration, and revocation before returning the minimal buyer view. The response excludes internal case identifiers, buyer email, token digests, creator-side action controls, and raw private case notes. API responses set `Cache-Control: no-store` and `Referrer-Policy: no-referrer` through the existing shared middleware.

`/request/:capability/clarify` displays the questions but does **not** accept or store buyer answers. The screen says so explicitly. That is an intentional boundary for this turn, not a completed clarification exchange. Persistent clarification rounds, buyer answers, and versioned re-review remain future integration work and should not be claimed as complete.

## Fail-closed details

- Exactly twelve source observations are required in canonical order; duplicates, missing fields and extra authority keys are rejected.
- A `resolved` field must use the supported P0 value. Invalid dates, reversed or duplicated channel/territory arrays, durations above 365, impressions above 500,000, worldwide, exclusive and AI-training rights are rejected or held unsupported.
- Non-resolved fields cannot carry a numeric, text, or array rights value.
- Contradictions preserve two original UTF-16 spans in deterministic sources and do not collapse into a guessed value.
- Prompt-like buyer instructions, malicious markup and forged provider/payment claims are inert source text. They do not become questions, prices, approvals, payments, or receipts.
- Results always have `reviewRequired=true`, `quoteEligible=false`, and `permittedActions=[]`. This is true even if no clarification question remains.
- Unsupported requests are not silently coerced into valid terms or sent to an invoice.

## Verification

Dependency-free command:

```bash
node --no-warnings --experimental-strip-types --test scripts/clarification-local.test.mjs scripts/clarification-adversarial-local.test.mjs
```

**Observed local result:** 42 tests passed, zero failed. The focused tests cover complete/incomplete requests, twelve single-field omissions, multiple missing fields, contradiction pairs, unsupported rights, false resolution attempts, tampered source spans, Unicode offsets, static question wording, buyer-capability scope, expired/revoked links, and adversarial instructions passed to the existing deterministic extractor.

The pure planner and application service also passed a strict TypeScript check using local, uncommitted type declarations because the full pnpm dependency gate remains blocked. The Zod/Hono/React sources were authored against existing project contracts but have not executed in an installed browser or real Worker.

## Release and next gate

`RR-P0-021`: question generation behavior passes local tests. The full buyer clarification-response journey and browser evidence remain pending.

`RR-P0-038`: broad adversarial Node fixtures exercise prompt-like, overlong, contradictory, unsupported, and spoofed payment instructions without producing permission or authorization. This is not a security proof for the complete browser or future PayPal adapter.

`RR-P0-001` and Gate A: still blocked by package installation, real Hono/Vite execution, and browser acceptance.

Gate B should next examine the dataset's synthetic-language bias, three model false resolutions, inference fallbacks, latency, and the actual installed browser workflow. Do not promote the model or mark any release gate passed without that evidence.
