# Security and Privacy Documentation

This directory will hold the threat model, privacy posture, trust boundaries, and release security evidence.

Expected coverage:

- credentials and environment handling;
- authentication and authorization boundaries;
- input validation and output encoding;
- PayPal webhook verification and replay resistance;
- idempotency and out-of-order event handling;
- audit-log integrity and receipt verification;
- personal-data minimization and retention;
- dependency, secret, and license review;
- judge-mode isolation and reset behavior;
- known limitations and production-readiness exclusions.

The current build is limited to PayPal Sandbox. No production payment capability should be enabled during the hackathon project.
