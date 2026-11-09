import type { AssetRecord, WorkspaceRecord } from "@rightsreceipt/domain";
import { describe, expect, it } from "vitest";
import { CreatorAssetService, CreatorAssetServiceError } from "./assets";

const workspace: WorkspaceRecord = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  displayName: "Maya Chen",
  mode: "demo",
  defaultPricingPolicyId: "00000000-0000-4000-8000-000000000002",
  defaultPricingPolicyVersion: 1,
  createdAt: "2026-10-25T12:00:00.000Z",
  updatedAt: "2026-10-25T12:00:00.000Z",
  rowVersion: 1,
};

function createHarness() {
  const assets: AssetRecord[] = [];
  const service = new CreatorAssetService({
    workspaces: { getDemoWorkspace: async () => workspace },
    assets: {
      getById: async (assetId) => assets.find((asset) => asset.assetId === assetId) ?? null,
      listByWorkspace: async () => assets,
      insert: async (asset) => {
        assets.push(asset);
      },
      countCases: async () => 0,
    },
    pricingPolicies: {
      getActiveAssignment: async () => ({
        pricingPolicyId: workspace.defaultPricingPolicyId!,
        versionNumber: 1,
        policyName: "Harbor demo policy",
        currency: "USD",
      }),
    },
    identifiers: { create: () => "11111111-1111-4111-8111-111111111111" },
    clock: {
      now: () => new Date("2026-10-26T08:30:00.000Z"),
      todayUtc: () => "2026-10-26",
    },
  });
  return { assets, service };
}

describe("CreatorAssetService", () => {
  it("registers and reloads asset metadata", async () => {
    const { assets, service } = createHarness();
    const created = await service.registerAsset({
      title: "Studio Lines",
      assetType: "illustration",
      creatorDisplayName: "Maya Chen",
      provenanceNote: "Project-owned illustration.",
      previewKey: "studio-lines",
    });

    expect(assets).toHaveLength(1);
    expect((await service.getAsset(created.assetId)).asset).toEqual(created);
  });

  it("requires the assigned pricing policy to remain active before registration", async () => {
    const assets: AssetRecord[] = [];
    const service = new CreatorAssetService({
      workspaces: { getDemoWorkspace: async () => workspace },
      assets: {
        getById: async () => null,
        listByWorkspace: async () => assets,
        insert: async (asset) => {
          assets.push(asset);
        },
        countCases: async () => 0,
      },
      pricingPolicies: { getActiveAssignment: async () => null },
      identifiers: { create: () => "11111111-1111-4111-8111-111111111111" },
      clock: {
        now: () => new Date("2026-10-26T08:30:00.000Z"),
        todayUtc: () => "2026-10-26",
      },
    });

    await expect(
      service.registerAsset({
        title: "Studio Lines",
        assetType: "illustration",
        creatorDisplayName: "Maya Chen",
        provenanceNote: "Project-owned illustration.",
        previewKey: "studio-lines",
      }),
    ).rejects.toMatchObject({
      code: "pricing_policy_unavailable",
    } satisfies Partial<CreatorAssetServiceError>);
    expect(assets).toHaveLength(0);
  });

  it("requires a pricing-policy assignment", async () => {
    const { service } = createHarness();
    const missingPolicyService = new CreatorAssetService({
      workspaces: {
        getDemoWorkspace: async () => ({
          ...workspace,
          defaultPricingPolicyId: null,
          defaultPricingPolicyVersion: null,
        }),
      },
      assets: {
        getById: async () => null,
        listByWorkspace: async () => [],
        insert: async () => undefined,
        countCases: async () => 0,
      },
      pricingPolicies: { getActiveAssignment: async () => null },
      identifiers: { create: () => "11111111-1111-4111-8111-111111111111" },
      clock: {
        now: () => new Date("2026-10-26T08:30:00.000Z"),
        todayUtc: () => "2026-10-26",
      },
    });

    await expect(missingPolicyService.getWorkspace()).rejects.toMatchObject({
      code: "pricing_policy_unavailable",
    } satisfies Partial<CreatorAssetServiceError>);
    expect(await service.getWorkspace()).toMatchObject({
      workspace: { displayName: "Maya Chen" },
      pricingPolicy: { versionNumber: 1 },
    });
  });
});
