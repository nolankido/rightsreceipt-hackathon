# ADR 0007: Use a Demo Creator Session and Scoped Opaque Capabilities

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 004, implemented across Turns 008, 010, 013, 029, 034, and 038
- **Supersedes:** None
- **Superseded by:** None

## Context

The hackathon MVP has one seeded creator workspace, buyer-specific actions, and a public verification surface. It does not need public account registration, password recovery, social login, teams, or multi-tenant authorization. It still must prevent a public visitor from entering the creator workspace or acting on another buyer's request.

Leaving the demo completely unauthenticated would weaken the security story and could let a judge or crawler alter shared state. Integrating a full identity provider would consume time, introduce another service, and add product scope that is explicitly excluded.

## Decision

Use three separate access mechanisms with no public account system.

### Creator

- Store a deployment-specific demo access code and session signing key as Worker secrets.
- Exchange the access code through a dedicated server route for a short-lived creator session.
- Store the session in an HttpOnly, Secure, SameSite cookie authenticated with HMAC-SHA-256.
- Require same-origin validation and an anti-CSRF mechanism for creator mutations.
- Support explicit logout and session expiry.
- Never store the access code or signing key in D1, source control, client assets, or logs.

### Buyer

- Generate a high-entropy opaque capability token for one request.
- Store only a cryptographic hash of the token.
- Scope the capability to the request and the allowed buyer actions, such as clarification, review, acceptance, and receipt access.
- Use constant-time comparison where applicable.
- Prevent the token from entering analytics, structured logs, or referrer headers.
- Allow invalidation when a request is canceled or reset.

### Public verifier

- Generate a separate opaque, non-sequential receipt identifier.
- Give it read-only access to the privacy-minimized public verification representation.
- Do not let it authorize buyer or creator actions.
- Apply rate limiting and not-found responses that do not reveal internal identifiers.

The judge instructions may provide the creator demo access code through the submission testing instructions. The code is not committed to the repository.

## Consequences

### Positive

- The architecture meets the MVP access boundary without building a full account system.
- Creator, buyer, and public capabilities are visibly separated.
- A leaked public receipt identifier cannot modify a request.
- Hashing buyer capabilities reduces the impact of database exposure.
- The judge can access the creator workflow with one documented credential.
- The design uses Web Crypto already available in the Worker runtime.

### Negative and tradeoffs

- Shared judge environments still have one creator identity rather than individual attribution.
- Test instructions must securely communicate and rotate the demo access code.
- Capability URLs can leak through careless logs, screenshots, or referrers if controls fail.
- Session cookies require CSRF and origin protection.
- Revocation and reset behavior add state and tests.
- This design is unsuitable for a real multi-user production launch without replacement.

## Alternatives considered

### No authentication or capability checks

Rejected because any visitor could alter creator data, approve terms, or inspect unrelated buyer records.

### Cloudflare Access

Not selected for P0 because it adds account and policy configuration outside the repository and may complicate judge access. It remains a deployment hardening option if testing proves it transparent.

### Auth0, Clerk, Firebase Auth, or another identity provider

Rejected because public accounts and multi-user identity are non-goals. A new service would add configuration, credentials, callback behavior, and privacy surface.

### HTTP Basic authentication

Rejected as the primary design because it does not separate creator, buyer, and public capabilities and gives a weaker browser experience. It may remain an emergency outer gate for a preview deployment only.

### Store buyer tokens in plaintext

Rejected because the server only needs to verify possession. A hash is sufficient and safer.

## Validation

Later turns must demonstrate:

- a valid access code creates a short-lived creator session;
- an invalid code reveals no secret-dependent detail;
- creator mutations fail without a valid session and CSRF or origin evidence;
- a buyer capability works only for its request and allowed actions;
- capability hashes, not plaintext tokens, are persisted;
- one buyer cannot access another request;
- a public receipt identifier cannot authorize mutation;
- capability and session values are absent from logs and public responses;
- reset or revocation invalidates the expected access.

## Revisit triggers

- Judges cannot use the session flow reliably.
- The hosted environment needs multiple creators or individual attribution.
- Capability links leak through unavoidable platform behavior.
- A production release begins and requires real identity, recovery, and account lifecycle management.

## References

- [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
