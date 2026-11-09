# RightsReceipt Core User Journeys and Interaction Contract

**Status:** Accepted interaction baseline  
**Owning turn:** Turn 006  
**Last reviewed:** October 25, 2026 HST  
**Related product records:** [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md), [`MVP_SCOPE.md`](MVP_SCOPE.md), [`ACCEPTANCE_MATRIX.md`](ACCEPTANCE_MATRIX.md)  
**Related architecture records:** [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md), [`../architecture/DOMAIN_MODEL.md`](../architecture/DOMAIN_MODEL.md)

## 1. Purpose

This document converts the frozen product, architecture, and domain contracts into an implementable interaction model.

It defines:

- actor-specific journeys;
- route ownership and navigation;
- screen responsibilities;
- primary and secondary actions;
- role and mode indicators;
- low-fidelity wireframes;
- loading, empty, blocked, error, and recovery states;
- responsive behavior;
- accessibility behavior;
- the three-minute judge path;
- implementation handoffs for later management turns.

This is an interaction contract, not an implementation claim. No React routes, components, browser behavior, or deployed interface exists as of Turn 006.

## 2. Interaction principles

### 2.1 One role and one next action

Every screen must answer three questions without narration:

1. Who am I acting as?
2. What is true now?
3. What is the next available action?

A screen may contain several secondary actions, but only one primary action is visually dominant.

### 2.2 Status must remain truthful

The interface must never collapse distinct domain facts into a misleading success label.

Examples:

- `Invoice sent` is not `Paid`.
- `Paid` is not automatically `Active` when the licensing start date is in the future.
- `Canceled` is not `Refunded`.
- `Revoked` does not imply a refund.
- `Simulated` is not PayPal Sandbox evidence.
- `Hash mismatch` is not a valid receipt.

### 2.3 Evidence before confidence

AI-proposed fields show the source evidence and reliability signal before the user is asked to trust or correct the value.

The interface must not use a single overall confidence score to hide field-level uncertainty.

### 2.4 Progressive disclosure without hidden authority

The happy path should feel short, but consequential information cannot be buried behind optional disclosure.

Always-visible information includes:

- current role;
- current mode;
- asset identity;
- current case stage;
- unresolved or unsupported terms;
- quote total and line items;
- exact terms version at approval and acceptance;
- payment source and state;
- permission-effective state;
- receipt verification result.

Technical metadata, model versions, raw identifiers, and detailed audit payloads may use expandable sections.

### 2.5 Preserve context across handoffs

Creator and buyer surfaces must refer to the same asset, terms version, quote version, and case reference.

A user should not need to compare disconnected pages or remember information from a previous screen to know what is being approved or accepted.

### 2.6 Fail closed with a path forward

When a consequential action is blocked, the interface must state:

- what is blocking it;
- why that matters;
- who can resolve it;
- the safe next action.

A disabled button without explanation is not sufficient.

### 2.7 The interface is a record, not a chat persona

AI assistance appears as structured evidence, proposed values, and clarification prompts. The product does not present a general-purpose conversational assistant.

### 2.8 Public verification is intentionally narrower

The public verifier sees enough information to understand the permission scope and status, but not buyer email, private notes, capability tokens, raw webhook data, or internal operation details.

## 3. Actors and interaction boundaries

| Actor | Primary goal | Allowed surfaces | Prohibited access |
| --- | --- | --- | --- |
| Creator or demo operator | Review requests, correct terms, approve or reject, track payment and permission, inspect receipts and audit | Creator workspace, asset records, creator case view, creator receipt, audit, demo reset | Buyer capability actions, secret configuration, raw provider credentials |
| Buyer | Submit intended use, answer clarification, accept exact terms, continue to PayPal, view buyer receipt | Asset-specific request, clarification, acceptance, payment handoff, buyer receipt | Creator workspace, other cases, private audit payloads |
| Public verifier | Confirm whether a record exists and what its current public status means | Public verification route | Buyer email, private notes, internal IDs, capabilities, webhook data |
| Judge | Understand and exercise the seeded scenario | Demo launch, creator and buyer judge paths, public verification, documented fallback | Production payments or private credentials |

Role context must be visible in the page header and announced in the document title.

## 4. Route map

The final route names may be adjusted during implementation, but the route ownership and user separation are binding.

### 4.1 Public and judge routes

