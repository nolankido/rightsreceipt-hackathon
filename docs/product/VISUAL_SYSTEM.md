# RightsReceipt Visual System and Component Contract

**Status:** Accepted visual baseline  
**Owning turn:** Turn 006  
**Last reviewed:** October 25, 2026 HST  
**Related interaction record:** [`USER_JOURNEYS.md`](USER_JOURNEYS.md)  
**Related product records:** [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md), [`MVP_SCOPE.md`](MVP_SCOPE.md)

## 1. Purpose

This document defines a restrained, portfolio-grade visual system for the RightsReceipt hackathon MVP.

It establishes:

- visual direction;
- semantic design tokens;
- typography, spacing, layout, color, border, elevation, and motion rules;
- component responsibilities;
- status language and visual treatment;
- responsive patterns;
- accessibility constraints;
- implementation and verification handoffs.

This is a design contract, not an implementation claim. No CSS, React component, visual regression test, or deployed interface exists as of Turn 006.

## 2. Visual direction

### 2.1 Working direction: Evidence Ledger

RightsReceipt should feel like a calm evidence workspace rather than a speculative AI dashboard or a high-pressure checkout funnel.

The design combines:

- editorial clarity;
- document-like hierarchy;
- restrained financial precision;
- visible provenance;
- simple status communication;
- generous spacing;
- compact technical detail only when requested.

The interface should communicate that consequential decisions are reviewable and versioned.

### 2.2 Desired qualities

- Calm
- Credible
- Precise
- Human-controlled
- Traceable
- Accessible
- Modern without trend dependence
- Visually distinctive enough for a hackathon demo

### 2.3 Qualities to avoid

- Neon AI gradients
- Glowing cards
- Excessive glass effects
- Crypto or blockchain visual language
- Casino or urgency cues
- Confetti after payment
- Dark patterns around acceptance
- Dense enterprise tables as the primary experience
- Chat bubbles as the central interaction model
- PayPal brand imitation
- Legal-document intimidation

## 3. Brand expression

### 3.1 Name

Display the product name as `RightsReceipt` with capital `R` characters.

Do not alternate among `Rights Receipt`, `rightsReceipt`, or `Rightsreceipt` in public product copy.

The repository name may remain `rightsReceipt` because repository naming and product presentation are separate concerns.

### 3.2 Wordmark

P0 uses a typographic wordmark rather than requiring a custom logo asset.

Recommended treatment:

- medium or semibold weight;
- tight but readable letter spacing;
- no gradient fill;
- optional small receipt-corner or verification-mark glyph only if it remains clear at 16 pixels;
- never combine the product mark with the PayPal logo in a way that implies endorsement.

### 3.3 Tagline

Preferred concise tagline:

**Know what was allowed. Know it was paid.**

The tagline appears on the public landing page and submission materials, not in every application header.

## 4. Token naming

Tokens use semantic names rather than component-specific color names.

Examples:

```text
--rr-color-canvas
--rr-color-surface
--rr-color-text
--rr-color-text-muted
--rr-color-border
--rr-color-action
--rr-color-success
--rr-space-4
--rr-radius-md
--rr-shadow-raised
```

Rules:

- Components consume semantic tokens.
- Raw hexadecimal colors do not appear throughout component files.
- Status colors remain paired with text and iconography.
- Dark mode is not required for P0.
- Token values may receive minor implementation adjustments if contrast testing requires them, but semantic meaning remains stable.

## 5. Color system

### 5.1 Neutral foundation

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#F7F7F4` | Application background |
| `surface` | `#FFFFFF` | Cards, forms, document panels |
| `surface-subtle` | `#F0F2F3` | Grouped regions, read-only fields |
| `text` | `#15171A` | Primary text |
| `text-muted` | `#5B6470` | Secondary text and metadata |
| `text-subtle` | `#6B7280` | Tertiary labels used only at compliant sizes |
| `border` | `#D7DBE0` | Standard boundaries |
| `border-strong` | `#AEB5BE` | High-emphasis boundaries |
| `overlay` | `rgba(21, 23, 26, 0.54)` | Confirmation backdrops |

### 5.2 Action colors

