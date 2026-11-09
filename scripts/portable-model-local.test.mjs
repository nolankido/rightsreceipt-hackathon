import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PORTABLE_MODEL_SCHEMA,
  PORTABLE_RIGHTS_FIELDS,
  lexicalFeatures,
  loadVerifiedPortableModel,
  PortableRightsModel,
} from "../packages/ai-runtime/src/portable-model.ts";

const path = new URL("../data/model/v1/artifact.json", import.meta.url);
const artifactText = readFileSync(path, "utf8");
const digest = createHash("sha256").update(artifactText).digest("hex");
const references = JSON.parse(readFileSync(new URL("../data/model/v1/reference-predictions.json", import.meta.url), "utf8"));

async function model() { return loadVerifiedPortableModel(artifactText, digest); }

test("exported model is exactly twelve heads with the fixed portable schema", async () => {
  const raw = JSON.parse(artifactText);
  assert.equal(raw.schemaVersion, PORTABLE_MODEL_SCHEMA);
  assert.deepEqual(raw.heads.map((head) => head.fieldName), PORTABLE_RIGHTS_FIELDS);
  assert.equal(raw.weightsEncoding, "int16-le-row-major-base64");
  assert.equal(raw.vocabulary.length, 768);
  assert.equal(raw.authority.requiresIndependentCalibration, true);
  assert.equal(raw.authority.permittedActions.length, 0);
  assert.equal((await model()).predict(references.records[0].inputText).fields.length, 12);
});

test("portable scores match Python quantized reference math on six validation examples", async () => {
  const loaded = await model();
  assert.equal(references.artifactSha256, digest);
  assert.equal(references.sourceSplit, "validation");
  for (const reference of references.records) {
    const actual = loaded.predict(reference.inputText);
    assert.equal(actual.fields.length, 12);
    for (let i = 0; i < actual.fields.length; i += 1) {
      const predicted = actual.fields[i];
      const expected = reference.fields[i];
      assert.equal(predicted.fieldName, expected.fieldName);
      assert.deepEqual(predicted.label, expected.label, `${reference.exampleId}: ${expected.fieldName}`);
      assert.ok(Math.abs(predicted.rawScore - expected.rawScore) < 1e-9);
      assert.ok(Math.abs(predicted.runnerUpScore - expected.runnerUpScore) < 1e-9);
      assert.equal(predicted.confidenceBasisPoints, null);
      assert.deepEqual(predicted.evidenceSpans, []);
    }
  }
});

test("model cannot authorize terms, pricing, payment, or a permission", async () => {
  const p = (await model()).predict(references.records[0].inputText);
  assert.equal(p.status, "uncalibrated_review_only");
  assert.equal(p.reviewRequired, true);
  assert.equal(p.quoteEligible, false);
  assert.deepEqual(p.permittedActions, []);
  assert.ok(!Object.hasOwn(p, "price_cents"));
  assert.ok(!Object.hasOwn(p, "confirm_payment"));
  assert.ok(!Object.hasOwn(p, "permission_status"));
});

test("reject tampered model bytes and digest, including a valid-shaped alteration", async () => {
  await assert.rejects(loadVerifiedPortableModel(artifactText, "0".repeat(64)), /Invalid or untrusted/);
  await assert.rejects(loadVerifiedPortableModel(artifactText.replace('"modelVersion":"2026-10-26-v1"', '"modelVersion":"tampered"'), digest), /Invalid or untrusted/);
  const altered = JSON.parse(artifactText);
  altered.authority.permittedActions=["confirm_payment"];
  const changed = JSON.stringify(altered);
  const changedDigest = createHash("sha256").update(changed).digest("hex");
  await assert.rejects(loadVerifiedPortableModel(changed, changedDigest), /Invalid or untrusted/);
  const forged = JSON.parse(artifactText);
  forged.heads.find((head) => head.fieldName === "exclusivity").labels[0] = { resolutionState: "resolved", normalizedValue: "exclusive" };
  const forgedText = JSON.stringify(forged);
  await assert.rejects(loadVerifiedPortableModel(forgedText, createHash("sha256").update(forgedText).digest("hex")), /Invalid or untrusted/);
});

test("direct construction without verified loader is unavailable", () => {
  assert.throws(() => new PortableRightsModel({},new Int16Array(),digest,Symbol("fake")), /Invalid or untrusted/);
});

test("tokenizer preserves ASCII unigram and bigram semantics across punctuation", () => {
  assert.deepEqual([...lexicalFeatures("Paid IG, Facebook! 🎨 café ... US")].sort(), [
    "b:caf/us", "b:facebook/caf", "b:ig/facebook", "b:paid/ig", "u:caf", "u:facebook", "u:ig", "u:paid", "u:us",
  ]);
});

test("reject invalid or unsafe input lengths", async () => {
  const loaded=await model();
  assert.throws(()=>loaded.predict("a".repeat(39)), /eligible/);
  assert.throws(()=>loaded.predict("a".repeat(4001)), /eligible/);
});

test("repeated inference does not change results or mutate prediction output", async () => {
  const loaded=await model();
  const a=loaded.predict(references.records[0].inputText);
  const b=loaded.predict(references.records[0].inputText);
  assert.deepEqual(a,b);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.fields));
  assert.ok(Object.isFrozen(a.fields[0]));
  assert.throws(()=>{a.fields[0].label.normalizedValue="paid";},TypeError);
});