| Route pattern | Surface | Notes |
| --- | --- | --- |
| `/` | Public landing and project explanation | Links to judge mode, public verification, and repository documentation |
| `/demo` | Judge launch and environment status | Shows mode, seed status, PayPal availability, and reset guidance |
| `/verify` | Verification lookup | Accepts a public receipt identifier through a form |
| `/verify/:publicId` | Public verification result | Privacy-minimized, read-only, signed-out surface |
| `/health` | Machine-readable operational route | Not a browser product screen |

### 4.2 Creator routes

| Route pattern | Surface | Notes |
| --- | --- | --- |
| `/creator/access` | Demo creator access | Accepts deployment-specific access code and creates a short-lived session |
| `/creator` | Workspace overview | Shows assets, request queue, current mode, and reset state |
| `/creator/assets/new` | Asset metadata registration | Metadata only in P0 |
| `/creator/assets/:assetId` | Asset detail | Shows preview, provenance, fingerprint, and request link |
| `/creator/cases/:caseId` | Creator case workspace | Primary creator interaction surface |
| `/creator/cases/:caseId/audit` | Creator audit history | Chronological evidence with safe details |
| `/creator/receipts/:receiptId` | Creator receipt view | Full creator-safe receipt and revision history |

### 4.3 Buyer capability routes

| Route pattern | Surface | Notes |
| --- | --- | --- |
| `/request/:capability` | Buyer case entry | Capability is opaque, case-scoped, and excluded from logs and analytics |
| `/request/:capability/clarify` | Clarification | Only unresolved or contradictory P0 fields appear |
| `/request/:capability/review` | Buyer terms review | Displays exact creator-approved terms and quote version |
| `/request/:capability/payment` | Payment handoff and status | Links to PayPal-hosted flow and shows safe current state |
| `/request/:capability/receipt` | Buyer receipt | Available after permission issuance |

A restrictive referrer policy is required on capability routes. Capability values must not appear in page copy, analytics, logs, error reports, or copied links intended for public sharing.

## 5. Navigation model

### 5.1 Creator navigation

Desktop creator surfaces use a compact left rail or top-level workspace navigation with these destinations:

- Overview
- Assets
- Requests
- Receipts
- Demo status

The current case uses a local progress rail rather than adding every stage to global navigation.

Mobile creator surfaces use a top app bar and a short overflow menu. Persistent bottom navigation is not required for P0.

### 5.2 Buyer navigation

Buyer surfaces do not expose global application navigation. They use:

- product mark;
- asset and creator context;
- a compact progress indicator;
- a single primary action;
- safe help text.

The buyer cannot navigate into creator or public administration surfaces.

### 5.3 Public verification navigation

Public verification uses a minimal header with:

- RightsReceipt identity;
- `Verify another record`;
- `How verification works`;
- repository or project information.

It must not expose privileged navigation.

## 6. Derived case-stage presentation

The UI may display one derived stage label, but it cannot write that stage directly.

| Derived UI stage | Meaning | Primary role | Primary action |
| --- | --- | --- | --- |
| Draft request | Buyer has not submitted valid intended-use information | Buyer | Submit request |
| Request received | Original request is stored and extraction is pending or complete | System, then creator | Review proposed terms |
| Needs clarification | One or more required fields are unresolved or contradictory | Buyer or creator | Answer or correct fields |
| Unsupported request | One or more required terms fall outside P0 | Creator | Request revision or reject |
| Ready to quote | All required terms are complete and supported | Creator | Calculate or review quote |
| Creator review | Quote exists and creator decision is pending | Creator | Approve, edit, reject, or request clarification |
| Awaiting buyer acceptance | Creator approval is effective for current versions | Buyer | Accept exact terms and quote |
| Invoice preparing | Accepted versions are being bound to one invoice | Creator or system | Wait or retry safely |
| Awaiting payment | Invoice was sent and is not paid | Buyer | Continue to PayPal or refresh status |
| Reconciliation required | Provider outcome is incomplete or inconsistent | Creator | Reconcile payment state |
| Scheduled | Verified paid permission begins on a future UTC date | Buyer and creator | Review start date |
| Active | Verified paid permission is currently effective | Buyer and creator | View receipt |
| Expired | Permission interval has ended | Buyer and creator | View historical receipt |
| Canceled | Unpaid invoice or case was canceled | Buyer and creator | View verification record or start a new case |
| Rejected | Creator rejected the request | Buyer and creator | Review reason or start a revised case |
| Refunded | Full refund makes the permission non-active | Buyer and creator | View receipt revision and refund status |
| Revoked | Creator explicitly revoked a scheduled or active permission | Buyer and creator | View receipt revision and reason |
| Verification invalid | Stored canonical payload does not match its hash or record is otherwise invalid | Creator and public verifier | Stop relying on record and investigate |