| Token | Value | Use |
| --- | --- | --- |
| `action` | `#3157D5` | Primary actions and active links |
| `action-hover` | `#2444B7` | Hover and active state |
| `action-subtle` | `#EEF2FF` | Selected row or supportive action background |
| `focus` | `#3157D5` | Keyboard focus ring |

White text on `#3157D5` has a calculated contrast ratio above 6:1. The final implementation still requires browser-based contrast verification.

### 5.3 Semantic status colors

| Meaning | Strong token | Subtle background | Use |
| --- | --- | --- | --- |
| Success or active | `#1E6B45` | `#EAF6EF` | Verified active state, completed safe operation |
| Information | `#3157D5` | `#EEF2FF` | Neutral guidance and current step |
| Scheduled | `#5B3FD1` | `#F1EEFF` | Paid permission that begins later |
| Warning or unresolved | `#8A5A00` | `#FFF6DA` | Missing information, pending review, reconciliation |
| Danger or invalid | `#A61B1B` | `#FDECEC` | Rejection, invalid hash, destructive action |
| Neutral terminal | `#374151` | `#EEF0F2` | Canceled, expired, archived, simulated mode |

White text on each strong semantic color has a calculated contrast ratio above 5.9:1.

### 5.4 Status use rules

- `Active` uses success.
- `Scheduled` uses scheduled purple, never success green.
- `Awaiting payment` uses information or warning depending on urgency, never success.
- `Reconciliation required` uses warning.
- `Expired` uses neutral terminal.
- `Canceled` uses neutral terminal.
- `Refunded` uses danger or neutral terminal with explicit refund text, depending on context.
- `Revoked` uses danger.
- `Verification invalid` uses danger.
- `Simulated local mode` uses neutral terminal with an outlined badge.
- `PayPal Sandbox` uses information with explicit text, not borrowed PayPal brand styling.

### 5.5 Color accessibility

- No meaning depends on hue alone.
- Status chips include visible text and a distinct icon or shape.
- Links remain underlined inside body copy.
- Focus treatment must remain visible against every background.
- Disabled controls use reduced emphasis but maintain readable text.
- Placeholder text is not used as the only instruction.
- Final contrast must be tested in Turn 033 at normal, hover, focus, disabled, and error states.

## 6. Typography

### 6.1 Font stack

P0 uses a system font stack to avoid third-party font loading, privacy concerns, and layout shifts.

```css
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
```

Monospace identifiers use:

```css
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
  "Liberation Mono", monospace;
```

### 6.2 Type scale

| Token | Size | Line height | Weight | Use |
| --- | ---: | ---: | ---: | --- |
| `display` | 48px | 56px | 650 | Public landing statement on wide screens |
| `h1` | 36px | 44px | 650 | Route title |
| `h2` | 28px | 36px | 650 | Major section |
| `h3` | 22px | 30px | 620 | Card group or workflow section |
| `h4` | 18px | 26px | 620 | Component heading |
| `body-lg` | 18px | 30px | 400 | Introductory and receipt summary text |
| `body` | 16px | 26px | 400 | Default content |
| `body-sm` | 14px | 22px | 400 | Metadata and supporting details |
| `label` | 14px | 20px | 600 | Form labels and compact headings |
| `caption` | 12px | 18px | 500 | Version and identifier metadata |
| `mono` | 13px | 20px | 500 | Hashes, references, and machine values |

Mobile may reduce `display` to 38px and `h1` to 30px. Body text remains at least 16px in form-heavy buyer surfaces.

### 6.3 Typography rules

- Use sentence case for headings, buttons, table headers, and status labels.
- Avoid full uppercase except short persistent mode badges.
- Keep line length between approximately 55 and 75 characters for long-form content.
- Use tabular numerals for money, dates in aligned tables, and metric comparisons.
- Do not use light font weights for important information.
- Long identifiers use monospace and accessible truncation with a full copy action.
- A version number never receives more visual emphasis than the user-facing terms it identifies.

## 7. Spacing system

The spacing base unit is 4 pixels.

| Token | Value | Typical use |
| --- | ---: | --- |
| `space-1` | 4px | Tight icon gap |
| `space-2` | 8px | Inline control gap |
| `space-3` | 12px | Compact field grouping |
| `space-4` | 16px | Standard component padding |
| `space-5` | 20px | Form row gap |
| `space-6` | 24px | Card padding and section gap |
| `space-8` | 32px | Major card separation |
| `space-10` | 40px | Route section separation |
| `space-12` | 48px | Page block separation |
| `space-16` | 64px | Public landing section separation |
| `space-20` | 80px | Wide-screen hero spacing |

