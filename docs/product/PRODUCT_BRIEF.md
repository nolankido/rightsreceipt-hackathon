# RightsReceipt Product Brief and Competitive Position

**Status:** Frozen product direction  
**Owning turn:** Turn 002  
**Last reviewed:** October 25, 2026 HST  
**Target event:** PayPal AI Hackathon  
**Scope note:** Turn 003 converts this brief into an exact MVP scope and acceptance matrix. Architecture decisions begin in Turn 004.

## 1. Executive product contract

RightsReceipt helps independent visual creators and small business buyers turn a vague request to use a photograph or illustration into a structured, human-approved, PayPal-paid, verifiable permission record.

The product is not a general invoice assistant, a stock marketplace, an escrow service, or an AI lawyer. Its narrow job is to connect four things that are usually separated:

1. what a buyer wants to do with a creative work;
2. what the creator is actually willing to permit;
3. what price follows from the creator's own policy; and
4. whether PayPal confirms that the agreed invoice was paid.

The resulting rights receipt shows the permission scope and its current status without pretending to prove copyright ownership or legal enforceability.

## 2. Problem statement

Independent creators often receive licensing requests through email, direct messages, or informal conversations. A typical request may say, "Can we use this photo in an ad?" while omitting important details such as:

- media and platform;
- commercial or editorial use;
- paid advertising;
- territory;
- start date and duration;
- expected audience or impressions;
- exclusivity;
- cropping or other modifications;
- attribution;
- sublicensing;
- AI-training rights.

The creator then has to interpret the request, ask follow-up questions, choose a price, communicate terms, create an invoice, monitor payment, and preserve evidence of what was agreed. Buyers face the mirror problem. They may pay an invoice but still lack a concise record of the exact permission they purchased.

The central product problem is therefore not invoice creation alone. It is the gap between an informal usage request, an explicit permission scope, and confirmed payment.

## 3. Target users

### Primary user: independent visual creator

Examples include a photographer, illustrator, designer, or small creative studio that owns or controls visual work and occasionally licenses it directly.

Characteristics:

- receives direct requests outside a formal marketplace;
- does not have a dedicated licensing or legal operations team;
- wants to respond professionally without creating a custom process for every request;
- needs control over price, terms, and final approval;
- values a clear audit trail but does not want enterprise contract software.

### Primary counterparty: small business buyer

Examples include a local brand, agency, publisher, event organizer, or content team requesting permission to use a specific visual asset.

Characteristics:

- knows the intended campaign but may not know licensing terminology;
- wants a clear quote and a fast payment path;
- needs evidence of what use was approved;
- benefits from a plain-language summary rather than a dense contract workflow.

### Secondary future users

These users inform the design but are not assumed to be in the first MVP:

- creator managers and assistants;
- agencies representing several creators;
- internal marketing procurement teams;
- buyers renewing an existing permission;
- creators licensing audio, video, writing, or other work types.

## 4. Jobs to be done

### Creator job

When a buyer asks to use my work, help me turn the vague request into explicit, reviewable terms and a consistent quote, so I can approve the deal, get paid, and later show exactly what I permitted.

### Buyer job

When I want to use a creator's work, help me describe the intended use, resolve missing terms, pay through a trusted payment flow, and receive a clear record of what I may do.

### Shared trust job

When either party later reviews the deal, show the same canonical terms, the PayPal invoice reference, payment-derived status, and relevant timestamps so the parties are not relying on memory or disconnected messages.

## 5. Value proposition

### Before RightsReceipt

- The buyer sends an ambiguous message.
- Important terms are discovered piecemeal.
- Pricing may be improvised.
- Approval is mixed into email or chat.
- The invoice describes a generic service.
- Payment status and permission status are disconnected.
- The parties may not share one concise record of the agreed use.

### After RightsReceipt

