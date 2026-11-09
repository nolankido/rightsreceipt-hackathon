# Managed creator sessions and canonical review

Management turn 034. Base: `300e9dcab6f44963c98a146cd6c3b68e5553456b`.

## Scope and trust boundary

This turn replaces the previously absent creator authorizer with a narrowly scoped Cloudflare Access human-session verifier and connects it to the existing canonical consent and protected receipt routes. A new native creator review page calls the durable consent API, not the simulated transaction store. It does not add passwords, token-paste login, a custom session cookie, public payment endpoints, or an enabled deployment.

Cloudflare Access must authenticate the human and supply the application assertion. The application independently checks its RSA/SHA-256 signature using WebCrypto, the exact configured issuer and single application audience, application-token type, human subject, issued/not-before/expiration times and a maximum one-hour token lifetime. The issuer is restricted to one configured `https://<team>.cloudflareaccess.com` host. Signing keys come only from that issuer's fixed `/cdn-cgi/access/certs` endpoint. No JWT-selected key URL or embedded key is used.

The verifier accepts only RS256 JWT headers with `alg`, `kid` and `typ`. Duplicate decoded JSON names, malformed UTF-8/base64url, unsupported keys, weak RSA moduli, private key fields, excessive responses, redirects and failed key retrieval are rejected. Human subjects must be explicitly mapped to a workspace. Email and custom role/workspace claims confer no authority. Service-token identities, organization-wide tokens, demo roles, email headers, bearer headers and decoded cookies cannot authorize creators.

## Workspace authorization and freshness

Deployment-owned `CREATOR_ACCESS_PRINCIPALS` contains at most 32 explicit entries with exactly `subject`, `workspaceId` and `validAfter` (Unix seconds). No actual user IDs are checked into this repository. A verified subject is mapped to one workspace; case ownership is then checked with a parameterized SQL query. The session and mapping are checked again after the ownership read, and existing consent/receipt services repeat authorization at their critical asynchronous boundaries.

Audit actor references are a SHA-256 digest of issuer plus subject. The email, token, subject, signing material and provider cookies are not returned to the browser or copied to new audit records. Session endpoints expose only an authenticated flag, Sandbox marker and remaining lifetime.

Only public signing keys are cached, for 60 seconds, with four issuer slots and in-flight request sharing. User decisions and successful principals are never cached. Unknown key IDs do not cause unlimited refreshes. A refresh failure does not fall back to stale keys. Key rotation can cause a temporary denial until the short cache expires. Configuration changes and token expiry during asynchronous validation fail closed.

**Offline signature verification is not live revocation introspection.** Removing a mapping or advancing `validAfter` denies earlier assertions in the updated deployment. Access itself must enforce provider logout/revocation at the edge. A stolen still-valid JWT is a bearer credential and can be replayed until blocked or expired. This implementation does not claim to detect all upstream revocations independently or make identity-provider calls atomic with a database commit. A complete deployment must protect every creator ingress and remove alternate direct entry paths. The one-hour maximum requires an Access policy/session duration no longer than one hour; the provider's longer default is not accepted.

## Application wiring

The Worker keeps singleton route/limiter objects and supplies request-and-environment-bound authorizers to:

- `/api/consent/creator/cases/:caseId/review` and `/decision`;
- `/api/receipts/creator/:caseId` and its authorized formats;
- `/creator/review/:caseId`, `/api/creator/session` and `/assets/creator-review.js`.

The consent factory receives the actual environment as a third authorizer argument. Receipt authorization is similarly bound to the current environment, rather than using a shared mutable last-request principal. Existing buyer bearer capabilities, public verification and provider webhook routes keep their distinct trust boundaries. Creator sessions cannot accept a deal on behalf of a buyer.

The creator review client uses the browser's gateway cookie automatically through same-origin requests. It never handles or stores a JWT. Reads use no-store, error-on-redirect and the Access AJAX header; state-changing consent requests retain the existing exact Origin, Fetch Metadata, bounded JSON, exact-command and idempotency guards. There is no permissive CORS behavior. The UI renders text through DOM textContent, has an unchecked explicit-confirmation checkbox, and requires a reason for rejection or clarification. All twelve rights, the exclusive UTC end date, price and line items are shown.

Review data expires within five minutes or the remaining session lifetime, whichever comes first, after conservatively subtracting elapsed request time. Hidden or history-restored tabs clear private state. The server remains authoritative if a browser timer is throttled. Uncertain writes offer an explicit retry with exactly the same command and idempotency key; they never auto-repeat or infer successful approval. A new read follows success. The page has no invoice-send or license-activation control.

## Deployment contract, not work completed remotely

All new flags remain disabled. Enabling requires an approved fixed HTTPS application origin, a known Access team issuer/audience, an explicit human-to-workspace mapping and the database. `CREATOR_REVIEW_ENABLED` separately gates the UI. Existing consent/receipt flags remain independent and off by default.

Access protection must cover the new creator page/session/script paths plus creator consent, receipt and any future creator payment paths on production AND preview ingress. It must not lock buyers, public verification or PayPal webhooks behind the creator login. The application origin must agree with the consent/receipt origins. Direct development-role bypasses remain prohibited. Edge rate limiting and log redaction for cookies/assertion headers are deployment requirements, not completed account changes.

The page provides a same-origin session-refresh navigation link and the documented Access logout path. Provider logout can affect other Access applications; the UI labels this as signing out of Access apps. No identity provider, Access application, subscription, remote policy, account secret, cookie or credential was created or changed in this turn. Actual managed login/logout and revocation must be tested before enabling the feature.

## Verification actually executed

```text
npm run creator:session:verify
91 passed, 0 failed, 0 skipped

npm run creator:session:typecheck
Standalone TypeScript 5.8.3: no diagnostics

python scripts/creator-review-browser-check.py
30 offline Chromium layout and interaction checks passed
```

Native tests use real locally generated RSA keys and signatures, the real verifier, the actual scoped ownership SQL on a focused SQLite table, and native Request/Response handlers. They cover forgery, algorithms, malformed and duplicate claims, account isolation, service tokens, origin checks, key outages/rotation, expiry and revocation during reads, overlapping users, configuration defaults, privacy and response security headers. This is not Cloudflare-issued token evidence.

Browser checks execute the real rendered HTML and client with in-memory session/offer replies and controlled time. The offline non-secure document supplies a WebCrypto-backed UUID shim for the browser's otherwise secure-context-only randomUUID API. Tests cover desktop/mobile layout, confirmation, missing reasons, exact command contents, same-key retries, denied/expired/hidden state, safe text rendering and print behavior. They do not exercise actual network navigation, gateway cookies, provider login/logout, real consent persistence or downloads.

Modified Worker and existing route wrappers received TypeScript syntax checks. The complete Hono/React/Worker build, full consent/financial/receipt regressions and full-schema migration runner were not rerun. No placeholder dependencies are used by the new focused strict type target. Registry DNS was rechecked and remains unavailable. No schema, seed, workspace package, dependency version or lockfile was changed. Turn 007 and Gates A/B/C remain open. The original comprehensive Turn 034 threat-model/security audit is not declared complete.

## Primary references reviewed October 27, 2026

- Cloudflare assertion validation: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- Cloudflare human versus service application tokens: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
- Cloudflare session duration, revocation, logout and AJAX behavior: https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
- OWASP session management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

Next P0 integration: authenticated invoice-command/browser controls and the canonical buyer-acceptance screen, followed by a complete installed judge-path test. Optional analytics remain deferred.
