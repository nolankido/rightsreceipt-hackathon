# Turn 019: Source-grounded local inference integration

**Owner:** Turn 019
**Status:** Implemented in source; native Node and SQLite tests pass. Browser, Hono installed tests, and live D1 remain blocked by Turn 007.
**Safety:** All extracted information remains a proposal. Real licensing, pricing, creator approval, buyer acceptance and payments are separate human and deterministic actions.

## Creator workflow

A buyer first submits original immutable intended-use text. The creator opens `/creator/cases/:caseId/extraction` and starts one explicit extraction run. The server loads source text and case version from the database, never from a client-supplied inference payload.

The deterministic Turn 016 extractor validates twelve proposed rights observations against the Turn 014 source-evidence contract, preserving exact UTF-16 original-text spans. Multiple contradictory excerpts are persisted as **separate observation rows**, not flattened into the single-span legacy UI. The server also loads the bundled 55,296-weight learned lexical classifier and Turn 018 validation-only margin policy after SHA-256 verification. That classifier's suggestions are **unverified and read-only**. Its held-out false-positive contradictions have not been fixed. It supplies no evidence, calibrated confidence, or authority, and the UI identifies its output as unapproved.

A single extraction-attempt record stores the exact input hash, extractor version, and, when verified model diagnostics are present, the model ID, version, and artifact hash. Observations, a sanitized audit event, and case row-version advance are written as one D1-shaped atomic batch. Local-memory mode uses the same case and attempt sequence as human terms review, so a subsequent manual version cannot reuse attempt number 1.

The creator can inspect each verbatim excerpt and status, then navigate to the original twelve-field human editor and create a distinct immutable `human_corrected` terms version. Only human-confirmed terms may enter the deterministic pricing engine. No learned value is promoted to canonical terms.

## API

- `GET /api/creator/cases/:caseId/extraction`
- `POST /api/creator/cases/:caseId/extraction`: exactly `{"expectedCaseRowVersion":N}`

Both inherit the temporary *local-loopback-only* demo creator guard. This is not production authentication. Public creator access and real D1 use remain blocked until secure sessions are implemented.

The API rejects closed cases, unknown or unsubmitted cases, stale versions, duplicate extraction attempts, and attempts to overwrite an existing human terms version. Replayed persisted observations are verified against the unchanged original buyer text and deterministic extractor output; mismatches fail closed. The learned classifier is optional; model integrity failures never turn model guesses into rights.

## Verification

```bash
node --no-warnings --experimental-strip-types --test scripts/observation-bridge-local.test.mjs scripts/extraction-sqlite-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/portable-model-local.test.mjs
```

The 21 new local tests cover twelve-field completeness, source offsets, conflicting spans, unsupported rights, mutable input tampering, model-confidence rejection, no AI authority, immutable rows, D1-shaped insert/lookup, source provenance, CAS conflicts, missing buyer requests, closed cases, terms replacement denial, duplicate writes, and unknown cases. Eight earlier portable-model tests also passed in the isolated working environment. The SQL test uses Node SQLite and is not live Cloudflare D1 evidence.

The native tests avoid paid APIs or GitHub Actions. They do not prove successful Hono/React/Vite execution or the full browser demo while Turn 007's dependency-installation gate is blocked.

## Deferred requirements

- `RR-P0-018`: deterministic exact evidence proposed in UI; AI-model sourced evidence needs independent semantic validation and browser verification.
- `RR-P0-019`: verified model version and artifact identity recorded for diagnostics; learned model remains uncalibrated and may not populate terms.
- `RR-P0-032`, `RR-P0-033`: local inference and rule baselines usable from source and Node tests; full end-to-end acceptance pending.
- `RR-P0-038`, `RR-P0-039`: prompt-like input is inert; AI cannot control money or permission.
- `RR-P0-001`: installed dependency, Hono integration, Vite production build, Wrangler and browser gates blocked.

## Next

Turn 020: safely generate only necessary clarification questions from missing, ambiguous, contradictory, and unsupported fields; conduct independent adversarial tests. Reopen Gate A after installed-browser tests become available.
