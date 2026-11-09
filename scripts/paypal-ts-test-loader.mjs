/** Node-only test resolver for TypeScript's extensionless local imports.
 * It is not used by Vite, Workers, or the published payment adapter.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!/\.(?:ts|tsx|js|mjs|cjs|json)$/u.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
  }
  return nextResolve(specifier, context);
}