- The request becomes structured fields with evidence and confidence.
- Consequential omissions become explicit clarification questions.
- A deterministic policy produces an explainable quote.
- The creator approves or edits the exact terms.
- The buyer accepts the same canonical terms.
- PayPal creates and tracks the invoice.
- A verified payment event activates the permission.
- A tamper-evident receipt summarizes the scope and current status.

### Core promise

**Know what was allowed. Know it was paid.**

## 6. Product principles

### 6.1 AI structures information but does not hold authority

AI may extract, classify, summarize, identify ambiguity, and propose clarification questions. It may not:

- choose the final price;
- approve a license;
- accept terms for the buyer;
- confirm payment;
- activate, revoke, or extend a permission.

### 6.2 Deterministic code handles money and lifecycle rules

Every monetary amount must come from versioned creator policy and integer minor-unit calculations. State transitions must follow explicit rules and stored evidence.

### 6.3 Uncertainty remains visible

A missing or low-confidence material term must be marked as unresolved. The system asks a concise question or requires manual correction rather than silently filling the field.

### 6.4 Human consent is explicit

The creator approves the final terms and quote. The buyer accepts the same canonical terms before payment. Neither action is inferred from conversational text alone.

### 6.5 PayPal is the payment system of record

RightsReceipt may display local state, but payment-derived activation must be based on the PayPal Sandbox invoice lifecycle or an explicit fake adapter used only for local tests.

### 6.6 The record is verifiable but modest in its claims

A rights receipt can be tamper-evident and publicly verifiable without claiming that it proves authorship, ownership, identity, enforceability, or buyer compliance.

### 6.7 One coherent flow is more valuable than many partial features

The hackathon build prioritizes one complete request-to-receipt journey over a broad marketplace, generalized contract system, or collection of disconnected AI features.

## 7. Canonical product flow

1. **Select asset:** The creator has registered a visual asset with a stable internal identifier and fingerprint.
2. **Describe intended use:** The buyer writes the intended use in ordinary language and provides required contact information.
3. **Structure request:** The AI and deterministic extractors produce proposed rights fields, evidence spans, confidence, and unresolved terms.
4. **Clarify:** The system asks only the questions required to resolve consequential gaps.
5. **Quote:** The creator's versioned policy generates an itemized amount in integer cents.
6. **Creator decision:** The creator approves, edits, or rejects the proposed permission and quote.
7. **Buyer acceptance:** The buyer reviews and accepts the canonical terms.
8. **PayPal invoice:** RightsReceipt creates and sends a matching PayPal Sandbox invoice and stores its identifier.
9. **Payment confirmation:** A verified webhook and, when necessary, API reconciliation establish the current invoice state.
10. **Permission activation:** A paid state activates the permission under explicit lifecycle rules.
11. **Receipt:** RightsReceipt issues a canonical receipt with scope, restrictions, dates, status, PayPal reference, policy version, and verification hash.
12. **Verification:** A public route reports whether the receipt is active, expired, refunded, revoked, or otherwise not active.

## 8. Initial market wedge

The initial product wedge is direct licensing of a creator-controlled photograph or illustration for a one-off commercial use.

The product direction assumes:

- a specific known asset rather than an open asset marketplace;
- a direct creator-to-buyer relationship;
- creator-defined pricing policy;
- a structured permission rather than open-ended legal drafting;
- a PayPal Sandbox invoice in USD for the hackathon demonstration;
- a human-approved transaction rather than autonomous commerce.

Turn 003 will define the exact supported field values, P0 requirements, exclusions, and testable acceptance criteria. This brief does not silently expand the MVP to every creator type, currency, jurisdiction, or licensing arrangement.

## 9. Primary demonstration scenario

### Parties and asset

- **Creator:** Maya Chen, an independent photographer. This is a fictional demo identity.
- **Buyer:** Cedar & Tide Travel, a fictional small travel brand.
- **Asset:** "Harbor After Rain," an original or project-owned demonstration photograph with documented provenance.
- **Campaign:** Paid social advertising.

### Buyer's initial request

