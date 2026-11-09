# Architecture Decision Records

This directory records durable decisions that affect system structure, security, data, dependencies, deployment, public interfaces, domain semantics, interaction design, or long-term maintenance.

## Status values

- **Proposed:** under evaluation and not yet binding.
- **Accepted:** current project direction.
- **Superseded:** replaced by a later ADR.
- **Rejected:** considered and deliberately not selected.
- **Deprecated:** still present but scheduled for removal.

## Naming and numbering

Use monotonically increasing, zero-padded numbers:

```text
0001-short-decision-title.md
0002-another-decision.md
```

`0000-template.md` is reserved as the reusable template and is not a decision.

## Decision process

1. Describe the context and constraints.
2. State the decision precisely.
3. Record positive and negative consequences.
4. List meaningful alternatives and why they were not selected.
5. Identify validation evidence and revisit triggers.
6. Link the owning management turn and any superseding ADR.
7. Update the index below.

## Accepted decisions

| ADR | Decision | Status | Owning turn |
| --- | --- | --- | --- |
| [`0001`](0001-pnpm-typescript-monorepo.md) | Use a pnpm TypeScript monorepo | Accepted | Turn 004 |
| [`0002`](0002-single-cloudflare-worker-react-hono.md) | Deploy React and Hono as one Cloudflare Worker unit | Accepted | Turn 004 |
| [`0003`](0003-d1-drizzle-persistence.md) | Use D1 and Drizzle behind repository ports | Accepted | Turn 004 |
| [`0004`](0004-portable-local-model-runtime.md) | Train offline and run a portable local model in TypeScript | Accepted | Turn 004 |
| [`0005`](0005-paypal-port-webhook-inbox.md) | Isolate PayPal behind a port and durable webhook inbox | Accepted | Turn 004 |
| [`0006`](0006-versioned-canonical-receipts.md) | Use versioned RFC 8785 receipt revisions with SHA-256 | Accepted | Turn 004 |
| [`0007`](0007-demo-access-and-capabilities.md) | Use a demo creator session and scoped opaque capabilities | Accepted | Turn 004 |
| [`0008`](0008-separate-payment-permission-verification-lifecycles.md) | Separate payment, permission, verification, and receipt lifecycles | Accepted | Turn 005 |
| [`0009`](0009-task-first-role-aware-interface.md) | Use a task-first, role-aware interface | Accepted | Turn 006 |
| [`0010`](0010-commit-bound-lockfile-release.md) | Bind the release lockfile to the exact Git commit | Accepted | Turn 052 |

The integrated system architecture is documented in [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md). The database-independent domain contract is documented in [`../architecture/DOMAIN_MODEL.md`](../architecture/DOMAIN_MODEL.md). The accepted interaction and visual contracts are documented in [`../product/USER_JOURNEYS.md`](../product/USER_JOURNEYS.md) and [`../product/VISUAL_SYSTEM.md`](../product/VISUAL_SYSTEM.md).

## Superseding a decision

Do not silently rewrite an accepted decision to reverse its meaning. Create the next numbered ADR, set the earlier record to **Superseded**, link both records, explain migration and schedule impact, and update this index.
