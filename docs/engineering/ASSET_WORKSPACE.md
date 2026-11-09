# Creator Workspace and Asset Registration

**Status:** Implemented and verified through the dependency-free local asset harness
**Owning turn:** Turn 009
**Browser build verification:** Pending the blocked Turn 007 dependency gate
**Live D1 verification:** Pending a configured D1 binding

## Purpose

This record describes the first creator-facing feature slice in RightsReceipt. It lets the demo creator view the seeded Harbor After Rain asset, inspect its provenance and fingerprint, and register controlled metadata for one photograph or illustration.

The implementation deliberately excludes arbitrary file upload, ownership verification, media processing, and public creator accounts.

## Product surfaces

The React route set now includes:

- `/creator`, creator workspace and asset list;
- `/creator/assets/new`, controlled metadata registration;
- `/creator/assets/:assetId`, asset detail and buyer-request link context.

The workspace displays:

- creator identity;
- assigned pricing policy and version;
- persistence mode;
- seeded and newly registered assets;
- asset type, preview, provenance, and availability;
- truthful empty request and receipt summaries.

The asset detail displays:

- controlled project preview;
- title, type, creator, and provenance;
- shortened SHA-256 fingerprint with copy control;
- availability and related-case count;
- a notice that the fingerprint does not prove ownership or authority to license.

## Controlled preview catalog

P0 does not accept arbitrary uploads. Registration uses one of two project-owned SVG previews:

| Preview key | Asset type | Reference |
| --- | --- | --- |
| `harbor-after-rain` | Photograph metadata | `/demo/harbor-after-rain.svg` |
| `studio-lines` | Illustration metadata | `/demo/studio-lines.svg` |

The SVGs contain no scripts, foreign objects, external images, or external href references. The stored fingerprint values are deterministic identifiers for the controlled demo representations. They are not ownership claims.

## Registration rules

The registration command requires:

- title, 1 through 200 trimmed characters;
- asset type, `photograph` or `illustration`;
- creator display name, 1 through 120 trimmed characters;
- provenance note, 1 through 2,000 trimmed characters;
- a controlled preview key compatible with the asset type;
- a canonical lowercase UUID version 4 asset identifier;
- an ISO 8601 UTC creation instant;
- an existing demo workspace with an assigned pricing-policy version.

The server assigns:

- stable asset identifier;
- workspace identifier;
- `sha256` fingerprint algorithm and controlled fingerprint value;
- preview reference;
- `active` availability;
- creation and update timestamps;
- row version 1.

Unsupported asset types, uncontrolled preview keys, preview-type mismatches, invalid identifiers, invalid timestamps, and out-of-range text fail before persistence.

## Application and persistence boundaries

The feature uses:

- pure asset validation and record creation in `@rightsreceipt/domain`;
- creator workspace orchestration in `@rightsreceipt/application`;
- D1-shaped workspace, asset, pricing-policy, and case-count repositories in `@rightsreceipt/persistence`;
- one labeled in-memory adapter for local mode when a D1 binding is absent;
- shared Zod request and response contracts;
- Hono creator endpoints;
- React workspace, detail, and registration routes.

The local memory adapter is never selected in Sandbox or judge mode. In those modes, a missing D1 binding fails with `persistence_unavailable` rather than silently presenting memory state as D1 evidence.

## API routes

Creator API routes require the explicit demo role header:

```text
x-rightsreceipt-demo-role: creator
```

This header is a temporary demo boundary, not production authentication. The accepted creator-session design remains a later security implementation.

Routes:

- `GET /api/creator/workspace`
- `GET /api/creator/assets/:assetId`
- `POST /api/creator/assets`

Responses identify their storage mode as `memory` or `d1`.

## Dependency-free verification

Run:

```bash
node --no-warnings --experimental-strip-types --test scripts/asset-local.test.mjs
```

The seven tests cover:

1. controlled local SVG previews;
2. seeded creator, asset, preview, provenance, availability, and pricing assignment;
3. photograph registration and reload;
4. illustration registration and reload;
5. unsupported asset types and uncontrolled preview keys;
6. preview and asset-type mismatch;
7. invalid identifiers and timestamps with no write.

The local harness uses Node SQLite and the same pure asset record builder used by the application layer.

## Verification limitations

- The React and Hono routes have not executed with installed dependencies because Turn 007 cannot reach the npm registry.
- Vitest, Vite build, Wrangler dry run, and browser automation remain pending.
- The D1 repositories are source-checked but not executed against a live D1 binding.
- The local memory adapter is an explicitly labeled fallback and is not durable across Worker restarts.
- Creator-session authentication remains later work.

These limitations do not change the feature contract. They remain release blockers until their owning verification turns pass.