Rules:

- Form labels and controls remain visually grouped.
- Error text remains closer to its field than to the next field.
- Dense audit and version metadata may use the compact scale.
- Consequential decision panels use at least `space-6` internal padding.
- Mobile page gutters use 16px. Tablet uses 24px. Wide screens use 32px or more within the maximum container.

## 8. Layout system

### 8.1 Containers

| Token | Maximum width | Use |
| --- | ---: | --- |
| `content-narrow` | 680px | Buyer forms, authentication, clarification |
| `content-reading` | 760px | Receipt explanation and public verification |
| `content-standard` | 1040px | Case review and workspace content |
| `content-wide` | 1240px | Creator workspace and side-by-side evidence |

All containers retain responsive side gutters.

### 8.2 Grid

Wide creator screens use a 12-column grid. Typical patterns:

- 3 columns navigation, 9 columns content;
- 7 columns evidence, 5 columns structured review;
- 8 columns main case content, 4 columns action summary;
- 6 and 6 columns for payment and permission cards.

Below 768 pixels, layouts become one column.

### 8.3 App shells

**Creator shell**

- persistent role and mode context;
- compact workspace navigation;
- page title and current stage;
- main content;
- optional action summary;
- no hidden privileged actions in overflow menus when they are the next required action.

**Buyer shell**

- product mark;
- asset context;
- compact progress;
- narrow content column;
- one primary action;
- no global creator navigation.

**Public verification shell**

- minimal product header;
- verification result first;
- reading-width content;
- no privileged navigation.

## 9. Breakpoints

| Name | Minimum width | Intended behavior |
| --- | ---: | --- |
| `xs` | 0px | One-column mobile layout |
| `sm` | 480px | Wider mobile controls and grouped metadata |
| `md` | 768px | Tablet layout and optional two-column regions |
| `lg` | 1024px | Creator navigation rail and evidence split |
| `xl` | 1280px | Maximum workspace width and wide comparison panels |

Breakpoints are implementation defaults, not device categories. Components should respond to available space rather than assume a specific device.

## 10. Border, radius, and elevation

### 10.1 Borders

- Standard border: 1px solid `border`.
- Strong separator: 1px solid `border-strong`.
- Focus ring: 3px solid `focus` with a 2px surface offset where supported.
- Status panels may use a 4px semantic leading border plus text and icon.

### 10.2 Radius

| Token | Value | Use |
| --- | ---: | --- |
| `radius-sm` | 6px | Inputs, small chips |
| `radius-md` | 10px | Buttons, cards, alerts |
| `radius-lg` | 16px | Major document and receipt panels |
| `radius-pill` | 999px | Short status chips only |

The interface should not round every surface into disconnected floating pills.

### 10.3 Elevation

| Token | Treatment | Use |
| --- | --- | --- |
| `flat` | No shadow | Default cards and document sections |
| `raised` | `0 8px 24px rgba(21, 23, 26, 0.08)` | Sticky decision summary or focused confirmation |
| `overlay` | `0 18px 48px rgba(21, 23, 26, 0.18)` | Confirmation dialog only |

Most hierarchy comes from spacing, borders, and typography rather than shadow.

## 11. Motion

### 11.1 Timing

- Micro-interaction: 100 to 150ms.
- Panel transition: 150 to 220ms.
- No animation is required for status changes.
- Do not delay navigation or confirmation to display animation.

### 11.2 Allowed motion

- Focus and hover transitions.
- Subtle expansion of evidence details.
- Progress indicator for genuine pending operations.
- Small status change emphasis that does not obscure text.

### 11.3 Prohibited motion

- Confetti after payment.
- Pulsing urgency around acceptance.
- Automatic carousels.
- Parallax.
- Continuous gradient movement.
- Content that moves before the user can read it.

Under `prefers-reduced-motion: reduce`, nonessential transitions are removed.

## 12. Component inventory

## 12.1 AppHeader

Responsibilities:

