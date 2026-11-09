# Buyer Request Intake and Validation

**Status:** Implemented and verified through the dependency-free local request harness
**Owning turn:** Turn 010
**Browser build verification:** Pending the blocked Turn 007 dependency gate
**Live D1 verification:** Pending a configured D1 binding

## Purpose

This record describes the first buyer-facing transaction slice in RightsReceipt. A creator can issue a fresh asset-bound request link, and a buyer can submit identity, organization, email, intended-use evidence, and versioned consent for one active asset.

The submission is evidence only. It does not approve rights, calculate a quote, create an invoice, confirm payment, or activate permission.

## Product flow

1. A creator or judge-demo surface requests a link for one active asset.
2. The server creates one licensing case and one buyer capability.
3. Only the capability token is returned to the creator surface.
4. The buyer opens `/request/:capability`.
5. The server resolves the token digest to one case and one asset.
6. The buyer submits required identity and intended-use fields.
7. The original intended-use string is stored unchanged.
8. A normalized representation is stored separately for later extraction.
9. The licensing case is bound to the immutable request submission.
10. The buyer sees `Request received`, not approval or payment language.

## Capability boundary

Buyer request links use a 256-bit random token encoded as unpadded base64url. The database stores only its SHA-256 digest.

Each capability is:

- bound to one licensing case;
- indirectly bound to exactly one asset through that case;
- issued with explicit action names;
- time limited to seven days in the current demo implementation;
- checked for revocation and expiration on each request;
- never logged by the request implementation;
- never accepted as an internal entity identifier.

A new link creates a new case. No reusable capability token is committed to the repository.

## Required buyer fields

| Field | Rule |
| --- | --- |
| Buyer name | 2 through 100 trimmed characters |
| Buyer organization | 2 through 120 trimmed characters |
| Buyer email | Valid syntax, maximum 254 characters |
| Intended use | 40 through 4,000 Unicode characters |
| Consent acknowledgement | Must be explicitly true |

The consent copy version is fixed to `buyer-request-v1` for this turn.

## Evidence preservation

The request record stores:

- the original intended-use text exactly as submitted;
- a separate NFKC-normalized representation;
- normalized line endings in the derived representation only;
- buyer name and organization after outer trimming;
- buyer email after outer trimming and lowercase normalization;
- consent-copy version;
- consent acknowledgement;
- UTC submission time.

The original intended-use field is protected by the existing immutable-record trigger. Later extraction must cite the original evidence rather than silently rewriting it.

## Unsafe and prompt-like input

The request is plain text, not executable instruction.

The domain validator rejects:

- script, iframe, object, embed, style, link, meta, SVG, or MathML tags;
- inline event-handler syntax;
- `javascript:` URLs;
- double-brace template syntax;
- percent template syntax;
- JavaScript interpolation syntax;
- disallowed control characters;
- oversized bodies and field values.

Prompt-like wording such as `ignore previous instructions` is accepted as inert buyer evidence when it otherwise satisfies the input contract. It has no path to pricing, approval, payment, or permission state.

React renders buyer text as text. The request API never evaluates or injects it as markup.

## API routes

Creator-only link creation:

```text
POST /api/creator/assets/:assetId/request-links
```

Buyer capability routes:

```text
GET  /api/request/:capability
POST /api/request/:capability
```

Link creation currently requires the explicit demo creator-role header already used by the asset workspace. This remains a temporary hackathon boundary, not production authentication.

The buyer routes return safe error codes for invalid, expired, revoked, previously submitted, unavailable-asset, oversized, malformed, and validation-failure states.

## React routes

```text
/buyer/demo
/request/:capability
```

`/buyer/demo` creates a fresh capability for the seeded Harbor After Rain asset and redirects to the capability route. It does not contain a committed reusable token.

The buyer screen includes:

- asset preview and creator context;
- buyer identity and organization fields;
- email input;
- intended-use guidance and live character count;
- versioned consent copy;
- focused error summary and field messages;
- loading, invalid-link, already-submitted, submitting, and received states;
- explicit wording that submission is not permission or payment.

## Persistence implementations

The D1-shaped repository performs:

- atomic case and capability creation through one batch;
- capability lookup by digest;
- asset and case resolution;
- request-submission insert;
- case binding and row-version increment.

The local memory adapter shares the same asset records as the creator workspace and is selected only in local mode. Sandbox and judge modes still fail closed without D1.

## Dependency-free verification

Run:

```bash
node --no-warnings --experimental-strip-types --test scripts/request-local.test.mjs
```

The nine tests cover:

1. one active-asset capability binding;
2. unknown and archived asset rejection;
3. exact original-text preservation and separate normalization;
4. 40 and 4,000 character acceptance boundaries;
5. 39 and 4,001 character rejection boundaries;
6. buyer identity, email, and consent errors;
7. script and template rejection with no write;
8. inert prompt-like wording;
9. duplicate submission rejection and request immutability.

## Verification limitations

- React and Hono have not executed with installed dependencies because Turn 007 remains blocked.
- Vitest, Vite build, Wrangler dry run, and browser automation remain pending.
- D1 repository source has not run against a live binding.
- Rate limiting and the final signed creator session remain later security work.
- The local memory adapter is non-durable and is always identified as memory state.
- Extraction, clarification, pricing, consent, PayPal, permission, and receipt behavior remain outside this turn.
