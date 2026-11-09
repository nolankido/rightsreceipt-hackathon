import {
  BUYER_REQUEST_CONSENT_COPY,
  BUYER_REQUEST_CONSENT_COPY_VERSION,
  BuyerRequestLinkError,
  createBuyerRequestLinkRecords,
  createBuyerRequestSubmissionRecord,
  type BuyerCapabilityRecord,
  type BuyerRequestInput,
  type BuyerRequestLinkContext,
  type BuyerRequestSubmissionRecord,
  type LicensingCaseDraftRecord,
} from "@rightsreceipt/domain";
import type { AssetRecord } from "@rightsreceipt/domain";
import type { ClockPort, IdentifierPort } from "./index";

export interface BuyerRequestAssetRepositoryPort {
  getById(assetId: string): Promise<AssetRecord | null>;
}

export interface BuyerRequestPersistencePort {
  createRequestLink(
    licensingCase: LicensingCaseDraftRecord,
    capability: BuyerCapabilityRecord,
  ): Promise<void>;
  findByCapabilityDigest(
    tokenDigestSha256: string,
  ): Promise<BuyerRequestLinkContext | null>;
  submitRequest(record: BuyerRequestSubmissionRecord): Promise<void>;
}

export interface CapabilityToken {
  readonly token: string;
  readonly digestSha256: string;
}

export interface CapabilityTokenPort {
  issue(): Promise<CapabilityToken>;
  digest(token: string): Promise<string>;
}

export interface BuyerRequestServiceDependencies {
  readonly assets: BuyerRequestAssetRepositoryPort;
  readonly requests: BuyerRequestPersistencePort;
  readonly capabilities: CapabilityTokenPort;
  readonly identifiers: IdentifierPort;
  readonly clock: ClockPort;
  readonly capabilityLifetimeMilliseconds?: number;
}

export interface BuyerRequestLinkView {
  readonly requestPath: string;
  readonly expiresAt: string;
  readonly asset: AssetRecord;
}

export interface BuyerRequestContextView {
  readonly asset: AssetRecord;
  readonly consentCopyVersion: typeof BUYER_REQUEST_CONSENT_COPY_VERSION;
  readonly consentCopy: typeof BUYER_REQUEST_CONSENT_COPY;
  readonly expiresAt: string;
  readonly alreadySubmitted: boolean;
}

export interface BuyerRequestReceiptView {
  readonly received: true;
  readonly requestSubmissionId: string;
  readonly submittedAt: string;
  readonly asset: AssetRecord;
  readonly buyerOrganization: string;
  readonly consentCopyVersion: typeof BUYER_REQUEST_CONSENT_COPY_VERSION;
}

export class BuyerRequestServiceError extends Error {
  readonly code:
    | "asset_not_found"
    | "asset_unavailable"
    | "request_link_not_found"
    | "request_link_expired"
    | "request_link_revoked"
    | "capability_action_forbidden"
    | "request_already_submitted"
    | "persistence_conflict";

  constructor(
    code: BuyerRequestServiceError["code"],
    message: string,
  ) {
    super(message);
    this.name = "BuyerRequestServiceError";
    this.code = code;
  }
}

const DEFAULT_CAPABILITY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function expiresAtFrom(now: Date, lifetimeMilliseconds: number) {
  return new Date(now.getTime() + lifetimeMilliseconds).toISOString();
}

function hasAction(
  context: BuyerRequestLinkContext,
  action: "submit_request",
) {
  return context.allowedActions.includes(action);
}

export class BuyerRequestService {
  readonly #dependencies: BuyerRequestServiceDependencies;

  constructor(dependencies: BuyerRequestServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async createRequestLink(assetId: string): Promise<BuyerRequestLinkView> {
    const asset = await this.#dependencies.assets.getById(assetId);
    if (!asset) {
      throw new BuyerRequestServiceError(
        "asset_not_found",
        "The requested asset does not exist.",
      );
    }
    if (asset.availability !== "active") {
      throw new BuyerRequestServiceError(
        "asset_unavailable",
        "Archived assets cannot receive new buyer requests.",
      );
    }

    const now = this.#dependencies.clock.now();
    const issuedAt = now.toISOString();
    const expiresAt = expiresAtFrom(
      now,
      this.#dependencies.capabilityLifetimeMilliseconds
        ?? DEFAULT_CAPABILITY_LIFETIME_MS,
    );
    const issued = await this.#dependencies.capabilities.issue();

    let records;
    try {
      records = createBuyerRequestLinkRecords(asset, {
        caseId: this.#dependencies.identifiers.create(),
        buyerCapabilityId: this.#dependencies.identifiers.create(),
        tokenDigestSha256: issued.digestSha256,
        issuedAt,
        expiresAt,
      });
    } catch (error) {
      if (error instanceof BuyerRequestLinkError) {
        const code = error.code === "asset_unavailable"
          ? "asset_unavailable"
          : "persistence_conflict";
        throw new BuyerRequestServiceError(code, error.message);
      }
      throw error;
    }

    await this.#dependencies.requests.createRequestLink(
      records.licensingCase,
      records.capability,
    );

    return {
      requestPath: `/request/${issued.token}`,
      expiresAt,
      asset,
    };
  }

  async getRequestContext(token: string): Promise<BuyerRequestContextView> {
    const context = await this.#resolveContext(token);
    return {
      asset: context.asset,
      consentCopyVersion: BUYER_REQUEST_CONSENT_COPY_VERSION,
      consentCopy: BUYER_REQUEST_CONSENT_COPY,
      expiresAt: context.expiresAt,
      alreadySubmitted: context.requestSubmissionId !== null,
    };
  }

  async submitRequest(
    token: string,
    input: BuyerRequestInput,
  ): Promise<BuyerRequestReceiptView> {
    const context = await this.#resolveContext(token);
    if (!hasAction(context, "submit_request")) {
      throw new BuyerRequestServiceError(
        "capability_action_forbidden",
        "This buyer link cannot submit a licensing request.",
      );
    }
    if (context.requestSubmissionId) {
      throw new BuyerRequestServiceError(
        "request_already_submitted",
        "This buyer link has already submitted its request.",
      );
    }

    const record = createBuyerRequestSubmissionRecord(input, {
      requestSubmissionId: this.#dependencies.identifiers.create(),
      caseId: context.caseId,
      submittedAt: this.#dependencies.clock.now().toISOString(),
    });

    await this.#dependencies.requests.submitRequest(record);

    return {
      received: true,
      requestSubmissionId: record.requestSubmissionId,
      submittedAt: record.submittedAt,
      asset: context.asset,
      buyerOrganization: record.buyerOrganization,
      consentCopyVersion: record.consentCopyVersion,
    };
  }

  async #resolveContext(token: string): Promise<BuyerRequestLinkContext> {
    const digest = await this.#dependencies.capabilities.digest(token);
    const context = await this.#dependencies.requests.findByCapabilityDigest(digest);
    if (!context) {
      throw new BuyerRequestServiceError(
        "request_link_not_found",
        "This buyer request link is invalid or no longer available.",
      );
    }
    if (context.revokedAt) {
      throw new BuyerRequestServiceError(
        "request_link_revoked",
        "This buyer request link has been revoked.",
      );
    }
    if (Date.parse(context.expiresAt) <= this.#dependencies.clock.now().getTime()) {
      throw new BuyerRequestServiceError(
        "request_link_expired",
        "This buyer request link has expired.",
      );
    }
    if (context.asset.availability !== "active") {
      throw new BuyerRequestServiceError(
        "asset_unavailable",
        "This asset is no longer available for new requests.",
      );
    }
    return context;
  }
}