> We would like to use Harbor After Rain in paid Instagram and Facebook ads in the United States and Canada for about three months. We expect around 500,000 impressions and may crop it for vertical formats.

### Structured terms found in the request

- asset: Harbor After Rain;
- use type: commercial;
- media: Instagram and Facebook;
- paid advertising: yes;
- territory: United States and Canada;
- duration: approximately three months;
- expected impressions: about 500,000;
- modification: cropping requested.

### Material terms still unresolved

- exact start date;
- exclusivity;
- attribution requirement;
- sublicensing;
- AI-training rights.

### Clarified canonical terms

- start date: November 15, 2026;
- duration: 90 days;
- territory: United States and Canada;
- platforms: Instagram and Facebook paid ads;
- expected impressions: up to 500,000;
- exclusivity: non-exclusive;
- modifications: cropping for aspect ratio only;
- attribution: not required inside the advertisement;
- sublicensing: prohibited;
- AI training or model evaluation: prohibited.

### Demonstration pricing policy

The following values are an illustrative creator policy for the demo, not market-price guidance:

| Line item | Amount |
| --- | ---: |
| Base commercial digital license | $200.00 |
| Paid social advertising | $100.00 |
| United States and Canada territory | $50.00 |
| 90-day term | $50.00 |
| Crop permission | $25.00 |
| **Total** | **$425.00** |

The application must derive the total as 42,500 cents through deterministic code. The AI does not select or alter these amounts.

### Demo conclusion

The creator approves the terms and quote. The buyer accepts. RightsReceipt creates and sends the PayPal Sandbox invoice. A sandbox payment produces a verified paid event. The application activates the permission and displays a receipt verification page that shows the exact scope and active status.

A refund or revocation edge case may appear in supporting material, but the three-minute primary demo must remain focused on the successful end-to-end path.

## 10. Why PayPal is central

PayPal is not an ornamental checkout button in this product. It is the payment rail and payment-state authority that connects the accepted permission to activation.

The intended integration uses the PayPal Invoicing API to:

- obtain an OAuth access token in the sandbox;
- create a draft invoice from the creator-approved quote;
- send the invoice to the buyer;
- expose or retrieve the buyer payment link;
- retrieve invoice status for reconciliation;
- receive relevant invoice lifecycle webhooks;
- associate the PayPal invoice identifier with the canonical permission and receipt;
- respond to paid, cancelled, and refunded states under explicit rules.

RightsReceipt must not mark a permission active merely because the buyer clicked a local button or because an AI response says payment succeeded. The PayPal state, verified through the integration, controls payment-derived activation.

## 11. AI task contract at the product level

The AI contribution must be visible, useful, and bounded.

### The AI should

- classify intended use;
- identify supported platforms, territories, duration language, audience estimates, and requested modifications;
- identify explicit positive and negative terms;
- attach evidence from the buyer's text;
- report confidence by field;
- flag contradictions and omissions;
- produce concise clarification questions;
- preserve the model or extractor version used.

### The AI should not

- fabricate missing rights;
- infer consent;
- decide whether a license is legally sufficient;
- set or negotiate prices autonomously;
- make a payment claim;
- produce unsupported legal conclusions;
- override creator policy or lifecycle rules.

The implementation should not require a paid inference API. The planned direction is a compact local model combined with high-precision deterministic extraction, with safe abstention and correction in the interface.

## 12. Competitive landscape

### Snapshot method and limitation

This positioning snapshot was reviewed on October 25, 2026 HST using public Devpost project pages and official contest materials. Public submissions can change before the deadline, and search indexing may be incomplete. The conclusion is a working competitive position, not a guarantee that no similar project exists.

### Current contest clusters

