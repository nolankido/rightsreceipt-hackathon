# ADR 0002: Deploy React and Hono as One Cloudflare Worker Unit

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 004, implemented in Turns 007 and 038
- **Supersedes:** None
- **Superseded by:** None

## Context

The MVP needs a polished React interface, a server-side API, secure PayPal credentials, webhook intake, D1 bindings, public verification, and a stable judge URL. Splitting the web application and API across independent hosts would add CORS, two deployment pipelines, duplicated environment management, and more failure modes.

Cloudflare Workers supports static assets and Worker code in one deployment. The Cloudflare Vite plugin runs Worker code in the local `workerd` runtime and builds front-end assets. Hono is based on Web Standard request and response APIs and runs directly on Workers.

The project explicitly does not depend on GitHub Actions and does not need server-side rendering for P0.

## Decision

Build:

- a React single-page application in `apps/web`;
- a Hono API and Worker composition root in `apps/api`;
- one Cloudflare Worker deployment that includes the React static assets and Worker script;
- one origin for static assets, browser routes, `/api/*`, `/webhooks/paypal`, and `/health`;
- the Cloudflare Vite plugin for local runtime integration and build output;
- Wrangler scripts for local development, preview, bindings, secrets, migrations, and manual deployment;
- a client-side router for the application surfaces;
- no Cloudflare Pages project and no second API host in P0.

The Worker uses Web Standard APIs by default. Node.js compatibility is enabled only if a selected dependency requires it and the reason is recorded.

## Consequences

### Positive

- One deployment and origin reduce operational and CORS complexity.
- Static assets, API code, configuration, and release evidence refer to one release.
- PayPal secrets remain server-side in Worker bindings.
- Local development can exercise Worker APIs and D1 bindings in `workerd`.
- Cloudflare can serve static assets efficiently while routing API and webhook paths to Hono.
- The public receipt route and judge path have one stable base URL.

### Negative and tradeoffs

- The browser and API deploy together even when only one changes.
- Worker runtime constraints influence dependency selection.
- A failure in the single deployment can affect both interface and API availability.
- Source separation across `apps/web` and `apps/api` requires deliberate build composition.
- Long-running background processing is unsuitable and must use short deferred work plus reconciliation.

## Alternatives considered

### Cloudflare Pages for the web application and Workers for the API

Rejected because current Cloudflare and Hono guidance favors Workers with static assets for new full-stack projects. Two deployments would also add cross-origin and release-drift risk.

### Vercel or Netlify for the web application and a separate API

Rejected because the project already needs Worker-style webhook handling and D1. A second platform adds credentials, configuration, and failure modes without a P0 benefit.

### Next.js or another server-rendered full-stack framework

Rejected because P0 does not require server-side rendering. A React SPA plus Hono keeps payment, domain, and deployment boundaries explicit and reduces framework-specific behavior.

### A Node.js server on a virtual machine

Rejected because it introduces server administration, patching, process management, and higher deployment friction for a short-lived hackathon build.

## Validation

Turn 007 must prove that:

- local development serves the React client and Hono API together;
- Worker bindings are type checked;
- client routes fall back correctly without intercepting API routes;
- a production build contains both static assets and Worker code;
- no broad CORS policy is required;
- the application can run with a local D1 binding and fake PayPal adapter.

Turn 038 must prove that one deployed release completes the signed-out judge path.

## Revisit triggers

- The Cloudflare Vite plugin cannot reliably compose the two source applications.
- A required PayPal or model dependency cannot run in Workers.
- The Worker size or runtime limits block the release.
- A separate service is proven necessary for a P0 requirement.

## References

- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
