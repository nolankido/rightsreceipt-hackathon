/** Public release verification must not silently omit tracked Git objects. */
export const MAX_AUDIT_BLOB_BYTES = 16 * 1024 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export function auditedGitEntry(mode, type) {
  return type === "blob" && (mode === "100644" || mode === "100755");
}

/** A closed result forces the caller to record any unscannable payload as a finding. */
export function inspectAuditBlob(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected blob bytes");
  if (bytes.byteLength > MAX_AUDIT_BLOB_BYTES) {
    return { code: "oversized_blob_unscanned", text: null };
  }
  let text;
  try { text = utf8.decode(bytes); }
  catch { return { code: "binary_blob_unscanned", text: null }; }
  // eslint-disable-next-line no-control-regex -- Control bytes identify content that cannot be audited as text.
  if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/u.test(text)) {
    return { code: "binary_blob_unscanned", text: null };
  }
  if (/^version https:\/\/git-lfs\.github\.com\/spec\/v1(?:\r?\n|$)/u.test(text)) {
    return { code: "unresolved_git_lfs_pointer", text: null };
  }
  return { code: null, text };
}
