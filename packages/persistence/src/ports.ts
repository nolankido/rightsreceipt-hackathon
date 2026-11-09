import type { AssetRecord, WorkspaceRecord } from "@rightsreceipt/domain";

export type { AssetRecord, WorkspaceRecord } from "@rightsreceipt/domain";

export type SqlValue = string | number | bigint | boolean | null | Uint8Array;

export interface StatementResultMetadata {
  readonly changes?: number;
  readonly duration?: number;
  readonly lastRowId?: number;
  readonly rowsRead?: number;
  readonly rowsWritten?: number;
}

export interface StatementResult<TRow = Record<string, unknown>> {
  readonly success: boolean;
  readonly results?: readonly TRow[];
  readonly meta?: StatementResultMetadata;
}

export interface PreparedStatementPort<TRow = Record<string, unknown>> {
  bind(...values: readonly SqlValue[]): PreparedStatementPort<TRow>;
  first<TSelected = TRow>(columnName?: string): Promise<TSelected | null>;
  all(): Promise<StatementResult<TRow>>;
  run(): Promise<StatementResult<TRow>>;
  raw(): Promise<readonly (readonly unknown[])[]>;
}

export interface D1DatabasePort {
  prepare<TRow = Record<string, unknown>>(query: string): PreparedStatementPort<TRow>;
  batch<TStatement extends PreparedStatementPort>(
    statements: readonly TStatement[],
  ): Promise<readonly StatementResult[]>;
  exec(query: string): Promise<{ readonly count: number; readonly duration: number }>;
}

export interface PricingPolicyVersionRecord {
  readonly pricingPolicyId: string;
  readonly workspaceId: string;
  readonly versionNumber: number;
  readonly policyName: string;
  readonly currency: "USD";
  readonly rulesJson: string;
  readonly policyHash: string;
  readonly status: "active" | "superseded";
}

export interface LicensingCaseRecord {
  readonly caseId: string;
  readonly workspaceId: string;
  readonly assetId: string;
  readonly caseOutcome: "open" | "rejected" | "canceled";
  readonly rowVersion: number;
}

export interface CreatorWorkspaceRepository {
  getById(workspaceId: string): Promise<WorkspaceRecord | null>;
  getDemoWorkspace(): Promise<WorkspaceRecord | null>;
}

export interface AssetRepository {
  getById(assetId: string): Promise<AssetRecord | null>;
  listByWorkspace(workspaceId: string): Promise<readonly AssetRecord[]>;
  insert(record: AssetRecord): Promise<void>;
}

export interface PricingPolicyRepository {
  getVersion(
    pricingPolicyId: string,
    versionNumber: number,
  ): Promise<PricingPolicyVersionRecord | null>;
  getActiveForWorkspace(workspaceId: string): Promise<PricingPolicyVersionRecord | null>;
}

export interface LicensingCaseRepository {
  getById(caseId: string): Promise<LicensingCaseRecord | null>;
  insert(record: LicensingCaseRecord): Promise<void>;
  updateOutcome(
    caseId: string,
    expectedRowVersion: number,
    outcome: LicensingCaseRecord["caseOutcome"],
  ): Promise<LicensingCaseRecord>;
}

export interface PersistenceUnitOfWork {
  run<T>(operation: (database: D1DatabasePort) => Promise<T>): Promise<T>;
}

export interface PersistenceRepositories {
  readonly workspaces: CreatorWorkspaceRepository;
  readonly assets: AssetRepository;
  readonly pricingPolicies: PricingPolicyRepository;
  readonly licensingCases: LicensingCaseRepository;
  readonly unitOfWork: PersistenceUnitOfWork;
}
