import { describe, expect, it } from "vitest";
import {
  AssetRegistrationError,
  createAssetRecord,
  previewOptionFor,
  validateAssetRegistration,
} from "./assets";

const context = {
  assetId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "00000000-0000-4000-8000-000000000001",
  now: "2026-10-26T08:30:00.000Z",
} as const;

describe("asset metadata domain", () => {
  it("creates canonical illustration metadata from a controlled preview", () => {
    const record = createAssetRecord(
      {
        title: " Studio Lines ",
        assetType: "illustration",
        creatorDisplayName: " Maya Chen ",
        provenanceNote: " Project-owned illustration. ",
        previewKey: "studio-lines",
      },
      context,
    );

    expect(record).toMatchObject({
      title: "Studio Lines",
      assetType: "illustration",
      creatorDisplayName: "Maya Chen",
      previewReference: "/demo/studio-lines.svg",
      availability: "active",
      rowVersion: 1,
    });
    expect(record.fingerprintValue).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects unsupported types, uncontrolled previews, and mismatches", () => {
    const issues = validateAssetRegistration(
      {
        title: "Unsupported",
        assetType: "video",
        creatorDisplayName: "Maya Chen",
        provenanceNote: "Unsupported type.",
        previewKey: "remote-upload",
      },
      context,
    );
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["unsupported_asset_type", "unsupported_preview"]),
    );

    expect(() =>
      createAssetRecord(
        {
          title: "Mismatch",
          assetType: "photograph",
          creatorDisplayName: "Maya Chen",
          provenanceNote: "Mismatched controlled preview.",
          previewKey: "studio-lines",
        },
        context,
      ),
    ).toThrow(AssetRegistrationError);
  });

  it("exposes only known controlled preview keys", () => {
    expect(previewOptionFor("harbor-after-rain")?.compatibleAssetType).toBe(
      "photograph",
    );
    expect(previewOptionFor("remote-upload")).toBeNull();
  });
});
