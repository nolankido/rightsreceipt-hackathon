export { createMemoryMockTransactionStore } from "./memory-mock-transaction";
export { createD1ExtractionRepository } from "./extraction";
export { createMemoryExtractionRepository } from "./memory-extraction";
export { createD1PricingPolicyReader, createD1QuoteRepository } from "./quotes";
export { createMemoryQuotePersistence } from "./memory-quotes";
export {
  createD1AssetRepository,
  createD1PricingPolicyAssignmentRepository,
  createD1WorkspaceRepository,
} from "./assets";
export { createD1BuyerRequestRepository } from "./buyer-requests";
export { createD1TermsReviewRepository } from "./rights-terms";
export { createMemoryAssetPersistence } from "./memory-assets";
export { createMemoryBuyerRequestPersistence } from "./memory-buyer-requests";
export { createMemoryTermsReviewPersistence } from "./memory-rights-terms";

export {
  DEMO_EXPECTED_QUOTE_CENTS,
  DEMO_POLICY_HASH,
  DEMO_SEED_HASH,
  DEMO_SEED_IDS,
  DEMO_SEED_VERSION,
  DOMAIN_TABLES,
  PERSISTENCE_MIGRATIONS,
  PERSISTENCE_SCHEMA_VERSION,
  type DomainTableName,
} from "./manifest";

export type {
  AssetRecord,
  AssetRepository,
  CreatorWorkspaceRepository,
  D1DatabasePort,
  LicensingCaseRecord,
  LicensingCaseRepository,
  PersistenceRepositories,
  PersistenceUnitOfWork,
  PreparedStatementPort,
  PricingPolicyRepository,
  PricingPolicyVersionRecord,
  SqlValue,
  StatementResult,
  StatementResultMetadata,
  WorkspaceRecord,
} from "./ports";

export interface PersistenceImplementationStatus {
  readonly adapter: "d1-sql-migrations";
  readonly migrationsImplemented: true;
  readonly deterministicSeedImplemented: true;
  readonly localSqliteVerificationImplemented: true;
  readonly buyerRequestRepositoriesImplemented: true;
  readonly termsReviewRepositoriesImplemented: true;
  readonly drizzleMappingImplemented: false;
  readonly liveD1VerificationCompleted: false;
}

export const PERSISTENCE_IMPLEMENTATION_STATUS: PersistenceImplementationStatus = {
  adapter: "d1-sql-migrations",
  migrationsImplemented: true,
  deterministicSeedImplemented: true,
  localSqliteVerificationImplemented: true,
  buyerRequestRepositoriesImplemented: true,
  termsReviewRepositoriesImplemented: true,
  drizzleMappingImplemented: false,
  liveD1VerificationCompleted: false,
};
