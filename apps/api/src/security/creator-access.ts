/** Narrow Cloudflare Access human-session verifier. No unsigned identity header,
 * cookie decoder, service token, token-selected key URL, or network fallback.
 * A valid signature is authentication, not workspace authorization.
 */
import { strictSecurityJson } from "./strict-json";
export interface CreatorAccessBindings {
  readonly APP_MODE?: string;
  readonly CREATOR_ACCESS_ENABLED?: string;
  readonly CREATOR_ACCESS_ORIGIN?: string;
  readonly CREATOR_ACCESS_ISSUER?: string;
  readonly CREATOR_ACCESS_AUDIENCE?: string;
  /** Deployment-owned JSON: [{subject, workspaceId, validAfter}]. Never browser input. */
  readonly CREATOR_ACCESS_PRINCIPALS?: string;
}
export interface CreatorSession {
  readonly workspaceId: string; readonly actorReference: string;
  readonly issuedAt: number; readonly expiresAt: number;
}
interface Mapping { subject: string; workspaceId: string; validAfter: number }
interface Configuration { origin: string; issuer: string; audience: string; mappings: readonly Mapping[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const WORKSPACE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KID = /^[A-Za-z0-9_-]{1,128}$/u;
function fail(): never { throw new Error("Creator session unavailable."); }
function object(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail(); return v as Record<string, unknown>;
}
function integer(v: unknown): number { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) fail(); return v; }
function bytes(v: unknown, max: number): Uint8Array {
  if (typeof v !== "string" || v.length > max || !/^[A-Za-z0-9_-]+$/u.test(v) || v.length % 4 === 1) fail();
  const raw = atob(v.replace(/-/gu, "+").replace(/_/gu, "/"));
  if (btoa(raw).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "") !== v) fail();
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function jsonSegment(v: string, max: number) { return object(strictSecurityJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes(v, max)), max)); }
function configuration(env: CreatorAccessBindings | undefined): Configuration {
  if (!env || env.CREATOR_ACCESS_ENABLED !== "true" || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) fail();
  const origin = new URL(env.CREATOR_ACCESS_ORIGIN ?? "");
  if (origin.protocol !== "https:" || origin.origin !== env.CREATOR_ACCESS_ORIGIN || origin.username || origin.password || origin.port
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(origin.hostname) || origin.hostname === "localhost" || /^\d+(?:\.\d+){3}$/u.test(origin.hostname)) fail();
  const issuer = env.CREATOR_ACCESS_ISSUER;
  if (typeof issuer !== "string" || !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/u.test(issuer)) fail();
  const audience = env.CREATOR_ACCESS_AUDIENCE;
  if (typeof audience !== "string" || !/^[a-f0-9]{64}$/u.test(audience)) fail();
  const raw = strictSecurityJson(env.CREATOR_ACCESS_PRINCIPALS ?? "", 16384);
  if (!Array.isArray(raw) || !raw.length || raw.length > 32) fail();
  const subjects = new Set<string>();
  const mappings = raw.map(value => {
    const r = object(value);
    if (Object.keys(r).sort().join() !== "subject,validAfter,workspaceId"
      || typeof r.subject !== "string" || !UUID.test(r.subject) || subjects.has(r.subject)
      || typeof r.workspaceId !== "string" || !WORKSPACE.test(r.workspaceId)) fail();
    subjects.add(r.subject);
    return { subject: r.subject, workspaceId: r.workspaceId, validAfter: integer(r.validAfter) };
  });
  return { origin: origin.origin, issuer, audience, mappings };
}
function claims(p: Record<string, unknown>, c: Configuration, now: number): Mapping {
  if (p.iss !== c.issuer || p.type !== "app" || typeof p.sub !== "string" || !UUID.test(p.sub)
    || typeof p.email !== "string" || p.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(p.email)
    || Object.hasOwn(p, "common_name") || Object.hasOwn(p, "service_token_id") || Object.hasOwn(p, "service_token_status")
    || !Array.isArray(p.aud) || p.aud.length !== 1 || p.aud[0] !== c.audience) fail();
  const issued = integer(p.iat), expiry = integer(p.exp), before = integer(p.nbf);
  if (issued > now || before > now || before < issued || before >= expiry || expiry <= now
    || expiry <= issued || expiry - issued > 3600) fail();
  const mapping = c.mappings.find(x => x.subject === p.sub);
  if (!mapping || issued < mapping.validAfter) fail();
  return mapping;
}
async function responseKeys(response: Response, url: string): Promise<Map<string, CryptoKey>> {
  if (response.status !== 200 || response.redirected || (response.url && response.url !== url)
    || !/^application\/json(?:\s*;.*)?$/iu.test(response.headers.get("content-type") ?? "")
    || Number(response.headers.get("content-length")) > 65536 || !response.body) fail();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 65536) { await reader.cancel(); fail(); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let at = 0; for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
  const body = object(strictSecurityJson(new TextDecoder("utf-8", { fatal: true }).decode(all)));
  if (!Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 16) fail();
  const keys = new Map<string, CryptoKey>();
  for (const value of body.keys) {
    const k = object(value);
    if (typeof k.kid !== "string" || !KID.test(k.kid) || keys.has(k.kid) || k.kty !== "RSA" || k.alg !== "RS256"
      || k.use !== "sig" || k.e !== "AQAB" || ["d", "p", "q", "dp", "dq", "qi", "oth"].some(x => Object.hasOwn(k, x))
      || (k.key_ops !== undefined && (!Array.isArray(k.key_ops) || k.key_ops.length !== 1 || k.key_ops[0] !== "verify"))) fail();
    const modulus = bytes(k.n, 700);
    if (![256, 384, 512].includes(modulus.length) || (modulus[0]! & 128) === 0) fail();
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: String(k.n), e: "AQAB", alg: "RS256", ext: true, key_ops: ["verify"] },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    keys.set(k.kid, key);
  }
  return keys;
}
export function createCreatorAccessVerifier(deps: {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  // Public signing keys only. No tokens/principals cached. Unknown kids do not
  // trigger unbounded refreshes; key rotation becomes visible within 60 seconds.
  const cache = new Map<string, { until: number; keys: Map<string, CryptoKey> }>();
  const pending = new Map<string, Promise<Map<string, CryptoKey>>>();
  async function keys(issuer: string) {
    const at = now(), old = cache.get(issuer);
    if (old && at < old.until && at >= old.until - 60000) return old.keys;
    if (pending.has(issuer)) return pending.get(issuer)!;
    if (pending.size >= 4) fail();
    const task = (async () => {
      const url = `${issuer}/cdn-cgi/access/certs`;
      const result = await responseKeys(await deps.fetch(url, { method: "GET", redirect: "error", credentials: "omit",
        cache: "no-store", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } }), url);
      if (cache.size >= 4) cache.delete(cache.keys().next().value!);
      cache.set(issuer, { until: now() + 60000, keys: result }); return result;
    })();
    pending.set(issuer, task);
    try { return await task; } finally { pending.delete(issuer); }
  }
  return Object.freeze({
    async authenticate(request: Request, env: CreatorAccessBindings | undefined): Promise<CreatorSession | null> {
      try {
        const c = configuration(env), url = new URL(request.url);
        if (url.origin !== c.origin || (request.headers.has("origin") && request.headers.get("origin") !== c.origin)
          || (request.headers.has("sec-fetch-site") && !["same-origin", "none"].includes(request.headers.get("sec-fetch-site")!))) fail();
        const token = request.headers.get("cf-access-jwt-assertion");
        if (!token || token.length > 8192 || token.trim() !== token) fail();
        const parts = token.split("."); if (parts.length !== 3) fail();
        const header = jsonSegment(parts[0]!, 1024), payload = jsonSegment(parts[1]!, 6144), signature = bytes(parts[2], 700);
        if (Object.keys(header).sort().join() !== "alg,kid,typ" || header.alg !== "RS256" || header.typ !== "JWT"
          || typeof header.kid !== "string" || !KID.test(header.kid)) fail();
        const clock = () => { const n = now(); if (!Number.isFinite(n) || n < 0) fail(); return Math.floor(n / 1000); };
        claims(payload, c, clock());
        const key = (await keys(c.issuer)).get(header.kid); if (!key) fail();
        if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Uint8Array.from(signature),
          new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) fail();
        // Re-read deployment policy and clock after every asynchronous boundary.
        const fresh = configuration(env);
        if (fresh.origin !== c.origin || fresh.issuer !== c.issuer || fresh.audience !== c.audience) fail();
        const actorBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${c.issuer}\n${payload.sub}`));
        const policy = configuration(env);
        if (policy.origin !== c.origin || policy.issuer !== c.issuer || policy.audience !== c.audience) fail();
        const mapping = claims(payload, policy, clock());
        const actorReference = `access:${[...new Uint8Array(actorBytes)].map(b => b.toString(16).padStart(2, "0")).join("")}`;
        return Object.freeze({ workspaceId: mapping.workspaceId, actorReference, issuedAt: Number(payload.iat), expiresAt: Number(payload.exp) });
      } catch { return null; }
    },
  });
}
