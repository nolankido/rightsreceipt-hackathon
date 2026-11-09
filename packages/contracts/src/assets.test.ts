import { describe, expect, it } from "vitest";
import {
  AssetRecordSchema,
  AssetRegistrationInputSchema,
  CreatorWorkspaceResponseSchema,
} from "./assets";

describe("asset contracts", () => {
  it("accepts supported metadata registration", () => {
    expect(
      AssetRegistrationInputSchema.parse({
        title: "Studio Lines",
        assetType: "illustration",
        creatorDisplayName: "Maya Chen",
        provenanceNote: "Project-owned illustration.",
        previewKey: "studio-lines",
      }),
    ).toMatchObject({ assetType: "illustration" });
  });

  it("rejects unsupported asset types and preview keys", () => {
    expect(() =>
      AssetRegistrationInputSchema.parse({
        title: "Video",
        assetType: "video",
        creatorDisplayName: "Maya Chen",
        provenanceNote: "Unsupported type.",
        previewKey: "remote-upload",
      }),
    ).toThrow();
  });

  it("requires a 64-character lowercase hexadecimal fingerprint", () => {
    expect(() =>
      AssetRecordSchema.parse({
        assetId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "00000000-0000-4000-8000-000000000001",
        title: "Studio Lines",
        assetType: "illustration",
        creatorDisplayName: "Maya Chen",
        provenanceNote: "Project-owned illustration.",
        fingerprintAlgorithm: "sha256",
        fingerprintValue: "invalid",
        previewReference: "/demo/studio-lines.svg",
        availability: "active",
        createdAt: "2026-10-26T08:30:00.000Z",
        updatedAt: "2026-10-26T08:30:00.000Z",
        rowVersion: 1,
      }),
    ).toThrow();
  });

  it("labels the local memory fallback in workspace responses", () => {
    const parsed = CreatorWorkspaceResponseSchema.safeParse({
      storageMode: "memory",
      workspace: {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        displayName: "Maya Chen",
        mode: "demo",
        defaultPricingPolicyId: "00000000-0000-4000-8000-000000000002",
        defaultPricingPolicyVersion: 1,
        createdAt: "2026-10-25T12:00:00.000Z",
        updatedAt: "2026-10-25T12:00:00.000Z",
        rowVersion: 1,
      },
      assets: [],
      pricingPolicy: {
        pricingPolicyId: "00000000-0000-4000-8000-000000000002",
        versionNumber: 1,
        policyName: "Harbor demo policy",
        currency: "USD",
      },
      previewOptions: [],
    });
    expect(parsed.success).toBe(true);
  });
});