### 6.1 Stage display rules

- Use plain language before internal state names.
- Pair every status with text and an icon or shape, never color alone.
- Show the authoritative source where relevant, such as `PayPal Sandbox` or `Simulated local adapter`.
- Show the last confirmed timestamp and timezone label.
- Do not display a celebratory success treatment for `scheduled`, `expired`, `refunded`, `revoked`, or `invalid`.
- When a state is pending, explain whether the user should wait, refresh, retry, or contact the creator.

## 7. End-to-end journey map

| Step | Buyer experience | Creator experience | System evidence |
| --- | --- | --- | --- |
| 1. Asset context | Opens the asset-specific request route | Sees the seeded asset and request link | Asset ID, fingerprint, provenance note |
| 2. Intended use | Enters identity, organization, email, and intended-use text | No action | Immutable original submission and consent-copy version |
| 3. Extraction | Sees a receipt that the request was submitted | Sees proposed terms, evidence, confidence, and gaps | Extraction attempt, model and extractor versions |
| 4. Clarification | Answers only unresolved questions | May correct any field manually | Clarification answers and human correction provenance |
| 5. Quote | Waits for creator review | Sees supported terms and itemized deterministic quote | Terms version, policy version, quote version, 42,500-cent regression for demo |
| 6. Creator decision | Receives approved terms or rejection | Approves, edits, rejects, or requests clarification | Creator decision bound to exact versions |
| 7. Buyer acceptance | Reviews and accepts exact terms and quote | Sees acceptance status | Buyer acceptance bound to same versions |
| 8. Invoice | Continues to PayPal-hosted payment | Sees invoice creation and send status | Invoice binding, provider environment, operation status |
| 9. Payment evidence | Returns to a status page | Sees verified or reconciled provider state | Verified webhook or reconciliation evidence |
| 10. Permission | Sees scheduled, active, or expired truthfully | Sees the same permission-effective state | Deterministic lifecycle result and audit event |
| 11. Receipt | Views and exports the buyer receipt | Views receipt and revision history | Canonical payload, hash, public verification ID |
| 12. Verification | Shares public verification link | Can inspect audit detail | Privacy-minimized public projection |

## 8. Screen specifications

## 8.1 Public landing

**Route:** `/`  
**Primary audience:** Judge and general visitor  
**Purpose:** Explain the product in under 20 seconds and route the visitor to a working path.

Required content:

- one-line product description;
- concise problem and solution;
- `Open judge demo` primary action;
- `Verify a receipt` secondary action;
- explicit `PayPal Sandbox only` and `Hackathon demonstration` disclosure;
- repository and architecture links;
- statement that the product does not provide legal advice or ownership verification.

The landing page must not be a substitute for the actual application demo.

## 8.2 Judge launch and demo status

**Route:** `/demo`  
**Primary audience:** Judge and demo operator  
**Purpose:** Make the environment understandable and recoverable before the workflow starts.

Required content:

- current mode: `PayPal Sandbox` or `Simulated local fallback`;
- database seed state;
- PayPal availability status without credentials or sensitive details;
- current demo case summary;
- `Start as buyer` primary action when seed is clean;
- `Open creator workspace` secondary action;
- `Reset demo data` controlled action for creator session;
- last reset timestamp;
- warning that simulated mode is not PayPal Sandbox evidence.

Reset requires confirmation and must explain that current demo records will be removed and reseeded.

## 8.3 Creator access

**Route:** `/creator/access`  
**Primary audience:** Demo operator  
**Purpose:** Establish the short-lived creator session.

Required behavior:

- access-code field with password semantics;
- no account-creation language;
- clear demo-only explanation;
- generic invalid-code response that does not reveal configuration;
- visible loading state;
- automatic return to the originally requested creator route after success.

## 8.4 Creator workspace and asset list

**Route:** `/creator`  
**Primary audience:** Creator  
**Purpose:** Show current work without requiring the creator to understand internal state machines.

Required regions:

- role and mode banner;
- workspace summary;
- seeded asset card for `Harbor After Rain`;
- open-request queue grouped by next required actor;
- compact receipt-status summary;
- judge reset status;
- `Register asset metadata` secondary action.

The primary action follows the highest-priority open case. When no case exists, the primary action is `Copy buyer request link` from the asset detail.

## 8.5 Asset detail and request link

**Route:** `/creator/assets/:assetId`  
**Primary audience:** Creator  
**Purpose:** Establish the exact asset context before a buyer request.