- product wordmark;
- current role;
- persistent mode badge;
- creator session controls where applicable;
- no sensitive identifiers.

The mode badge is never hidden on payment, receipt, or demo screens.

## 12.2 RoleBanner

A compact contextual banner used when role confusion is possible.

Examples:

- `You are reviewing as the creator.`
- `You are accepting terms as the buyer.`
- `This is a public verification view.`

It is not required on every screen if the app shell already makes the role unmistakable.

## 12.3 ModeBadge

Variants:

- `PAYPAL SANDBOX`
- `SIMULATED LOCAL MODE`

Required properties:

- text label;
- icon or shape difference;
- accessible name;
- no borrowed PayPal branding in simulated mode.

## 12.4 StageBadge

Shows one derived user-facing stage.

Rules:

- label is plain language;
- icon and color are semantic;
- details disclose authoritative source and timestamp;
- it never writes domain state.

## 12.5 ProgressRail

Shows the current actor journey without exposing every internal state.

Buyer example:

1. Request
2. Clarify
3. Review
4. Pay
5. Receipt

Creator example:

1. Request
2. Terms
3. Quote
4. Decision
5. Payment
6. Receipt

Completed steps have text and an icon. Current step uses `aria-current="step"`. Future steps remain readable but inactive.

## 12.6 AssetCard

Displays:

- preview;
- title;
- type;
- availability;
- compact provenance note;
- open-request count;
- primary contextual action.

The preview has meaningful alt text or an empty alt attribute when the adjacent text fully describes it.

## 12.7 EvidenceField

The key differentiating component.

Required regions:

- field label;
- normalized value;
- resolution state;
- evidence excerpt;
- evidence location highlight when shown with original text;
- confidence label;
- provenance source;
- correction action;
- technical detail disclosure.

Resolution treatments:

- Resolved
- Unresolved
- Contradictory
- Unsupported
- Manually corrected

Confidence must not override unsupported scope or human correction.

## 12.8 ConfidenceIndicator

Use human-readable labels first:

- High confidence
- Review recommended
- Low confidence
- Not available

Exact numeric confidence may appear in expandable technical detail. Do not render confidence as an unlabeled progress bar.

## 12.9 TermsSummary

A read-only, versioned summary used in creator approval, buyer acceptance, invoice handoff, receipt, and verification.

Rules:

- use the same field order everywhere;
- show restrictions explicitly;
- show exact dates and UTC semantics;
- show version reference in supporting detail;
- make differences visible when a version changes.

## 12.10 QuoteBreakdown

Displays:

- policy and version;
- line-item description;
- amount;
- total;
- calculation timestamp;
- `AI did not set this price` explanation;
- blocked-reason state.

Money aligns by decimal display while remaining integer cents internally.

## 12.11 DecisionPanel

Used for creator approval and buyer acceptance.

Required elements:

- object being acted upon;
- current version;
- consequence statement;
- one primary action;
- secondary revision or rejection path;
- stale-state behavior.

It cannot remain sticky if doing so obscures keyboard focus or content at high zoom.

## 12.12 PaymentStatusCard

Displays provider payment facts only.

Required fields:

- provider environment;
- invoice status;
- safe invoice reference;
- amount;
- evidence source;
- last confirmed timestamp;
- retry or reconciliation action.

It must not display permission status inside the same headline.

## 12.13 PermissionStatusCard

Displays permission effectiveness only.

Required fields:

- current state;
- effective or scheduled date;
- end date or last permitted date;
- reason code in plain language;
- link to current receipt when one exists.

## 12.14 ReceiptDocument

A document-like surface with:

- strong status header;
- asset and parties;
- permission scope;
- restrictions;
- date period;
- quote and payment;
- consent timestamps;
- model and policy provenance;
- hash and revision data;
- export and print actions;
- verification explanation.

The printable version removes application navigation but retains mode and status labels.

## 12.15 VerificationSummary

Public result hierarchy:

1. Integrity result
2. Current permission status
3. Scope
4. Dates
5. Hash and safe reference
6. Limitations

Invalid verification uses direct language and no reassuring success iconography.

## 12.16 AuditTimeline

Each event contains:

- timestamp;
- event label;
- actor category;
- result;
- safe related reference;
- optional technical disclosure.

