/** Path-token buyer APIs belong only to the original local-memory demonstration. */
import { localDemoAccessAllowed } from "./demo-access";

type LegacyBuyerBindings = { readonly APP_MODE?: string; readonly DB?: unknown } | undefined;

/** Use directly once the router has matched its legacy buyer route family. */
export function legacyBuyerRuntimeBoundary(request: Request, env: LegacyBuyerBindings): Response | null {
  if ((env?.APP_MODE === undefined || env.APP_MODE === "local") && localDemoAccessAllowed(request.url, "local", !!env?.DB)) return null;
  return new Response(JSON.stringify({ error: "private_request_route_required", message: "Open the current private request link to continue." }), {
    status: 403,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "Pragma": "no-cache",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" },
  });
}

export function legacyBuyerRequestBoundary(request: Request, env: LegacyBuyerBindings): Response | null {
  // Routers may decode ASCII before route matching. Do not let encoded prefixes
  // enter a database-backed legacy handler by disagreeing with its path parser.
  const path = new URL(request.url).pathname.replace(/%([0-9a-f]{2})/giu, (_encoded, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  if (!path.startsWith("/api/request/") && !path.startsWith("/request/")) return null;
  return legacyBuyerRuntimeBoundary(request, env);
}