Required content:

- project-owned preview;
- title, asset type, creator display name;
- provenance note;
- fingerprint algorithm and shortened value with copy control;
- active or archived state;
- request-link control;
- related cases.

The fingerprint description must state that it identifies a file representation and does not prove ownership.

## 8.6 Asset metadata registration

**Route:** `/creator/assets/new`  
**Primary audience:** Creator  
**Purpose:** Register metadata for a photograph or illustration without arbitrary public upload.

Required fields:

- title;
- type;
- creator display name;
- provenance note;
- preview reference chosen from supported project assets or controlled metadata input;
- fingerprint value or deterministic stand-in under the selected implementation.

The form must reject unsupported asset types and explain that file upload and ownership verification are outside P0.

## 8.7 Buyer request intake

**Route:** `/request/:capability`  
**Primary audience:** Buyer  
**Purpose:** Capture immutable intended-use evidence with minimal licensing vocabulary.

Required layout:

- asset preview and creator context;
- buyer name, organization, and email fields;
- intended-use textarea;
- plain-language prompt covering channel, territory, dates, audience, modification, exclusivity, attribution, sublicensing, and AI use;
- character count for the 40 through 4,000 limit;
- required consent acknowledgement;
- `Submit request` primary action;
- disclosure that later terms require creator approval and buyer acceptance.

Errors appear at the top in an error summary and next to affected fields. Focus moves to the summary after a failed submission.

## 8.8 Request received and extraction progress

**Primary audience:** Buyer  
**Purpose:** Confirm immutable submission without implying that terms are approved.

Required content:

- `Request received` status;
- asset and organization summary;
- next-step explanation;
- extraction progress or completed summary;
- unresolved-term count when available;
- safe refresh behavior;
- no payment or active-permission language.

If extraction fails, the original request remains saved. The buyer sees that the creator can review the request manually.

## 8.9 Structured terms review and clarification

**Creator route:** `/creator/cases/:caseId`  
**Buyer route:** `/request/:capability/clarify`  
**Purpose:** Resolve the supported P0 fields with evidence and visible provenance.

Each field row shows:

- plain-language label;
- proposed normalized value;
- resolution state: resolved, unresolved, contradictory, unsupported, or manually corrected;
- source evidence excerpt when present;
- confidence label and numeric detail in an expandable disclosure;
- provenance: deterministic extractor, local model, buyer answer, or creator correction;
- creator correction control where authorized.

Field order is fixed:

1. Use purpose
2. Channels
3. Paid advertising
4. Territory
5. Start date
6. Duration
7. Maximum impressions
8. Exclusivity
9. Modification scope
10. Attribution
11. Sublicensing
12. AI use

Clarification asks only unresolved or contradictory required fields. Unsupported values are explained and cannot be silently replaced.

## 8.10 Deterministic quote explanation

**Primary audience:** Creator, then buyer  
**Purpose:** Make the price reproducible and separate from AI authority.

Required content:

- terms version;
- pricing policy name and version;
- itemized line descriptions and integer-cent-backed display amounts;
- total;
- statement that AI did not choose the price;
- quote creation timestamp;
- blocked-reason panel when any required field is not quoteable.

For the canonical demo, the visible line items must total $425.00.

## 8.11 Creator decision

**Route:** `/creator/cases/:caseId`  
**Primary audience:** Creator  
**Purpose:** Record a deliberate decision on the exact terms and quote.

Primary action when quoteable:

- `Approve terms and quote`

Secondary actions:

- `Edit terms`
- `Ask buyer to clarify`
- `Reject request`

Before approval, the creator sees:

- asset identity;
- buyer organization;
- complete canonical terms;
- restrictions;
- quote amount and versions;
- a statement that approval does not activate permission or confirm payment.

Reject and clarification actions require a short plain-language reason. Material edits create a new version and visibly invalidate stale consent.

## 8.12 Buyer review and acceptance

**Route:** `/request/:capability/review`  
**Primary audience:** Buyer  
**Purpose:** Obtain explicit acceptance of the exact creator-approved version.

Required content:

- asset and creator identity;
- permitted use summary;
- explicit restrictions;
- start date, last permitted date, and UTC evaluation note;
- quote amount and currency;
- version reference;
- creator approval timestamp;
- acknowledgement that PayPal Sandbox is used for the demonstration;
- `Accept terms and continue` primary action;
- `Request a revision` secondary action.

The action must be unavailable if the creator approval is stale or any version no longer matches.

## 8.13 Invoice and payment handoff

