# Database Migrations

Migration files are ordered, immutable SQL records for the RightsReceipt schema.

Rules:

1. Use the `NNNN_short_name.sql` naming format.
2. Never edit an applied migration. Add the next number.
3. Keep migrations compatible with Cloudflare D1 and local SQLite verification.
4. Preserve foreign keys, uniqueness, range checks, and immutable-record guards.
5. Run `pnpm db:verify`, or the direct Node commands in `docs/engineering/PERSISTENCE.md`, before committing.

The local runner records each migration SHA-256 and rejects migration drift.
