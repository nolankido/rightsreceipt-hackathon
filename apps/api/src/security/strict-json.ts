/** Bounded JSON with duplicate decoded property-name rejection at every depth.
 * JSON.parse still owns grammar validation. No reviver, coercion or evaluation.
 */
export function strictSecurityJson(raw: string, maxBytes = 65536): unknown {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("Invalid security JSON.");
  const value: unknown = JSON.parse(raw);
  const stack: { object: boolean; keys: Set<string>; expectsKey: boolean }[] = [];
  let strings = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      const start = i++;
      while (i < raw.length) { if (raw[i] === "\\") i += 2; else if (raw[i] === '"') break; else i++; }
      const decoded: unknown = JSON.parse(raw.slice(start, i + 1));
      if (typeof decoded !== "string" || ++strings > 2048 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(decoded)) throw new Error("Invalid security JSON.");
      const parent = stack.at(-1);
      if (parent?.object && parent.expectsKey) {
        if (parent.keys.has(decoded)) throw new Error("Invalid security JSON.");
        parent.keys.add(decoded); parent.expectsKey = false;
      }
    } else if (c === "{" || c === "[") {
      if (stack.length >= 16) throw new Error("Invalid security JSON.");
      stack.push({ object: c === "{", keys: new Set(), expectsKey: c === "{" });
    } else if (c === "}" || c === "]") stack.pop();
    else if (c === ",") { const parent = stack.at(-1); if (parent?.object) parent.expectsKey = true; }
  }
  return value;
}