**Route:** `/request/:capability/payment`  
**Primary audience:** Buyer  
**Purpose:** Show what is being paid and transfer payment to PayPal without conflating handoff with success.

Required states:

- invoice preparing;
- invoice sent;
- awaiting payment;
- paid confirmation pending;
- paid confirmed;
- canceled;
- fully refunded;
- reconciliation required;
- dependency unavailable.

Required content:

- amount and invoice reference;
- provider and environment label;
- terms version summary;
- `Continue to PayPal Sandbox` primary action when available;
- `Refresh payment status` secondary action;
- safe retry or reconciliation guidance;
- explicit simulated-mode label when the fake adapter is used.

Returning from PayPal does not itself prove payment. The screen waits for verified webhook or reconciliation evidence.

## 8.14 Creator payment and permission panel

**Route:** `/creator/cases/:caseId`  
**Primary audience:** Creator  
**Purpose:** Separate provider payment state from permission-effective state.

Display two distinct cards:

1. **Payment**: provider state, evidence source, last checked timestamp, invoice reference.
2. **Permission**: not issued, scheduled, active, expired, refunded, or revoked.

When reconciliation is required, the primary action is `Reconcile with PayPal`. This action must not imply that the creator can manually mark the invoice paid.

## 8.15 Receipt views

**Creator route:** `/creator/receipts/:receiptId`  
**Buyer route:** `/request/:capability/receipt`  
**Purpose:** Present the permission record and current lifecycle truth.

Required content:

- current permission status and reason;
- asset title, type, fingerprint, and creator;
- buyer organization;
- complete rights terms and restrictions;
- effective period;
- amount and currency;
- terms, policy, model, and extractor versions;
- creator approval and buyer acceptance timestamps;
- safe PayPal reference and payment status;
- receipt hash;
- revision number and previous-revision reference where applicable;
- printable view;
- canonical JSON export;
- public verification link.

Creator view additionally shows revision history and links to the audit stream. Buyer view excludes private creator notes and internal operations.

## 8.16 Public verification

**Route:** `/verify/:publicId`  
**Primary audience:** Public verifier  
**Purpose:** Answer whether the record exists, whether its hash is valid, and what its current public status means.

Required hierarchy:

1. Verification result
2. Current permission status
3. Permitted use and restrictions
4. Effective period
5. Asset fingerprint and receipt hash
6. Safe payment reference
7. What verification does and does not prove

Public outcomes:

- active;
- scheduled;
- expired;
- canceled;
- refunded;
- revoked;
- invalid;
- not found.

`Not found` and unauthorized internal details must not leak whether another private case exists.

## 8.17 Audit history

**Route:** `/creator/cases/:caseId/audit`  
**Primary audience:** Creator  
**Purpose:** Explain how the current record came to exist.

Each audit entry shows:

- timestamp;
- actor category;
- plain-language event name;
- outcome;
- terms, quote, invoice, permission, or receipt reference where relevant;
- correlation identifier in an expandable technical detail;
- redacted metadata only.

The default presentation is chronological. Filtering may be added only if it does not delay P0.

## 9. Low-fidelity wireframes

The wireframes establish hierarchy and interaction, not final visual styling.

### 9.1 Creator workspace, desktop

```text
+--------------------------------------------------------------------------------+
| RightsReceipt        Creator workspace      PAYPAL SANDBOX        Demo status  |
+----------------------+---------------------------------------------------------+
| Overview             | Maya Chen                                      [Reset] |
| Assets               |---------------------------------------------------------|
| Requests             | Needs your attention                                   |
| Receipts             | [1] Cedar & Tide Travel                                 |
| Demo status          |     Harbor After Rain                                   |
|                      |     Needs clarification: 5 terms        [Review request]|
|                      |---------------------------------------------------------|
|                      | Assets                                                  |
|                      | +----------------------+                                |
|                      | | Harbor After Rain    |                                |
|                      | | Photograph           |                                |
|                      | | Active               |                                |
|                      | | [Open asset]         |                                |
|                      | +----------------------+                                |
+----------------------+---------------------------------------------------------+
```

### 9.2 Buyer request, mobile

```text
+----------------------------------+
| RightsReceipt       Buyer request|
| Harbor After Rain                |
| [asset preview]                  |
|                                  |
| Your name                        |
| [______________________________] |
| Organization                     |
| [______________________________] |
| Email                            |
| [______________________________] |
|                                  |
| How will you use this image?     |
| [                              ] |
| [                              ] |
| [                              ] |
|                         0 / 4000 |
|                                  |
| [ ] I understand this is a       |
|     request, not active permission|
|                                  |
| [ Submit request              ]  |
+----------------------------------+
```