The timeline uses ordered semantic markup. It does not rely on a vertical line alone to communicate sequence.

## 12.17 Alert

Variants:

- Info
- Success
- Warning
- Danger
- Neutral

Alerts include:

- concise heading;
- explanation;
- action when recovery is possible;
- icon plus text;
- restrained live-region behavior.

## 12.18 ErrorSummary

Appears above an invalid form and contains:

- concise heading;
- error count;
- anchor links to fields;
- focus target;
- no internal error details.

## 12.19 EmptyState

An empty state must explain:

- what is empty;
- whether that is expected;
- the next available action;
- whether reset or seed data is relevant.

Decorative illustration is optional and must not delay P0.

## 12.20 CopyableIdentifier

For hashes and safe references:

- visually truncate long values;
- preserve the full accessible value;
- provide a labeled copy button;
- announce copy success without moving focus;
- never use this component for secrets or capability tokens.

## 13. Button hierarchy

### Primary

Use for one next action per decision region.

Examples:

- Submit request
- Approve terms and quote
- Accept terms and continue
- Continue to PayPal Sandbox
- Reconcile with PayPal
- View rights receipt

### Secondary

Use for safe alternatives.

Examples:

- Edit terms
- Request a revision
- Refresh status
- Verify another record

### Tertiary

Use for low-emphasis navigation or disclosure.

Examples:

- View model details
- Copy reference
- Open audit history

### Danger

Use only for destructive or terminal actions.

Examples:

- Reject request
- Cancel unpaid case
- Revoke permission
- Reset demo data

Rules:

- Destructive actions are not visually adjacent to the primary action without spacing and clear labeling.
- Buttons use verbs and name the object when ambiguity is possible.
- Disabled buttons require visible nearby explanation.
- Loading buttons retain their width and label the operation in progress.

## 14. Inputs and form controls

### 14.1 Text inputs

- Label above control.
- Supporting text below label or control.
- Error text below control.
- Minimum 44px control height.
- Visible hover, focus, invalid, and disabled states.
- Autocomplete attributes where safe and applicable.

### 14.2 Textarea

The intended-use textarea:

- begins at approximately 8 visible lines on desktop and 7 on mobile;
- supports manual resize where browser behavior permits;
- shows character count;
- preserves line breaks;
- never auto-executes or interprets markup.

### 14.3 Select and choice controls

- Native controls are preferred unless a custom control has a clear accessibility need.
- Checkbox and radio targets include the full visible label.
- Multi-value rights fields use checkboxes, not tag entry.
- Unsupported values are never hidden as though they do not exist. The interface explains the supported boundary.

### 14.4 Date controls

- Store ISO date values.
- Display a readable localized date plus the canonical date when needed.
- State that permission timing is evaluated using the UTC calendar.
- Do not rely on browser-specific date-picker behavior alone.

## 15. Tables and dense data

Tables are appropriate for:

- quote line items;
- audit metadata;
- receipt revisions;
- asset list on wide screens.

Rules:

- Use proper table headers.
- Provide captions where context is not obvious.
- Do not use a table for the buyer acceptance summary on mobile.
- At small widths, convert records to labeled cards when horizontal scrolling would hide key associations.
- Numeric values align consistently.
- Status remains text, not a colored dot.

## 16. Document and receipt styling

Receipt surfaces use a document metaphor without imitating a legal certificate.

Recommended treatment:

- white document surface on warm canvas;
- restrained top status band;
- clear section dividers;
- definition-list layout;
- monospace hash block;
- print-friendly black and white behavior;
- no wax seals, signatures, official government marks, or legal certification imagery.

The receipt must look credible while preserving the limitation that it is an operational permission record.

## 17. Iconography

Use one consistent outlined icon set selected in Turn 007 or implemented with simple local SVGs.

Required semantic icons may include:

- information;
- check;
- warning;
- error;
- clock or scheduled;
- document;
- receipt;
- payment;
- verification;
- copy;
- external link;
- refresh;
- edit;
- lock or capability context.

Rules:

- Icons are never the only label for consequential actions.
- Decorative icons are hidden from assistive technology.
- Status icons include accessible text nearby.
- Do not use a shield icon to imply legal, financial, or security guarantees.

## 18. Focus and keyboard behavior