| Cluster | Public examples | What those products emphasize | RightsReceipt distinction |
| --- | --- | --- | --- |
| AI invoicing and collections | [Ledgerbird](https://devpost.com/software/ledgerbird), [Cobra](https://devpost.com/software/cobra-jbu1wo), [Settle](https://devpost.com/software/settle-ih7m5g) | Turn messages into invoices, manage receivables, and chase late payment | Structures usage rights before invoicing and activates a permission after payment |
| Agent payment guardrails | [Agent Wallet Guard](https://devpost.com/software/agent-wallet-guard), [acp-sandbox](https://devpost.com/software/acp-sandbox), [Pulse Safe Commerce Agent](https://devpost.com/software/pulse-safe-commerce-agent) | Constrain how agents initiate or approve money movement | Governs what a buyer may do with a specific creative asset, not only whether an agent may pay |
| AI escrow and deliverable verification | [ProofPay](https://devpost.com/software/proofpay-ai-verified-escrow-for-freelance-work), [TrustLock](https://devpost.com/software/trustlock), [EscrowEase](https://devpost.com/software/escrowease) | Evaluate whether commissioned work meets a brief before funds are released | Licenses existing creative work and resolves the permission scope before use |
| Broad payment assistants and commerce agents | [AI PAY](https://devpost.com/software/ai-pay), [PayAgent AI](https://devpost.com/software/payagent-ai-autonomous-commerce-smart-invoicing), [ShopMate](https://devpost.com/software/shopmate-mrgj1p) | General natural-language commerce, shopping, payment, and merchant operations | Uses a narrow rights-specific workflow with an explicit schema and receipt |
| General transaction analysis | [TANGLE](https://devpost.com/software/tangle-paypal-ai), [ReconPilot](https://devpost.com/software/reconpilot), [SettleSight](https://devpost.com/software/settlesight-5vwzu0) | Reconcile, investigate, or analyze transaction records | Creates the commercial permission and its payment-linked record rather than analyzing transactions after the fact |

The reviewed public entries did not reveal a close match centered on direct licensing of an existing visual asset with field-level rights extraction, creator policy pricing, PayPal invoice activation, and a public rights receipt.

### Lessons from the competitive field

1. A generic "AI payment agent" is not sufficiently differentiated.
2. Real PayPal Sandbox execution, webhook handling, and clear testing instructions are becoming baseline expectations.
3. Human approval and deterministic guardrails are common, so RightsReceipt must show a domain-specific reason for those controls.
4. Polished entries demonstrate one complete workflow instead of listing speculative capabilities.
5. The winning narrative must lead with the licensing problem, not with technology names.
6. The receipt and verification experience must be visible in the demo because it is the clearest proof that this is more than another invoice generator.

## 13. Defensible differentiation

### 13.1 Rights-first data model

The primary object is a structured permission for a specific asset. The invoice is connected to that object rather than serving as the entire product.

### 13.2 Field-level evidence and uncertainty

Each material term can show where it came from and how confident the extraction is. Missing terms remain visibly unresolved.

### 13.3 Creator-owned policy

Pricing follows the creator's explicit, versioned rules. The system can explain every line item and reproduce the same result from the same inputs.

### 13.4 Two-sided acceptance

Creator approval and buyer acceptance refer to one canonical version of the terms. This reduces ambiguity between the quote, invoice, and receipt.

### 13.5 Payment-linked permission lifecycle

The permission is not active merely because terms were drafted. Verified PayPal state controls payment-derived activation, while later cancellation, refund, expiry, or revocation remains visible.

### 13.6 Verifiable receipt

The output is not only a payment receipt. It is a concise record of what was permitted, what was excluded, when the permission applies, and whether its status remains active.

### 13.7 Honest authority boundaries

The product makes the division of responsibility legible:

- AI structures and asks;
- deterministic code prices and enforces transitions;
- people approve and accept;
- PayPal confirms payment state.

## 14. Positioning statement

For independent visual creators and small business buyers who handle direct licensing requests through informal messages, RightsReceipt is an AI-assisted licensing workflow that turns intended use into explicit terms, a creator-controlled quote, a PayPal invoice, and a verifiable permission record.

Unlike general invoice assistants, payment agents, or e-signature tools, RightsReceipt centers the rights attached to a specific creative asset and keeps pricing, consent, payment confirmation, and permission status traceable to one canonical record.

## 15. Messaging hierarchy

### Five-word description

**Paid permissions for creative work.**

### One-line description

RightsReceipt turns a vague request to use an image into human-approved terms, a PayPal invoice, and a verifiable permission record.

### Fifteen-second pitch

A buyer asks to use a creator's image, but the request leaves out important rights. RightsReceipt uses AI to structure the request and identify gaps, deterministic policy to calculate the quote, human approval for the terms, and PayPal to confirm payment before issuing a verifiable rights receipt.

### Proof points

- field-level evidence and confidence;
- no AI-set price or AI-confirmed payment;
- real PayPal Sandbox invoice lifecycle;
- creator approval and buyer acceptance;
- payment-linked activation;
- public verification of current status.

## 16. Judging-criteria strategy

The official rules state that eligible entries are judged on five equally weighted criteria. RightsReceipt should build visible evidence for every criterion.

| Criterion | Product evidence to demonstrate | Failure to avoid |
| --- | --- | --- |
| Technological Implementation | Local AI extraction, deterministic pricing, PayPal Invoicing integration, verified webhooks, lifecycle reconciliation, receipt hashing, automated tests | A static prototype, mocked payment presented as real, or PayPal used only as a decorative button |
| Design | Clear buyer and creator roles, correction controls, explicit uncertainty, accessible status language, coherent receipt and verification views | A developer dashboard that requires narration to understand |
| Potential Impact | Concrete direct-licensing workflow for creators without licensing staff and buyers without specialist vocabulary | Broad unsupported market claims or a problem statement disconnected from the demo |
| Innovation/Idea | Rights-first object model, payment-linked permission activation, field evidence, and a verifiable rights receipt | Positioning as another generic invoice agent |
| Presentation | A single end-to-end scenario that moves from vague request to active receipt within three minutes | Feature inventory, excessive setup footage, or claims not shown working |

## 17. Prize strategy

### Primary targets

1. **Best Use of PayPal + AI:** PayPal and AI are both necessary to the demonstrated outcome and have distinct, bounded responsibilities.
2. **Most Creative:** The project treats permissions for creative work as structured, payment-linked records rather than generic invoices.
3. **Best Demo Delivery:** The request, ambiguity, quote, payment, and receipt create a clear visual story.

### Secondary targets

4. **Most Impactful:** The entry can make a specific case for reducing administrative and trust friction for independent creators and small buyers.
5. **Best Use of Agentic Commerce:** The workflow contains agent-like structuring and clarification, but entry into this category must not depend on overstating autonomy.

### Optional sponsor track

An AG Grid or AG Studio rights-portfolio dashboard may support a sponsor-prize submission only after the core P0 flow is stable. It remains optional P2 work and must not delay PayPal reliability, receipt verification, testing, or the primary video.

## 18. Presentation strategy

The final video must remain below three minutes. The exact script belongs to later demo turns, but the product brief locks this narrative arc:

| Approximate time | Demonstration |
| --- | --- |
| 0:00 to 0:20 | State the creator and buyer problem using the vague request |
| 0:20 to 0:55 | Show AI-extracted terms, evidence, confidence, and missing fields |
| 0:55 to 1:20 | Answer clarifications and show the deterministic $425 quote |
| 1:20 to 1:45 | Show creator approval and buyer acceptance |
| 1:45 to 2:20 | Create, send, and pay the PayPal Sandbox invoice |
| 2:20 to 2:45 | Show verified payment activating the permission and generating the receipt |
| 2:45 to 2:58 | Verify the receipt publicly and restate the authority boundaries |

The video should show working product behavior, not slides that merely describe future behavior.

## 19. Prohibited claims

Public copy, screenshots, the demo video, and Devpost materials must not claim or imply that RightsReceipt:

- provides legal advice;
- creates a legally sufficient agreement for every jurisdiction;
- verifies copyright ownership, identity, or authority to license;
- prevents infringement or guarantees buyer compliance;
- autonomously negotiates or approves consequential terms;
- lets AI set prices or move money;
- confirms payment without PayPal-derived evidence;
- provides escrow or holds funds;
- is approved, endorsed, certified, or secured by PayPal;
- uses production payments during the hackathon;
- is tamper-proof or immutable;
- uses blockchain unless a real implementation is later approved and built;
- has perfect extraction accuracy;
- replaces a lawyer, licensing specialist, marketplace, or contract-management system;
- supports work types, currencies, jurisdictions, or lifecycle states that are not implemented and tested.

Preferred language includes "AI-assisted," "creator-approved," "buyer-accepted," "deterministic quote," "PayPal Sandbox," "tamper-evident," and "permission record."

## 20. Directional product success conditions

Turn 003 will convert these into exact requirements and verification methods. At the product level, success means:

- a judge understands the problem and value within 20 seconds;
- no material term is silently invented;
- the same terms and policy version reproduce the same quote;
- the invoice amount and description match the accepted permission;
- PayPal-derived payment state controls activation;
- the receipt shows scope, restrictions, dates, references, and current status;
- the complete happy path can be demonstrated comfortably within three minutes;
- a fresh visitor can distinguish implemented behavior from planned behavior;
- the repository remains useful as a portfolio project even without a prize.

## 21. Principal risks and positioning responses

| Risk | Response |
| --- | --- |
| Licensing can become legally complex | Constrain the supported terms, use plain language, record explicit consent, and avoid legal sufficiency claims |
| The contest has many invoice and payment agents | Lead with the rights object, two-sided agreement, and verification receipt |
| AI extraction can be wrong | Show evidence, confidence, correction, and abstention |
| PayPal sandbox events can be delayed or out of order | Verify webhooks, process idempotently, reconcile current invoice state, and maintain a clearly labeled fake adapter for local tests |
| A demo asset could introduce IP or trademark risk | Use an original or project-owned asset with documented provenance and fictional parties |
| Sponsor work can expand scope | Treat sponsor integration as optional after the core flow passes |
| A broad future vision can weaken credibility | Demonstrate one narrow, complete use case and label all future work clearly |

## 22. Frozen decisions and open decisions

### Frozen by Turn 002

- target users and their primary jobs;
- the direct visual-asset licensing problem;
- the core value proposition and messaging hierarchy;
- the primary demonstration scenario;
- the rights-first competitive position;
- PayPal's central role in invoice and payment state;
- AI authority boundaries;
- judging and prize strategy;
- prohibited public claims.

### Deferred to Turn 003

- exact P0, P1, and P2 feature list;
- supported enumeration values and field validation;
- formal non-goals for the hackathon MVP;
- requirement identifiers;
- acceptance tests and evidence owners;
- exact cut rules by feature.

### Deferred to later turns

- architecture and technology decisions;
- domain model and state-transition specification;
- screen-level interaction design;
- model labels, thresholds, and evaluation targets;
- PayPal adapter details;
- security implementation;
- final demo script and submission copy.

## 23. Source snapshot

Official event and platform references reviewed for this brief:

- [PayPal AI Hackathon Official Rules](https://paypalaihackathon.devpost.com/rules)
- [PayPal AI Hackathon Dates](https://paypalaihackathon.devpost.com/details/dates)
- [PayPal Invoicing API quick start](https://developer.paypal.com/api/invoicing)
- [PayPal Invoicing webhooks](https://developer.paypal.com/api/invoicing/webhooks/)
- [PayPal Invoicing troubleshooting](https://developer.paypal.com/invoicing/troubleshooting)

Competitive examples are linked directly in Section 12. This snapshot should be reviewed again before final submission because projects, rules, and sponsor requirements may change.