### 9.3 Creator terms review, desktop

```text
+--------------------------------------------------------------------------------+
| Cedar & Tide Travel  | Harbor After Rain | Needs clarification | v1            |
+--------------------------------------------------------------------------------+
| Evidence text                         | Structured terms                         |
|---------------------------------------+------------------------------------------|
| "paid Instagram and Facebook ads..." | Channel                                 |
| "United States and Canada..."        | Instagram paid, Facebook paid           |
| "about three months..."              | Evidence: highlighted phrase            |
| "may crop it..."                     | Confidence: High                        |
|                                       | [Edit]                                   |
|                                       |------------------------------------------|
|                                       | Start date                              |
|                                       | Unresolved                              |
|                                       | [Ask buyer] [Enter manually]            |
+---------------------------------------+------------------------------------------+
| 5 unresolved fields                     [Request clarification]                 |
+--------------------------------------------------------------------------------+
```

### 9.4 Buyer acceptance

```text
+------------------------------------------------------------------+
| Approved terms for Harbor After Rain                             |
| Creator: Maya Chen                 Version: Terms 3 / Quote 2     |
|------------------------------------------------------------------|
| Paid Instagram and Facebook ads                                  |
| United States and Canada                                         |
| November 15, 2026 through February 12, 2027                      |
| Up to 500,000 impressions                                        |
| Non-exclusive, crop only, no sublicensing, no AI use             |
|------------------------------------------------------------------|
| Price                                                     $425.00 |
| [View price details]                                              |
|                                                                  |
| [ ] I accept these exact terms and the PayPal Sandbox demo       |
|                                                                  |
| [ Accept terms and continue ]      [Request a revision]          |
+------------------------------------------------------------------+
```

### 9.5 Payment and permission

```text
+------------------------------------------------------------------+
| Payment                                                          |
| PayPal Sandbox invoice: SENT                                     |
| Amount: $425.00                     Last checked: 14:32 UTC       |
| [ Continue to PayPal Sandbox ]      [Refresh status]             |
|------------------------------------------------------------------|
| Permission                                                       |
| Not issued                                                       |
| Permission begins only after verified payment evidence.          |
+------------------------------------------------------------------+
```

After verified payment with a future start date:

```text
+------------------------------------------------------------------+
| Payment                                                          |
| PayPal Sandbox invoice: PAID                                     |
|------------------------------------------------------------------|
| Permission                                                       |
| SCHEDULED                                                        |
| Paid and issued. Use begins November 15, 2026 at 00:00 UTC.      |
| [View rights receipt]                                            |
+------------------------------------------------------------------+
```

### 9.6 Public verification

```text
+------------------------------------------------------------------+
| RightsReceipt verification                                      |
| [check icon] Record integrity verified                           |
|------------------------------------------------------------------|
| Current status: ACTIVE                                           |
| Harbor After Rain                                                |
| Paid Instagram and Facebook advertising                          |
| United States and Canada                                         |
| Valid through February 12, 2027                                  |
| Non-exclusive, crop only, no sublicensing, no AI use             |
|------------------------------------------------------------------|
| Receipt hash: 9f3a...18c2                         [Copy]           |
| PayPal reference: INV2-...                                       |
|------------------------------------------------------------------|
| This verifies the stored record and current status.              |
| It does not prove copyright ownership or legal enforceability.   |
| [Verify another record]                                          |
+------------------------------------------------------------------+
```

## 10. Responsive behavior

### 10.1 Wide screens, 1024 pixels and above

- Creator workspace may use a two-column navigation and content layout.
- Evidence and structured terms may appear side by side.
- Quote and decision summary may use a sticky secondary panel when it does not obscure content.
- Receipt details may use a two-column definition layout.

### 10.2 Medium screens, 768 through 1023 pixels

- Creator navigation collapses to a compact top bar or narrow rail.
- Evidence and terms stack, with evidence immediately below its field.
- Sticky action regions remain within the viewport only when keyboard and zoom behavior remain usable.

### 10.3 Small screens, below 768 pixels

- All content uses one column.
- Tables convert to labeled cards or horizontal scroll only when semantic association remains clear.
- Primary actions span the available content width.
- Secondary actions remain visually subordinate but reachable.
- Progress indicators show current and next steps rather than all technical stages.
- Long identifiers truncate visually but remain copyable in full.
- Modal dialogs are avoided for complex forms. Use full-page or inline confirmation surfaces.

