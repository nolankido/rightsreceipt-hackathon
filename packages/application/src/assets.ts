import {
  AssetRegistrationError,
  createAssetRecord,
  type AssetRecord,
  type AssetRegistrationInput,
  type WorkspaceRecord,
} from "@rightsreceipt/domain";
import type { ClockPort, IdentifierPort } from "./index";

export interface CreatorWorkspaceRepositoryPort {
  getDemoWorkspace(): Promise<WorkspaceRecord | null>;
}

export interface CreatorAssetRepositoryPort {
  getById(assetId: string): Promise<AssetRecord | null>;
  listByWorkspace(workspaceId: string): Promise<readonly AssetRecord[]>;
  insert(record: AssetRecord): Promise<void>;
  countCases(assetId: string): Promise<number>;
}

export interface PricingPolicyAssignment {
  readonly pricingPolicyId: string;
  readonly versionNumber: number;
  readonly policyName: string;
  readonly currency: "USD";
}

export interface PricingPolicyAssignmentPort {
  getActiveAssignment(
    pricingPolicyId: string,
    versionNumber: number,
  ): Promise<PricingPolicyAssignment | null>;
}

export interface CreatorWorkspaceView {
  readonly workspace: WorkspaceRecord;
  readonly assets: readonly AssetRecord[];
  readonly pricingPolicy: PricingPolicyAssignment;
}

export interface CreatorAssetDetail {
  readonly asset: AssetRecord;
  readonly relatedCaseCount: number;
  readonly fingerprintNotice: string;
}

export class CreatorAssetServiceError extends Error {
  readonly code:
    | "workspace_unavailable"
    | "pricing_policy_unavailable"
    | "asset_not_found";

  constructor(
    code: CreatorAssetServiceError["code"],
    message: string,
  ) {
    super(message);
    this.name = "CreatorAssetServiceError";
    this.code = code;
  }
}

export interface CreatorAssetServiceDependencies {
  readonly workspaces: CreatorWorkspaceRepositoryPort;
  readonly assets: CreatorAssetRepositoryPort;
  readonly pricingPolicies: PricingPolicyAssignmentPort;
  readonly identifiers: IdentifierPort;
  readonly clock: ClockPort;
}

export class CreatorAssetService {
  readonly #dependencies: CreatorAssetServiceDependencies;

  constructor(dependencies: CreatorAssetServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async getWorkspace(): Promise<CreatorWorkspaceView> {
    const workspace = await this.#dependencies.workspaces.getDemoWorkspace();
    if (!workspace) {
      throw new CreatorAssetServiceError(
        "workspace_unavailable",
        "The seeded creator workspace is unavailable.",
      );
    }

    if (
      !workspace.defaultPricingPolicyId
      || !workspace.defaultPricingPolicyVersion
    ) {
      throw new CreatorAssetServiceError(
        "pricing_policy_unavailable",
        "The creator workspace does not have a pricing policy assignment.",
      );
    }

    const [assets, pricingPolicy] = await Promise.all([
      this.#dependencies.assets.listByWorkspace(workspace.workspaceId),
      this.#dependencies.pricingPolicies.getActiveAssignment(
        workspace.defaultPricingPolicyId,
        workspace.defaultPricingPolicyVersion,
      ),
    ]);

    if (!pricingPolicy) {
      throw new CreatorAssetServiceError(
        "pricing_policy_unavailable",
        "The assigned pricing policy is unavailable.",
      );
    }

    return { workspace, assets, pricingPolicy };
  }

  async getAsset(assetId: string): Promise<CreatorAssetDetail> {
    const asset = await this.#dependencies.assets.getById(assetId);
    if (!asset) {
      throw new CreatorAssetServiceError(
        "asset_not_found",
        "The requested asset does not exist.",
      );
    }

    return {
      asset,
      relatedCaseCount: await this.#dependencies.assets.countCases(assetId),
      fingerprintNotice:
        "This fingerprint identifies the controlled demo representation. It does not prove ownership or authority to license.",
    };
  }

  async registerAsset(input: AssetRegistrationInput): Promise<AssetRecord> {
    const workspace = await this.#dependencies.workspaces.getDemoWorkspace();
    if (!workspace) {
      throw new CreatorAssetServiceError(
        "workspace_unavailable",
        "The seeded creator workspace is unavailable.",
      );
    }

    if (
      !workspace.defaultPricingPolicyId
      || !workspace.defaultPricingPolicyVersion
    ) {
      throw new CreatorAssetServiceError(
        "pricing_policy_unavailable",
        "Registering an asset requires the workspace pricing-policy assignment.",
      );
    }

    const pricingPolicy = await this.#dependencies.pricingPolicies.getActiveAssignment(
      workspace.defaultPricingPolicyId,
      workspace.defaultPricingPolicyVersion,
    );
    if (!pricingPolicy) {
      throw new CreatorAssetServiceError(
        "pricing_policy_unavailable",
        "The assigned pricing policy is unavailable.",
      );
    }

    let record: AssetRecord;
    try {
      record = createAssetRecord(input, {
        assetId: this.#dependencies.identifiers.create(),
        workspaceId: workspace.workspaceId,
        now: this.#dependencies.clock.now().toISOString(),
      });
    } catch (error) {
      if (error instanceof AssetRegistrationError) throw error;
      throw error;
    }

    await this.#dependencies.assets.insert(record);
    return record;
  }
}
