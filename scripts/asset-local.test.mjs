import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  AssetRegistrationError,
  getAssetDetail,
  getCreatorWorkspaceView,
  registerAssetMetadata,
} from "./asset-local.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const POLICY_ID = "00000000-0000-4000-8000-000000000002";
const HARBOR_ID = "00000000-0000-4000-8000-000000000003";

function createFixtureDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "rightsreceipt-assets-"));
  const path = join(directory, "assets.sqlite");
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE pricing_policy_versions (
      pricing_policy_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      policy_name TEXT NOT NULL,
      currency TEXT NOT NULL,
      PRIMARY KEY (pricing_policy_id, version_number)
    ) STRICT;

    CREATE TABLE creator_workspaces (
      workspace_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode = 'demo'),
      default_pricing_policy_id TEXT,
      default_pricing_policy_version INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL,
      FOREIGN KEY (default_pricing_policy_id, default_pricing_policy_version)
        REFERENCES pricing_policy_versions(pricing_policy_id, version_number)
        DEFERRABLE INITIALLY DEFERRED
    ) STRICT;

    CREATE TABLE assets (
      asset_id TEXT PRIMARY KEY CHECK (length(asset_id) = 36),
      workspace_id TEXT NOT NULL REFERENCES creator_workspaces(workspace_id),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      asset_type TEXT NOT NULL CHECK (asset_type IN ('photograph', 'illustration')),
      creator_display_name TEXT NOT NULL CHECK (length(creator_display_name) BETWEEN 1 AND 120),
      provenance_note TEXT NOT NULL CHECK (length(provenance_note) BETWEEN 1 AND 2000),
      fingerprint_algorithm TEXT NOT NULL CHECK (fingerprint_algorithm = 'sha256'),
      fingerprint_value TEXT NOT NULL CHECK (length(fingerprint_value) = 64),
      preview_reference TEXT NOT NULL,
      availability TEXT NOT NULL CHECK (availability IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL CHECK (row_version >= 1)
    ) STRICT;

    CREATE TABLE licensing_cases (
      case_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(asset_id)
    ) STRICT;
  `);

  database.exec("BEGIN;");
  database.prepare(
    `INSERT INTO creator_workspaces VALUES (?, ?, 'demo', NULL, NULL, ?, ?, 1)`,
  ).run(
    WORKSPACE_ID,
    "Maya Chen",
    "2026-10-25T12:00:00.000Z",
    "2026-10-25T12:00:00.000Z",
  );
  database.prepare(
    `INSERT INTO pricing_policy_versions VALUES (?, ?, 1, 'Harbor demo policy', 'USD')`,
  ).run(POLICY_ID, WORKSPACE_ID);
  database.prepare(
    `UPDATE creator_workspaces
     SET default_pricing_policy_id = ?, default_pricing_policy_version = 1
     WHERE workspace_id = ?`,
  ).run(POLICY_ID, WORKSPACE_ID);
  database.prepare(
    `INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, 'sha256', ?, ?, 'active', ?, ?, 1)`,
  ).run(
    HARBOR_ID,
    WORKSPACE_ID,
    "Harbor After Rain",
    "photograph",
    "Maya Chen",
    "Project-owned demonstration image. The fingerprint identifies the seeded representation only.",
    "aeae6d66d7b96a628239e1802ee5e0cd180ddccc6cc924f8fb125f9da5db0345",
    "/demo/harbor-after-rain.svg",
    "2026-10-25T12:00:00.000Z",
    "2026-10-25T12:00:00.000Z",
  );
  database.exec("COMMIT;");

  return {
    database,
    close() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("controlled previews are local project SVG assets", () => {
  for (const relativePath of [
    "public/demo/harbor-after-rain.svg",
    "public/demo/studio-lines.svg",
  ]) {
    const content = readFileSync(join(repositoryRoot, relativePath), "utf8");
    assert.match(content, /^<svg/u);
    assert.doesNotMatch(content, /(?:href|xlink:href)=["']https?:\/\//u);
    assert.doesNotMatch(content, /<(?:script|foreignObject|image)\b/iu);
  }
});

test("workspace view exposes the seeded asset and pricing assignment", () => {
  const fixture = createFixtureDatabase();
  try {
    const view = getCreatorWorkspaceView(fixture.database);
    assert.equal(view.workspace.displayName, "Maya Chen");
    assert.equal(view.pricingPolicy.policyName, "Harbor demo policy");
    assert.equal(view.assets.length, 1);
    assert.deepEqual(
      {
        title: view.assets[0].title,
        type: view.assets[0].assetType,
        creator: view.assets[0].creatorDisplayName,
        preview: view.assets[0].previewReference,
        availability: view.assets[0].availability,
      },
      {
        title: "Harbor After Rain",
        type: "photograph",
        creator: "Maya Chen",
        preview: "/demo/harbor-after-rain.svg",
        availability: "active",
      },
    );
  } finally {
    fixture.close();
  }
});

test("registers and reloads supported photograph metadata", () => {
  const fixture = createFixtureDatabase();
  try {
    const assetId = "11111111-1111-4111-8111-111111111111";
    const created = registerAssetMetadata(
      fixture.database,
      {
        title: "  Coast at Dawn  ",
        assetType: "photograph",
        creatorDisplayName: " Maya Chen ",
        provenanceNote: " Project-owned demonstration photograph metadata. ",
        previewKey: "harbor-after-rain",
      },
      { assetId, now: "2026-10-26T08:30:00.000Z" },
    );

    const reloaded = getAssetDetail(fixture.database, assetId);
    assert.equal(created.assetId, assetId);
    assert.equal(reloaded.asset.assetId, assetId);
    assert.equal(reloaded.asset.title, "Coast at Dawn");
    assert.equal(reloaded.asset.fingerprintValue.length, 64);
    assert.equal(reloaded.asset.createdAt, "2026-10-26T08:30:00.000Z");
    assert.equal(reloaded.asset.updatedAt, "2026-10-26T08:30:00.000Z");
    assert.equal(reloaded.asset.rowVersion, 1);
  } finally {
    fixture.close();
  }
});

test("registers supported illustration metadata with a controlled preview", () => {
  const fixture = createFixtureDatabase();
  try {
    const created = registerAssetMetadata(
      fixture.database,
      {
        title: "Studio Lines",
        assetType: "illustration",
        creatorDisplayName: "Maya Chen",
        provenanceNote: "Project-owned abstract illustration created for RightsReceipt testing.",
        previewKey: "studio-lines",
      },
      {
        assetId: "22222222-2222-4222-8222-222222222222",
        now: "2026-10-26T08:31:00.000Z",
      },
    );

    assert.equal(created.assetType, "illustration");
    assert.equal(created.previewReference, "/demo/studio-lines.svg");
    assert.equal(
      created.fingerprintValue,
      "6e60fa6b9c5bf5ab98dec4ddd39cd8eb80c4a90d82865a26e94825c2bbce5d52",
    );
  } finally {
    fixture.close();
  }
});

test("rejects unsupported types and uncontrolled preview references", () => {
  const fixture = createFixtureDatabase();
  try {
    assert.throws(
      () =>
        registerAssetMetadata(
          fixture.database,
          {
            title: "Moving Image",
            assetType: "video",
            creatorDisplayName: "Maya Chen",
            provenanceNote: "Unsupported metadata type.",
            previewKey: "remote-upload",
          },
          {
            assetId: "33333333-3333-4333-8333-333333333333",
            now: "2026-10-26T08:32:00.000Z",
          },
        ),
      (error) =>
        error instanceof AssetRegistrationError
        && error.issues.some((issue) => issue.code === "unsupported_asset_type")
        && error.issues.some((issue) => issue.code === "unsupported_preview"),
    );
  } finally {
    fixture.close();
  }
});

test("rejects a preview that does not match the asset type", () => {
  const fixture = createFixtureDatabase();
  try {
    assert.throws(
      () =>
        registerAssetMetadata(
          fixture.database,
          {
            title: "Mismatched preview",
            assetType: "photograph",
            creatorDisplayName: "Maya Chen",
            provenanceNote: "This should not be stored.",
            previewKey: "studio-lines",
          },
          {
            assetId: "44444444-4444-4444-8444-444444444444",
            now: "2026-10-26T08:33:00.000Z",
          },
        ),
      (error) =>
        error instanceof AssetRegistrationError
        && error.issues.some((issue) => issue.code === "preview_type_mismatch"),
    );
  } finally {
    fixture.close();
  }
});

test("rejects invalid identifiers and timestamps without writing a row", () => {
  const fixture = createFixtureDatabase();
  try {
    assert.throws(
      () =>
        registerAssetMetadata(
          fixture.database,
          {
            title: "Bad context",
            assetType: "illustration",
            creatorDisplayName: "Maya Chen",
            provenanceNote: "This should not be stored.",
            previewKey: "studio-lines",
          },
          { assetId: "not-a-uuid", now: "tomorrow" },
        ),
      AssetRegistrationError,
    );
    const count = fixture.database.prepare("SELECT COUNT(*) AS count FROM assets").get().count;
    assert.equal(count, 1);
  } finally {
    fixture.close();
  }
});
