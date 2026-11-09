/** Prefix-only, read-only detector for high-risk credential-shaped literals.
 * This heuristic does not validate providers or establish that a token is active.
 * Never return, preserve, log or print a matched value in release evidence.
 */
const KNOWN_SECRET = /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_.-]{20,}|npm_[A-Za-z0-9]{20,}|sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,})/u;

/** The caller records only a fixed finding code, never the credential text. */
export function hasKnownSecretPrefix(text) {
  return typeof text === 'string' && KNOWN_SECRET.test(text);
}