### 10.4 Zoom and text reflow

The layout must remain usable at 200 percent browser zoom and with enlarged text. No consequential action depends on hover.

## 11. Form and validation behavior

- Validate on submit for most fields, with gentle inline validation after a field has been visited.
- Do not show errors before the user has had a chance to interact.
- Preserve valid values after a failed submission.
- Use one error summary with anchor links to each invalid field.
- Focus the error summary after server or client validation failure.
- Do not rely only on placeholder text for labels or instructions.
- Explain accepted formats before submission where the rule is not obvious.
- Server responses remain authoritative for consequential validation.
- A network failure must not clear entered request text.
- Double submission must be disabled or made idempotent without showing false success.

## 12. Loading, empty, error, and unavailable states

| Condition | User message | Required action |
| --- | --- | --- |
| Initial page load | `Loading case details` | Skeleton or progress indicator with accessible status text |
| Extraction pending | `Structuring the request` | Explain that original text is already saved |
| Model unavailable | `Automatic classification is unavailable` | Preserve deterministic results and offer creator review |
| No open requests | `No requests need attention` | Show how to open or copy the asset request link |
| Quote blocked | `A quote cannot be created yet` | List unresolved or unsupported fields |
| Stale version | `This record changed before your action completed` | Reload current version and preserve unsaved draft where safe |
| PayPal unavailable | `PayPal Sandbox is temporarily unavailable` | Keep consent intact and offer safe retry later |
| Invoice outcome unknown | `Payment status needs reconciliation` | Offer creator reconciliation, not manual paid override |
| Webhook delayed | `Waiting for verified payment confirmation` | Offer refresh and explain that return from PayPal is not proof |
| Capability invalid | `This buyer link is invalid or no longer active` | Contact creator guidance without leaking case details |
| Receipt not found | `No public record was found` | Verify identifier and try again |
| Hash mismatch | `Verification failed` | Stop reliance, show invalid status, direct creator to investigate |
| Reset in progress | `Restoring the demo scenario` | Block conflicting actions until seed is consistent |

Error copy avoids blame and does not expose stack traces, provider payloads, internal IDs, or secrets.

## 13. Confirmation and destructive-action rules

Confirmation is required for:

- rejecting a request;
- canceling an unpaid case;
- revoking a scheduled or active permission;
- resetting demo data;
- rotating or revoking a buyer capability;
- any future action that creates irreversible external effects.

The confirmation surface states:

- the object affected;
- the exact current state;
- the resulting state;
- whether payment is affected;
- whether a new receipt revision will be created;
- whether the action can be undone.

Approving terms and accepting terms are consequential but are not phrased as destructive actions. They still require a clear final review and an explicit button.

## 14. Accessibility interaction contract

P0 implementation must include:

- a skip link on creator and public application shells;
- semantic `header`, `nav`, `main`, `aside`, and `footer` regions where appropriate;
- one visible `h1` per route;
- logical heading levels;
- programmatic labels for every input and button;
- field errors connected with `aria-describedby`;
- an error summary announced after failed submission;
- visible keyboard focus with at least a 3-pixel treatment;
- keyboard access to every action and expandable disclosure;
- no drag-only, hover-only, or color-only interaction;
- minimum 44 by 44 pixel primary touch targets;
- text alternatives for the demo image and status icons;
- status updates announced through restrained live regions;
- focus movement after route changes, successful form submission, and modal confirmation;
- reduced-motion support;
- no automatic timeouts that discard unsaved user input;
- plain-language status and recovery copy.

Automated accessibility tools support but do not replace the manual keyboard and screen-reader checks scheduled for Turn 033.

## 15. Copy and terminology rules

Preferred terms:

- request
- proposed terms
- unresolved
- unsupported for automatic quoting
- creator-approved
- buyer-accepted
- deterministic quote
- PayPal Sandbox
- verified payment evidence
- scheduled permission
- active permission
- rights receipt
- public verification
- tamper-evident

Avoid:

- smart contract
- legally binding guarantee
- ownership verified
- escrow
- autonomous negotiation
- AI-approved
- AI-priced
- payment guaranteed
- immutable
- fraud-proof
- secure by PayPal

Dates display the date and the UTC interpretation when status depends on time. Money displays USD while retaining integer cents internally.

## 16. Mode and evidence labeling

Every payment-relevant surface shows one persistent mode badge:

- `PAYPAL SANDBOX`
- `SIMULATED LOCAL MODE`

Rules:

