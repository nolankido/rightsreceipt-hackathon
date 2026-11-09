import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AssetRecord } from "@rightsreceipt/domain";
import { createBuyerRequestLinkRecords } from "@rightsreceipt/domain";
import { createMemoryBuyerRequestPersistence } from "./memory-buyer-requests";

const asset: AssetRecord = {
  assetId: "00000000-0000-4000-8000-000000000003",
  workspaceId: "00000000-0000-4000-8000-000000000001",
  title: "Harbor After Rain",
  assetType: "photograph",
  creatorDisplayName: "Maya Chen",
  provenanceNote: "Project-owned demo image.",
  fingerprintAlgorithm: "sha256",
  fingerprintValue: "a".repeat(64),
  previewReference: "/demo/harbor-after-rain.svg",
  availability: "active",
  createdAt: "2026-10-25T12:00:00.000Z",
  updatedAt: "2026-10-25T12:00:00.000Z",
  rowVersion: 1,
};

describe("memory buyer request persistence", () => {
  it("binds a capability to one case and updates submission state", async () => {
    const tokenDigestSha256 = createHash("sha256").update("A".repeat(43)).digest("hex");
    const records = createBuyerRequestLinkRecords(asset, {
      caseId: "10000000-0000-4000-8000-000000000001",
      buyerCapabilityId: "10000000-0000-4000-8000-000000000002",
      tokenDigestSha256,
      issuedAt: "2026-10-25T12:00:00.000Z",
      expiresAt: "2026-11-01T12:00:00.000Z",
    });
    const persistence = createMemoryBuyerRequestPersistence(
      new Map([[asset.assetId, asset]]),
    );

    await persistence.createRequestLink(records.licensingCase, records.capability);
    expect((await persistence.findByCapabilityDigest(tokenDigestSha256))?.asset.assetId).toBe(
      asset.assetId,
    );

    await persistence.submitRequest({
      requestSubmissionId: "20000000-0000-4000-8000-000000000001",
      caseId: records.licensingCase.caseId,
      buyerName: "Jordan Lee",
      buyerOrganization: "Cedar & Tide Travel",
      buyerEmail: "jordan@example.test",
      intendedUseText:
        "We request paid Instagram use in the United States for ninety days.",
      normalizedText:
        "We request paid Instagram use in the United States for ninety days.",
      consentCopyVersion: "buyer-request-v1",
      consentAcknowledged: true,
      submittedAt: "2026-10-25T12:30:00.000Z",
    });

    expect(
      (await persistence.findByCapabilityDigest(tokenDigestSha256))?.requestSubmissionId,
    ).toBe("20000000-0000-4000-8000-000000000001");
  });
});
