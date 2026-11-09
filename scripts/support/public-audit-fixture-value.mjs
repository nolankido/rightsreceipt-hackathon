/** Only deliberately labeled fixture values may bypass generic secret assignment checks.
 * A marker embedded in an otherwise opaque credential is not evidence of a fixture.
 */
const PREFIXES = Object.freeze([
  'example', 'placeholder', 'replace', 'your_', 'your-', 'synthetic',
  'fixture', 'fake', 'mock', 'not-a', 'not_a', 'acceptance-secret',
  'sandbox-secret', 'test-token', 'test_secret', 'test-secret',
  'test_bearer', 'test-bearer', 'not-a-token',
]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/iu;
const TEST_PREFIX = /^(?:test-token|test[_-]secret|test[_-]bearer|fake|mock|synthetic|fixture|acceptance|sandbox)[-_][a-z0-9_-]{3,}$/iu;

/** Heuristic fixture label only. Known live-token prefixes are always scanned separately. */
export function isFixtureValue(value, path = '') {
  if (typeof value !== 'string') return false;
  if (/^(?:<[^<>]+>|\.\.\.|x{4,}|\*{4,}|changeme|\$\{[A-Z][A-Z0-9_]*\})$/iu.test(value)) {
    return true;
  }
  const lower = value.toLowerCase();
  if (PREFIXES.some(prefix => lower === prefix
    || (prefix.endsWith('-') || prefix.endsWith('_')
      ? lower.startsWith(prefix)
      : lower.startsWith(prefix + '-') || lower.startsWith(prefix + '_')))) {
    return true;
  }
  return TEST_FILE.test(path) && TEST_PREFIX.test(value);
}