- Simulated mode uses a neutral caution treatment, not a success treatment.
- A simulated event cannot use the PayPal logo or language such as `verified by PayPal`.
- Sandbox evidence shows the safe invoice reference and evidence source.
- The current mode appears in the page header, invoice card, receipt, demo status, and captured screenshots.
- A mode change cannot occur inside an existing invoice binding.

## 17. Three-minute judge path

The final video script is owned by Turn 040, but implementation must preserve this interaction path.

| Time | Screen and action | Judging evidence |
| --- | --- | --- |
| 0:00 to 0:15 | Public landing and one-sentence problem | Immediate impact and product clarity |
| 0:15 to 0:35 | Buyer request with the canonical text | Natural-language intake and asset context |
| 0:35 to 0:58 | Creator terms review with evidence and unresolved fields | Visible local AI value and honest uncertainty |
| 0:58 to 1:18 | Clarification completed and deterministic $425 quote | Bounded AI and reproducible pricing |
| 1:18 to 1:38 | Creator approval and buyer acceptance | Two-sided consent tied to one version |
| 1:38 to 2:08 | PayPal Sandbox invoice creation, handoff, and payment | Central PayPal integration |
| 2:08 to 2:28 | Verified payment and scheduled or active permission | Truthful lifecycle state |
| 2:28 to 2:48 | Rights receipt and public verification | Distinctive product output |
| 2:48 to 2:58 | Authority summary and repository link | Technical credibility and honesty |

The recording fixture must use dates that make the shown permission state truthful. If the start date remains in the future, the video must show `scheduled`, not `active`.

## 18. State coverage checklist

Every required screen must define and eventually test these states where applicable:

- loading;
- loaded;
- empty;
- validation failure;
- authorization or capability failure;
- stale-version conflict;
- dependency unavailable;
- retryable failure;
- terminal failure;
- success;
- simulated mode;
- PayPal Sandbox mode;
- mobile reflow;
- keyboard focus order;
- reduced-motion behavior.

Turn 033 will perform the final systematic state and accessibility pass, but component implementations should not defer basic states until then.

## 19. Requirement and invariant traceability

This interaction contract materially advances the implementation path for:

- `RR-P0-006` through `RR-P0-022`;
- `RR-P0-025` through `RR-P0-031`;
- `RR-P0-040` through `RR-P0-046`;
- `RR-P0-052` through `RR-P0-061`;
- `RR-P0-066` through `RR-P0-068`.

Relevant domain invariants include:

- `RR-DOM-001` through `RR-DOM-013`;
- `RR-DOM-019` through `RR-DOM-037`;
- `RR-DOM-038` through `RR-DOM-044`;
- `RR-DOM-047` through `RR-DOM-050`.

No requirement passes solely because this interaction document exists.

## 20. Implementation handoff by turn

| Turn | Interaction responsibility |
| --- | --- |
| 007 | Create route shells, shared contracts, component foundations, and local quality commands without claiming finished screens |
| 008 | Support deterministic loading, empty, seeded, and reset states |
| 009 | Implement creator workspace, asset list, asset detail, and metadata registration |
| 010 | Implement buyer request intake and validation states |
| 011 | Implement field review, evidence, confidence, correction, and clarification surfaces |
| 012 | Implement quote breakdown and blocked-reason presentation |
| 013 | Implement creator decision, buyer acceptance, and simulated vertical slice |
| 019 | Connect real local inference output to evidence and confidence components |
| 021 through 027 | Implement payment modes, invoice status, handoff, reconciliation, and lifecycle UI |
| 028 through 030 | Implement audit, receipt, verification, and temporal status surfaces |
| 033 | Complete responsive, copy, interaction-state, and accessibility review |
| 036 | Automate the seeded judge path and required failure paths |
| 037 | Implement demo reset, health, error boundaries, and operational status |
| 040 through 043 | Freeze and verify the exact video and submission path |

## 21. Turn 006 completion test

Turn 006 is complete when:

- every required P0 surface has a role, purpose, primary action, and blocked-state rule;
- creator, buyer, public verifier, and judge journeys are separated clearly;
- payment and permission states cannot be confused by the screen hierarchy;
- evidence, uncertainty, and manual correction are visible before creator approval;
- route ownership and capability boundaries match the accepted architecture;
- low-fidelity wireframes communicate the complete demo path;
- responsive and accessibility behavior is explicit;
- loading, empty, error, stale, dependency, and recovery states are defined;
- the three-minute judge path can be followed without inventing a new screen;
- no document claims that the interface has already been implemented or tested.
