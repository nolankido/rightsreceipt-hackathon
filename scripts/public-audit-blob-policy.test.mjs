import test from "node:test";
import assert from "node:assert/strict";
import { MAX_AUDIT_BLOB_BYTES, auditedGitEntry, inspectAuditBlob } from "./public-audit-blob-policy.mjs";

const enc = new TextEncoder();

test("regular tracked files are accepted but symlinks and gitlinks fail closed", () => {
  for (const mode of ["100644", "100755"]) assert.equal(auditedGitEntry(mode, "blob"), true);
  for (const [mode, type] of [["120000", "blob"], ["160000", "commit"], ["040000", "tree"]]) {
    assert.equal(auditedGitEntry(mode, type), false);
  }
});
test("large UTF-8 sources are scanned rather than skipped", () => {
  const text = "a".repeat(2 * 1024 * 1024 + 1000)
    + "\nPAYPAL_SANDBOX_CLIENT_SECRET=definitely-sensitive-value";
  const result = inspectAuditBlob(enc.encode(text));
  assert.equal(result.code, null);
  assert.ok(result.text.endsWith("definitely-sensitive-value"));
});
test("oversized text is blocked instead of silently skipped", () => {
  const result = inspectAuditBlob(new Uint8Array(MAX_AUDIT_BLOB_BYTES + 1));
  assert.equal(result.code, "oversized_blob_unscanned");
  assert.equal(result.text, null);
});
test("binary NUL and invalid UTF8 are blocked", () => {
  for (const bytes of [Uint8Array.from([65, 0, 66]), Uint8Array.from([0xff, 0xfe, 0xfd]),
    Uint8Array.from([65, 27, 66])]) {
    const result = inspectAuditBlob(bytes);
    assert.equal(result.code, "binary_blob_unscanned");
    assert.equal(result.text, null);
  }
});
test("unresolved Git LFS pointers are not treated as examined file contents", () => {
  const pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:"
    + "a".repeat(64) + "\nsize 123456\n";
  assert.equal(inspectAuditBlob(enc.encode(pointer)).code, "unresolved_git_lfs_pointer");
});
test("multilingual UTF8 and source code remain safe to inspect", () => {
  const text = "Hello 世界!\nمرحبا!\nfunction greet() { return \"👋\" }\n";
  assert.deepEqual(inspectAuditBlob(enc.encode(text)), { code: null, text });
});
