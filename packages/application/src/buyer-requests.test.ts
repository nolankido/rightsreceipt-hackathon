import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AssetRecord,
  BuyerCapabilityRecord,
  BuyerRequestLinkContext,
  BuyerRequestSubmissionRecord,
  LicensingCaseDraftRecord,
} from "@rightsreceipt/domain";
import { BuyerRequestService } from "./buyer-requests";

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

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("buyer request service", () => {
  it("creates an opaque asset-bound link and stores one immutable request", async () => {
    let licensingCase: LicensingCaseDraftRecord | null = null;
    let capability: BuyerCapabilityRecord | null = null;
    let submission: BuyerRequestSubmissionRecord | null = null;
    const identifiers = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000001",
    ];
    const token = "A".repeat(43);

    const service = new BuyerRequestService({
      assets: { getById: async () => asset },
      requests: {
        createRequestLink: async (nextCase, nextCapability) => {
          licensingCase = nextCase;
          capability = nextCapability;
        },
        findByCapabilityDigest: async (value): Promise<BuyerRequestLinkContext | null> => {
          if (!licensingCase || !capability || value !== capability.tokenDigestSha256) return null;
          return {
            caseId: licensingCase.caseId,
            asset,
            allowedActions: capability.allowedActions,
            issuedAt: capability.issuedAt,
            expiresAt: capability.expiresAt,
            revokedAt: capability.revokedAt,
            requestSubmissionId: submission?.requestSubmissionId ?? null,
          };
        },
        submitRequest: async (record) => {
          submission = record;
        },
      },
      capabilities: {
        issue: async () => ({ token, digestSha256: digest(token) }),
        digest: async (value) => digest(value),
      },
      identifiers: { create: () => identifiers.shift() ?? crypto.randomUUID() },
      clock: {
        now: () => new Date("2026-10-25T12:00:00.000Z"),
        todayUtc: () => "2026-10-25",
      },
    });

    const link = await service.createRequestLink(asset.assetId);
    expect(link.requestPath).toBe(`/request/${token}`);
    const storedCase = licensingCase as LicensingCaseDraftRecord | null;
    expect(storedCase?.assetId).toBe(asset.assetId);

    const receipt = await service.submitRequest(token, {
      buyerName: "Jordan Lee",
      buyerOrganization: "Cedar & Tide Travel",
      buyerEmail: "jordan@example.test",
      intendedUseText:
        "We request paid Instagram advertising in the United States and Canada for ninety days.",
      consentAcknowledged: true,
    });

    expect(receipt.received).toBe(true);
    const storedSubmission = submission as BuyerRequestSubmissionRecord | null;
    expect(storedSubmission?.intendedUseText).toContain("paid Instagram");
    expect(storedSubmission?.consentCopyVersion).toBe("buyer-request-v1");
  });
});
