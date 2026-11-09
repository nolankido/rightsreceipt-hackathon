import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { creatorDemoAccessAllowed, isLocalDemoOrigin, localDemoAccessAllowed } from "../apps/api/src/demo-access.ts";

const allowed = [
  "http://localhost:5173/api/creator/cases",
  "http://127.0.0.1:8787/api/mock/verify/receipt",
  "http://[::1]:8787/api/creator/workspace",
  "http://local.test/api/request/token/mock",
];
const forbidden = [
  "https://rightsreceipt.workers.dev/api/creator/cases",
  "https://example.com/api/creator/cases",
  "http://rightsreceipt.workers.dev/api/creator/cases",
  "http://localhost.evil.example/api/creator/cases",
  "http://local.test.evil.example/api/creator/cases",
  "http://localhost" + String.fromCharCode(64) + "evil.example/api/creator/cases",
  "https://localhost/api/creator/workspace",
  "javascript:alert(1)",
  "invalid-url",
];

test("local demo origin whitelist accepts only loopback and reserved fixture host", () => {
  for (const url of allowed) assert.equal(isLocalDemoOrigin(url), true, url);
  for (const url of forbidden) assert.equal(isLocalDemoOrigin(url), false, url);
});

test("forged creator role header never grants access to public origins", () => {
  for (const url of forbidden) {
    assert.equal(creatorDemoAccessAllowed(url, "local", false, "creator"), false, url);
  }
});

test("creator role is denied without the explicit local-only header", () => {
  for (const header of [undefined, "", "buyer", "Creator", "creator "]) {
    assert.equal(creatorDemoAccessAllowed(allowed[0], "local", false, header), false);
  }
  assert.equal(creatorDemoAccessAllowed(allowed[0], "local", false, "creator"), true);
});

test("sandbox, judge, and D1-bound environments cannot use the header bypass", () => {
  for (const mode of ["sandbox", "judge"]) {
    assert.equal(creatorDemoAccessAllowed(allowed[0], mode, false, "creator"), false);
    assert.equal(localDemoAccessAllowed(allowed[0], mode, false), false);
  }
  assert.equal(creatorDemoAccessAllowed(allowed[0], "local", true, "creator"), false);
  assert.equal(localDemoAccessAllowed(allowed[0], "local", true), false);
});

test("simulation access is denied on public origins even when configured local", () => {
  for (const url of forbidden) assert.equal(localDemoAccessAllowed(url, "local", false), false);
  assert.equal(localDemoAccessAllowed(allowed[0], "local", false), true);
});

test("browser document refuses to send secret buyer capability in Referer", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="referrer" content="no-referrer"\s*\/>/u);
});

test("buyer simulation never links directly into privileged creator actions", () => {
  const source = readFileSync(new URL("../apps/web/src/mock-transaction.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Demo operator:.*creator\//u);
});
