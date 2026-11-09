# Management Turn Receipts

Each completed, blocked, or deliberately deferred management turn receives one Markdown receipt in this directory. Receipts provide a compact audit trail of scope, verification, limitations, and the next recommended action.

## Naming

Use a zero-padded number and a short kebab-case title:

```text
NNN-short-title.md
```

Examples:

```text
001-bootstrap-repository.md
014-ai-task-contract.md
022-paypal-invoice-creation.md
```

## Required practice

1. Copy [`TEMPLATE.md`](TEMPLATE.md).
2. Record the exact objective and exit criteria before implementation.
3. List files and behavior actually changed.
4. Record commands and results precisely. Never describe a test as passing if it was not run.
5. State manual evidence and known limitations.
6. Update the root `PROJECT_STATUS.md` in the same turn.
7. Link durable design choices to an ADR under `docs/decisions/`.

`PROJECT_STATUS.md` is the canonical current-state ledger. The receipts are the chronological evidence behind it.
