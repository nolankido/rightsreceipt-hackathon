/** Run only against validation. Held-out test data belongs to Turn 018. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadVerifiedPortableModel } from "../packages/ai-runtime/src/portable-model.ts";

const dataDirectory = new URL("../data/synthetic/v1/", import.meta.url);
const modelDirectory = new URL("../data/model/v1/", import.meta.url);
const read = (url) => readFileSync(url);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const manifest = JSON.parse(read(new URL("manifest.json", dataDirectory)));
const validationBytes = read(new URL("validation.jsonl", dataDirectory));
const artifactBytes = read(new URL("artifact.json", modelDirectory));
const training = JSON.parse(read(new URL("training-report.json", modelDirectory)));
const entry = manifest.files["validation.jsonl"];
if (hash(validationBytes) !== entry.sha256 || validationBytes.length !== entry.bytes) {
  throw new Error("Validation dataset does not match frozen Turn 015 manifest");
}
if (hash(artifactBytes) !== training.trainingArtifactSha256) {
  throw new Error("Exported classifier differs from its training report");
}
const rows = validationBytes.toString("utf8").trimEnd().split("\n").map(JSON.parse);
if (rows.length !== entry.rows || rows.some((row) => row.split !== "validation")) {
  throw new Error("Unexpected validation split or record count");
}
const model = await loadVerifiedPortableModel(artifactBytes.toString("utf8"), training.trainingArtifactSha256);
const fields = Object.fromEntries(manifest.generation.contractLabelFields.map((f) => [f, {
  correct: 0, falseResolved: 0, total: 0, stateCorrect: 0,
}]));
const categories = {};
let correct = 0;
let stateCorrect = 0;
let falseResolved = 0;
const pairs = new Map();
for (const row of rows) {
  const prediction = model.predict(row.inputText);
  if (prediction.quoteEligible !== false || prediction.status !== "uncalibrated_review_only"
    || prediction.permittedActions.length !== 0 || prediction.reviewRequired !== true) {
    throw new Error("Unsafe classifier authority");
  }
  if (!categories[row.category]) categories[row.category] = { records: 0, exactFields: 0, falseResolved: 0 };
  categories[row.category].records += 1;
  const predicted = prediction.fields;
  if (predicted.length !== 12) throw new Error("Incomplete prediction");
  for (let i = 0; i < predicted.length; i += 1) {
    const gold = row.fieldLabels[i];
    const guess = predicted[i];
    if (gold.fieldName !== guess.fieldName) throw new Error("Field order changed");
    const stateMatch = gold.resolutionState === guess.label.resolutionState;
    const exact = stateMatch && JSON.stringify(gold.normalizedValue) === JSON.stringify(guess.label.normalizedValue);
    if (stateMatch) { stateCorrect++; fields[gold.fieldName].stateCorrect++; }
    if (exact) {correct++; categories[row.category].exactFields++; fields[gold.fieldName].correct++;}
    if (guess.label.resolutionState === "resolved" && !exact) {
      falseResolved++; fields[gold.fieldName].falseResolved++; categories[row.category].falseResolved++;
    }
    fields[gold.fieldName].total++;
  }
  if (row.category === "injection") {
    const group = pairs.get(row.scenarioGroupId) ?? {};
    group[row.variant] = predicted.map((p) => p.label);
    pairs.set(row.scenarioGroupId, group);
  }
}
let identicalInjectionPairs = 0;
for (const pair of pairs.values()) {
  if (!pair.attack || !pair.baseline) throw new Error("Incomplete injection pair");
  if (JSON.stringify(pair.attack) === JSON.stringify(pair.baseline)) identicalInjectionPairs++;
}
const summary = {
  schemaVersion: "rightsreceipt-portable-validation-v1",
  scope: "validation_only_heldout_not_opened",
  artifactSha256: training.trainingArtifactSha256,
  validationSha256: entry.sha256,
  recordCount: rows.length,
  totalFields: rows.length * 12,
  exactLabelMatches: correct,
  stateMatches: stateCorrect,
  falseResolved,
  injectionPairs: pairs.size,
  identicalInjectionPairs,
  fieldResults: fields,
  categoryResults: categories,
  calibrationCompleted: false,
  authorizedToQuote: false,
};
const content = JSON.stringify(summary, null, 2) + "\n";
const output = new URL("portable-validation-report.json", modelDirectory);
if (process.argv.includes("--write")) {
  mkdirSync(dirname(output.pathname), { recursive: true });
  writeFileSync(output, content);
} else if (process.argv.includes("--check")) {
  if (read(output).toString("utf8") !== content) throw new Error("Validation report does not reproduce");
} else {
  process.stdout.write(content);
}
console.log(`Portable validation ${correct}/${rows.length * 12}, false resolved ${falseResolved}, injection pair agreement ${identicalInjectionPairs}/${pairs.size}`);
