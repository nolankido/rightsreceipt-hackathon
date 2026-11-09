/** RFC 8785 JCS for bounded, ordinary JSON values. No Unicode normalization.
 * Reject lossy JavaScript values rather than allowing JSON.stringify to hide them.
 */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export function canonicalJson(input: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  function string(value: string): string {
    for (let i = 0; i < value.length; i++) {
      const n = value.charCodeAt(i);
      if (n >= 0xd800 && n <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Invalid canonical Unicode.");
      } else if (n >= 0xdc00 && n <= 0xdfff) throw new Error("Invalid canonical Unicode.");
    }
    return JSON.stringify(value);
  }
  function visit(value: unknown, depth: number): string {
    if (++nodes > 40_000 || depth > 40) throw new Error("Canonical JSON exceeds limits.");
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "string") return string(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Non-finite canonical number.");
      return JSON.stringify(value);
    }
    if (typeof value !== "object") throw new Error("Not a JSON value.");
    const proto: unknown = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new Error("Not a plain JSON object.");
    if (Object.getOwnPropertySymbols(value).length || ancestors.has(value)) throw new Error("Invalid canonical object.");
    ancestors.add(value);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Array.isArray(value)) {
        if (Object.keys(descriptors).length !== value.length + 1) throw new Error("Sparse or extended array.");
        const parts: string[] = [];
        for (let i = 0; i < value.length; i++) {
          const d = descriptors[String(i)];
          if (!d || !d.enumerable || !("value" in d)) throw new Error("Invalid array member.");
          parts.push(visit(d.value, depth + 1));
        }
        return `[${parts.join(",")}]`;
      }
      return `{${Object.keys(descriptors).sort().map(key => {
        const d = descriptors[key]!;
        if (!d.enumerable || !("value" in d)) throw new Error("Hidden or accessor JSON property.");
        return `${string(key)}:${visit(d.value, depth + 1)}`;
      }).join(",")}}`;
    } finally { ancestors.delete(value); }
  }
  const result = visit(input, 0);
  if (new TextEncoder().encode(result).byteLength > 262_144) throw new Error("Canonical JSON exceeds limits.");
  return result;
}
export async function sha256Hex(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function canonicalHash(value: unknown): Promise<string> { return sha256Hex(canonicalJson(value)); }
/** Stored payloads must already be canonical. This also rejects duplicate keys,
 * alternate number/escape forms and invisible lossy conversions on reparse.
 */
export function parseCanonical(text: string): Json {
  if (typeof text !== "string" || text.length > 262_144) throw new Error("Invalid canonical payload.");
  const parsed: unknown = JSON.parse(text);
  if (canonicalJson(parsed) !== text) throw new Error("Stored JSON is not canonical.");
  return parsed as Json;
}
