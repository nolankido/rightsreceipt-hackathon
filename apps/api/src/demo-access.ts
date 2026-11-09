/**
 * Temporary gate for local, fake-only development.
 * This is NOT creator authentication. Public deployments must use a real
 * server-validated creator session before they can expose creator routes.
 */
export function isLocalDemoOrigin(requestUrl: string): boolean {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "http:"
      && !url.username
      && !url.password
      && ["localhost", "127.0.0.1", "[::1]", "local.test"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function localDemoAccessAllowed(
  requestUrl: string,
  mode: "local" | "sandbox" | "judge" | undefined,
  databaseBound: boolean,
): boolean {
  return (mode ?? "local") === "local"
    && !databaseBound
    && isLocalDemoOrigin(requestUrl);
}

export function creatorDemoAccessAllowed(
  requestUrl: string,
  mode: "local" | "sandbox" | "judge" | undefined,
  databaseBound: boolean,
  roleHeader: string | undefined,
): boolean {
  return roleHeader === "creator"
    && localDemoAccessAllowed(requestUrl, mode, databaseBound);
}
