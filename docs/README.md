# RightsReceipt Documentation

This directory separates stable product and architecture contracts from implementation evidence. Each record must state what is true, identify its owning management turn, and avoid claiming unfinished behavior.

## Documentation map

| Path | Purpose | First owning turn |
| --- | --- | --- |
| [`product/`](product/README.md) | Product brief, scope, requirements, journeys, and visual system | Turns 002, 003, and 006 |
| [`architecture/`](architecture/README.md) | System architecture, domain model, lifecycle, data, and deployment boundaries | Turns 004 and 005 |
| [`engineering/`](engineering/README.md) | Executable toolchain, workspace, commands, and implementation verification | Turn 007 onward |
| [`decisions/`](decisions/README.md) | Numbered architecture, domain, and interaction decisions | Turn 004 onward |
| [`model/`](model/README.md) | AI task contract, data, evaluation, thresholds, and model card | Turns 014 through 020 |
| [`security/`](security/README.md) | Threat model, privacy, webhook controls, and release security review | Turns 032 through 034 |
| [`demo/`](demo/README.md) | Judge scenario, screenshots, video plan, and demonstration evidence | Turns 038 through 041 |
| [`submission/`](submission/README.md) | Devpost copy, requirements matrix, release checklist, and submission evidence | Turns 042 through 044 |
| [`turns/`](turns/README.md) | Immutable management-turn receipts | Every turn |

## Documentation rules

- `PROJECT_STATUS.md` is the canonical live ledger.
- `DEVELOPMENT_PLAN.md` is the master backlog and operating protocol.
- Product and architecture contracts define intended behavior.
- Engineering records must distinguish configured, statically checked, installed, tested, built, deployed, and externally verified states.
- A decision with meaningful tradeoffs belongs in an ADR.
- A turn receipt records what happened during one management turn.
- Generated metrics must include commands, inputs, dates, and limitations.
- Screenshots and submission claims must match the identified release.
- Secrets, private data, Sandbox credentials, and proprietary material do not belong in documentation.