- Focus order follows visual and logical order.
- Route changes move focus to the new `h1` or a designated main-region target.
- Error submissions focus the error summary.
- Confirmation dialogs trap focus only while open and return focus to the triggering control.
- Expandable evidence details use native disclosure behavior when practical.
- Escape closes non-destructive overlays.
- Sticky regions never cover focused elements.
- Skip links become visible on focus.
- Copy actions retain focus and announce success.
- Keyboard users can complete the full judge path.

## 19. Live regions and asynchronous feedback

Use restrained announcements for:

- request submitted;
- extraction completed;
- quote recalculated;
- approval or acceptance recorded;
- invoice state refreshed;
- payment confirmation received;
- receipt created;
- copy action completed.

Do not announce every polling update. Use polite live regions unless the user must stop because integrity or authorization failed.

## 20. Responsive component rules

| Component | Wide behavior | Small behavior |
| --- | --- | --- |
| AppHeader | Wordmark, role, mode, navigation | Wordmark, role summary, mode, menu |
| ProgressRail | Horizontal or vertical full sequence | Current step plus compact progress count |
| EvidenceField | Evidence and normalized value side by side | Stacked with evidence directly below field |
| QuoteBreakdown | Table with aligned amounts | Stacked line items with amount on same row |
| DecisionPanel | Sticky side panel when safe | Inline final section with full-width primary action |
| Payment and permission | Two distinct columns | Two stacked cards |
| ReceiptDocument | Two-column definitions | One-column labeled groups |
| AuditTimeline | Full metadata disclosure | Compact event cards with optional details |

## 21. Accessibility verification targets

Turn 033 will select and run the final tools, but implementation should target:

- WCAG 2.2 AA behavior for the P0 path;
- automated checks with no serious or critical findings on required routes;
- keyboard completion of the seeded path;
- visible focus on every interactive control;
- correct labels, descriptions, and error relationships;
- 200 percent zoom without loss of content or function;
- common mobile widths without horizontal page scrolling;
- reduced-motion support;
- status meaning available without color;
- readable print output for the receipt.

This document does not claim conformance before testing.

## 22. Visual evidence for judging

The interface should make these differentiators visible in screenshots and video:

1. Field-level evidence and confidence
2. Unresolved terms before quotation
3. Deterministic quote line items
4. Creator approval and buyer acceptance of one version
5. Distinct payment and permission cards
6. Persistent PayPal Sandbox label
7. Scheduled versus active truthfulness
8. Receipt hash and revision
9. Public verification limitations

A screenshot that only shows a generic dashboard does not communicate the product advantage.

## 23. Implementation guidance for Turn 007

Turn 007 should establish:

- token files or CSS custom properties;
- base typography and reset;
- app-shell layout primitives;
- Button, Link, Input, Textarea, Checkbox, Alert, Badge, Card, DefinitionList, and Skeleton foundations;
- focus and reduced-motion defaults;
- Storybook is optional and must not delay the executable scaffold;
- no final business screen should be claimed complete during scaffold work.

Component implementation may use a small accessible primitive library if it fits the architecture and bundle constraints. A large design-system framework is not required.

## 24. Requirement traceability

This visual contract materially advances the design path for:

- `RR-P0-014` through `RR-P0-022`;
- `RR-P0-025` through `RR-P0-030`;
- `RR-P0-040` and `RR-P0-041`;
- `RR-P0-045` and `RR-P0-046`;
- `RR-P0-052` through `RR-P0-061`;
- `RR-P0-066` through `RR-P0-068`.

No acceptance row passes solely because tokens and components are specified.

## 25. Turn 006 completion test

The visual baseline is complete when:

- one coherent visual direction is named and bounded;
- semantic tokens cover color, typography, spacing, layout, borders, radius, elevation, and motion;
- status treatments preserve the domain distinctions;
- core components have explicit responsibilities and accessibility behavior;
- buyer, creator, and public shells remain visually and functionally distinct;
- payment and permission are presented as separate facts;
- responsive behavior is defined for every key component;
- the receipt is credible without implying legal certification;
- simulated mode cannot be mistaken for PayPal Sandbox evidence;
- the system is detailed enough for Turn 007 to create shared UI foundations without inventing design decisions.
