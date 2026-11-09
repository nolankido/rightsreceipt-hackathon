import {
  AssetRegistrationInputSchema,
  BuyerRequestContextResponseSchema,
  BuyerRequestInputSchema,
  BuyerRequestLinkResponseSchema,
  BuyerRequestSubmissionResponseSchema,
  createHealthResponse,
  CreatorAssetDetailResponseSchema,
  CreatorCaseListResponseSchema,
  CreatorWorkspaceResponseSchema,
  HealthResponseSchema,
  ManualTermsReviewSaveRequestSchema,
  TermsReviewResponseSchema,
  GenerateQuoteRequestSchema,
  QuoteViewResponseSchema,
  MockDecisionRequestSchema,
  MockBuyerAcceptanceRequestSchema,
  MockPaymentRequestSchema,
  MockTransactionViewSchema,
  MockVerificationViewSchema,
  CreatorExtractionViewSchema,
  RunExtractionRequestSchema,
  CreatorClarificationResponseSchema,
  BuyerClarificationResponseSchema,
} from "@rightsreceipt/contracts";
import {
  BuyerRequestService,
  BuyerRequestServiceError,
  CreatorAssetService,
  CreatorAssetServiceError,
  TermsReviewService,
  TermsReviewServiceError,
  QuoteService,
  QuoteServiceError,
  MockTransactionService,
  MockTransactionError,
  CreatorExtractionService,
  CreatorExtractionError,
  CreatorClarificationService,
  BuyerClarificationService,
  ClarificationServiceError,
  type CapabilityTokenPort,
} from "@rightsreceipt/application";
import {
  AssetRegistrationError,
  BuyerRequestValidationError,
  RightsReviewValidationError,
  SAFE_ASSET_PREVIEWS,
} from "@rightsreceipt/domain";
import { createSafeLogContext } from "@rightsreceipt/observability";
import {
  createD1AssetRepository,
  createD1BuyerRequestRepository,
  createD1PricingPolicyAssignmentRepository,
  createD1TermsReviewRepository,
  createD1WorkspaceRepository,
  createD1PricingPolicyReader,
  createD1QuoteRepository,
  createMemoryAssetPersistence,
  createMemoryMockTransactionStore,
  createD1ExtractionRepository,
  type D1DatabasePort,
} from "@rightsreceipt/persistence";
import { Hono, type Context } from "hono";
import { creatorDemoAccessAllowed, localDemoAccessAllowed } from "./demo-access";
import { hostedD1Ready } from "./hosted-persistence";
import { legacyBuyerRuntimeBoundary } from "./legacy-buyer-boundary";
import { localLearnedDiagnostic } from "./model-assets";
import { assessDeterministicRights, buildClarificationPlan } from "@rightsreceipt/ai-runtime";

export interface Bindings {
  APP_MODE?: "local" | "sandbox" | "judge";
  DB?: D1DatabasePort;
}

export const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "no-referrer");
  await next();
});

// Keep the legacy path-token APIs from bypassing canonical intake on a real database.
app.use("/api/request/*", async (context, next) => {
  const denied = legacyBuyerRuntimeBoundary(context.req.raw, context.env);
  if (denied) return denied;
  await next();
});

function modeFromBindings(bindings: Bindings | undefined) {
  return bindings?.APP_MODE ?? "local";
}

function healthPayload(bindings: Bindings | undefined) {
  return HealthResponseSchema.parse(createHealthResponse(modeFromBindings(bindings)));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const capabilityTokens: CapabilityTokenPort = {
  async issue() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = bytesToBase64Url(bytes);
    return { token, digestSha256: await sha256Hex(token) };
  },
  digest: sha256Hex,
};

const localMemoryAssets = createMemoryAssetPersistence();
const localMockTransactions = createMemoryMockTransactionStore();

function servicesFromBindings(bindings: Bindings | undefined) {
  const shared = {
    identifiers: { create: () => crypto.randomUUID() },
    clock: {
      now: () => new Date(),
      todayUtc: () => new Date().toISOString().slice(0, 10),
    },
  };

  if (bindings?.DB) {
    const assets = createD1AssetRepository(bindings.DB);
    const workspaces = createD1WorkspaceRepository(bindings.DB);
    const clarifications = new CreatorClarificationService({
      terms: createD1TermsReviewRepository(bindings.DB),
      evaluateDeterministic: (text) => assessDeterministicRights(text, {sha256Hex}),
      planner: {build: buildClarificationPlan},
    });
    return {
      creatorAssets: new CreatorAssetService({
        workspaces,
        assets,
        pricingPolicies: createD1PricingPolicyAssignmentRepository(bindings.DB),
        ...shared,
      }),
      buyerRequests: new BuyerRequestService({
        assets,
        requests: createD1BuyerRequestRepository(bindings.DB),
        capabilities: capabilityTokens,
        ...shared,
      }),
      termsReviews: new TermsReviewService({
        workspaces,
        terms: createD1TermsReviewRepository(bindings.DB),
        hasher: { sha256Hex },
        actorReference: "demo-creator",
        ...shared,
      }),
      quotes: new QuoteService({
        workspaces,
        terms: createD1TermsReviewRepository(bindings.DB),
        pricingPolicies: createD1PricingPolicyReader(bindings.DB),
        quotes: createD1QuoteRepository(bindings.DB),
        hasher: { sha256Hex },
        ...shared,
      }),
      extraction: new CreatorExtractionService({
        terms: createD1TermsReviewRepository(bindings.DB),
        extraction: createD1ExtractionRepository(bindings.DB),
        hasher: { sha256Hex }, learned: localLearnedDiagnostic, ...shared,
      }),
      clarifications,
      buyerClarifications: new BuyerClarificationService({
        clarifications,
        requests: createD1BuyerRequestRepository(bindings.DB),
        capabilities: capabilityTokens,
        clock: shared.clock,
      }),
      storageMode: "d1" as const,
    };
  }

  if (modeFromBindings(bindings) === "local") {
    const clarifications = new CreatorClarificationService({
      terms: localMemoryAssets.termsReviews,
      evaluateDeterministic: (text) => assessDeterministicRights(text, {sha256Hex}),
      planner: {build: buildClarificationPlan},
    });
    return {
      creatorAssets: new CreatorAssetService({
        workspaces: localMemoryAssets.workspaces,
        assets: localMemoryAssets.assets,
        pricingPolicies: localMemoryAssets.pricingPolicies,
        ...shared,
      }),
      buyerRequests: new BuyerRequestService({
        assets: localMemoryAssets.assets,
        requests: localMemoryAssets.buyerRequests,
        capabilities: capabilityTokens,
        ...shared,
      }),
      termsReviews: new TermsReviewService({
        workspaces: localMemoryAssets.workspaces,
        terms: localMemoryAssets.termsReviews,
        hasher: { sha256Hex },
        actorReference: "demo-creator",
        ...shared,
      }),
      quotes: new QuoteService({
        workspaces: localMemoryAssets.workspaces,
        terms: localMemoryAssets.termsReviews,
        pricingPolicies: localMemoryAssets.quotePersistence.pricingPolicies,
        quotes: localMemoryAssets.quotePersistence.quotes,
        hasher: { sha256Hex },
        ...shared,
      }),
      extraction: new CreatorExtractionService({
        terms: localMemoryAssets.termsReviews,
        extraction: localMemoryAssets.automatedExtraction,
        hasher: { sha256Hex }, learned: localLearnedDiagnostic, ...shared,
      }),
      clarifications,
      buyerClarifications: new BuyerClarificationService({
        clarifications,
        requests: localMemoryAssets.buyerRequests,
        capabilities: capabilityTokens,
        clock: shared.clock,
      }),
      storageMode: "memory" as const,
    };
  }

  return null;
}


function mockServiceForBindings(bindings: Bindings | undefined, requestUrl: string) {
  if (!localDemoAccessAllowed(requestUrl, modeFromBindings(bindings), !!bindings?.DB)) return null;
  const services = servicesFromBindings(bindings);
  if (!services || services.storageMode !== "memory") return null;
  return new MockTransactionService({
    terms: localMemoryAssets.termsReviews,
    quotes: services.quotes,
    buyerRequests: localMemoryAssets.buyerRequests,
    capabilities: capabilityTokens,
    store: localMockTransactions,
    identifiers: { create: () => crypto.randomUUID() },
    clock: { now: () => new Date(), todayUtc: () => new Date().toISOString().slice(0, 10) },
    hasher: { sha256Hex },
  });
}

function mockUnavailable(context: Context<{ Bindings: Bindings }>) {
  return context.json({
    code: "mock_mode_unavailable",
    message: "Simulated transactions require an approved local development origin, local mode, and no D1 binding.",
  }, 503);
}


function dependencyUnavailable(context: Context<{ Bindings: Bindings }>) {
  return context.json(
    {
      code: "persistence_unavailable",
      message: "The RightsReceipt database binding is not configured in this environment.",
    },
    503,
  );
}

function requestTokenLooksValid(value: string) {
  return /^[A-Za-z0-9_-]{43,128}$/u.test(value);
}

function caseIdLooksValid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}

function validationIssues(
  issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly code: string;
    readonly message: string;
  }[],
) {
  return issues.map((issue) => ({
    field: issue.path.map((segment) => typeof segment === "symbol" ? "[symbol]" : String(segment)).join(".") || "form",
    code: issue.code,
    message: issue.message,
  }));
}

function safeError(error: unknown) {
  if (error instanceof AssetRegistrationError) {
    return {
      status: 422 as const,
      body: {
        code: "asset_validation_failed",
        message: error.message,
        issues: error.issues,
      },
    };
  }

  if (error instanceof BuyerRequestValidationError) {
    return {
      status: 422 as const,
      body: {
        code: "buyer_request_validation_failed",
        message: "Review the buyer request and try again.",
        issues: error.issues,
      },
    };
  }

  if (error instanceof RightsReviewValidationError) {
    return {
      status: 422 as const,
      body: {
        code: "terms_review_validation_failed",
        message: "Review the structured terms and try again.",
        issues: error.issues,
      },
    };
  }

  if (error instanceof CreatorAssetServiceError) {
    return {
      status: error.code === "asset_not_found" ? (404 as const) : (503 as const),
      body: { code: error.code, message: error.message },
    };
  }

  if (error instanceof BuyerRequestServiceError) {
    const status = error.code === "asset_not_found"
      || error.code === "request_link_not_found"
      ? (404 as const)
      : error.code === "request_link_expired"
        || error.code === "request_link_revoked"
        ? (410 as const)
        : error.code === "capability_action_forbidden"
          ? (403 as const)
          : (409 as const);
    return {
      status,
      body: { code: error.code, message: error.message },
    };
  }


  if (error instanceof MockTransactionError) {
    const status = error.code === "case_unavailable" || error.code === "receipt_not_found"
      ? 404 : error.code === "buyer_capability_invalid" ? 403
        : error.code === "reason_required" || error.code === "acceptance_required"
          ? 422 : 409;
    return { status: status as 404 | 403 | 422 | 409,
      body: { code: error.code, message: error.message } };
  }

  if (error instanceof ClarificationServiceError) {
    const status = error.code === "capability_invalid" || error.code === "case_not_found"
      ? (404 as const) : error.code === "case_closed" ? (409 as const) : (503 as const);
    return {status,body:{code:error.code,message:error.message}};
  }
  if (error instanceof CreatorExtractionError) {
    const status = error.code === "case_not_found" ? 404
      : error.code === "invalid_source" ? 422
        : error.code === "evidence_integrity_failed" ? 503 : 409;
    return { status: status as 404 | 422 | 503 | 409,
      body: { code: error.code, message: error.message } };
  }
  if (error instanceof QuoteServiceError) {
    const status = error.code === "case_not_found" ? 404
      : error.code === "terms_incomplete" || error.code.startsWith("terms_")
        || error.code === "unsupported_terms" ? 422
        : error.code === "stale_case" || error.code === "case_closed" ? 409 : 503;
    return { status: status as 404 | 422 | 409 | 503, body: { code: error.code, message: error.message } };
  }

  if (error instanceof TermsReviewServiceError) {
    const status = error.code === "case_not_found"
      ? (404 as const)
      : error.code === "case_closed"
        || error.code === "terms_unchanged"
        || error.code === "stale_case"
        ? (409 as const)
        : error.code === "request_required"
          ? (422 as const)
          : (503 as const);
    return {
      status,
      body: { code: error.code, message: error.message },
    };
  }

  return {
    status: 500 as const,
    body: {
      code: "internal_error",
      message: "The requested operation could not be completed.",
    },
  };
}

async function healthResponse(context: Context<{ Bindings: Bindings }>) {
  const mode = modeFromBindings(context.env);
  if (mode !== "local" && !(await hostedD1Ready(context.env?.DB))) {
    return context.json({
      status: "unavailable", service: "rightsreceipt", mode,
      code: "persistence_unavailable",
    }, 503);
  }
  return context.json({
    ...healthPayload(context.env),
    persistence: mode === "local" ? "not_required" : "ready",
  });
}

app.get("/health", healthResponse);
app.get("/api/health", healthResponse);

app.get("/api/scaffold", (context) => {
  const correlationId = context.req.header("x-correlation-id");
  const logContext = createSafeLogContext(
    correlationId
      ? { correlationId, event: "scaffold.read" }
      : { event: "scaffold.read" },
  );

  return context.json({
    status: "mock-vertical-slice",
    message:
      "Creator assets, buyer intake, rights review, and deterministic pricing are implemented. AI extraction and PayPal remain future turns. Fake payment and simulated receipts are local-only.",
    mode: modeFromBindings(context.env),
    log_context: logContext,
  });
});

app.use("/api/creator/*", async (context, next) => {
  if (!creatorDemoAccessAllowed(
    context.req.url,
    modeFromBindings(context.env),
    !!context.env?.DB,
    context.req.header("x-rightsreceipt-demo-role"),
  )) {
    return context.json(
      {
        code: "creator_session_required",
        message: "Creator actions are unavailable outside local development without secure session authentication.",
      },
      403,
    );
  }
  await next();
});

app.get("/api/creator/workspace", async (context) => {
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  try {
    const view = await services.creatorAssets.getWorkspace();
    return context.json(
      CreatorWorkspaceResponseSchema.parse({
        storageMode: services.storageMode,
        ...view,
        previewOptions: Object.values(SAFE_ASSET_PREVIEWS),
      }),
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/creator/assets/:assetId", async (context) => {
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  try {
    return context.json(
      CreatorAssetDetailResponseSchema.parse({
        storageMode: services.storageMode,
        ...(await services.creatorAssets.getAsset(context.req.param("assetId"))),
      }),
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/creator/assets", async (context) => {
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  let input: unknown;
  try {
    input = await context.req.json();
  } catch {
    return context.json(
      { code: "invalid_json", message: "Request body must be valid JSON." },
      400,
    );
  }

  const parsed = AssetRegistrationInputSchema.safeParse(input);
  if (!parsed.success) {
    return context.json(
      {
        code: "asset_validation_failed",
        message: "Review the asset metadata and try again.",
        issues: validationIssues(parsed.error.issues),
      },
      422,
    );
  }

  try {
    const asset = await services.creatorAssets.registerAsset(parsed.data);
    return context.json(
      { storageMode: services.storageMode, asset, created: true as const },
      201,
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/creator/assets/:assetId/request-links", async (context) => {
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  try {
    return context.json(
      BuyerRequestLinkResponseSchema.parse({
        storageMode: services.storageMode,
        ...(await services.buyerRequests.createRequestLink(
          context.req.param("assetId"),
        )),
      }),
      201,
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/creator/cases", async (context) => {
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  try {
    return context.json(
      CreatorCaseListResponseSchema.parse({
        storageMode: services.storageMode,
        cases: await services.termsReviews.listCases(),
      }),
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/creator/cases/:caseId/clarification", async (context) => {
  const caseId = context.req.param("caseId");
  if (!caseIdLooksValid(caseId)) {
    return context.json({code:"case_not_found",message:"No submitted licensing case exists."},404);
  }
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);
  try {
    return context.json(CreatorClarificationResponseSchema.parse({
      storageMode: services.storageMode,
      ...(await services.clarifications.get(caseId)),
    }));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body,response.status);
  }
});

app.get("/api/creator/cases/:caseId/extraction", async (context) => {
  const caseId = context.req.param("caseId");
  if (!caseIdLooksValid(caseId)) {
    return context.json({ code: "case_not_found", message: "No submitted licensing request exists." }, 404);
  }
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);
  try {
    return context.json(CreatorExtractionViewSchema.parse({
      storageMode: services.storageMode, ...(await services.extraction.get(caseId)),
    }));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/creator/cases/:caseId/extraction", async (context) => {
  const caseId = context.req.param("caseId");
  if (!caseIdLooksValid(caseId)) {
    return context.json({ code: "case_not_found", message: "No submitted licensing request exists." }, 404);
  }
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);
  let body: unknown;
  try { body = await context.req.json(); }
  catch { return context.json({ code: "invalid_json", message: "Valid JSON is required." }, 400); }
  const parsed = RunExtractionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return context.json({ code: "invalid_extraction_request", message: "A current case revision is required." }, 422);
  }
  try {
    return context.json(CreatorExtractionViewSchema.parse({
      storageMode: services.storageMode,
      ...(await services.extraction.run(caseId, parsed.data.expectedCaseRowVersion)),
    }), 201);
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/creator/cases/:caseId/terms", async (context) => {
  const caseId = context.req.param("caseId");
  if (!caseIdLooksValid(caseId)) {
    return context.json(
      { code: "case_not_found", message: "The requested licensing case does not exist." },
      404,
    );
  }
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  try {
    return context.json(
      TermsReviewResponseSchema.parse({
        storageMode: services.storageMode,
        ...(await services.termsReviews.getReview(caseId)),
      }),
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/creator/cases/:caseId/terms", async (context) => {
  const caseId = context.req.param("caseId");
  if (!caseIdLooksValid(caseId)) {
    return context.json(
      { code: "case_not_found", message: "The requested licensing case does not exist." },
      404,
    );
  }
  const contentLength = Number(context.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 24_000) {
    return context.json(
      { code: "request_too_large", message: "The terms review body is too large." },
      413,
    );
  }

  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  let input: unknown;
  try {
    input = await context.req.json();
  } catch {
    return context.json(
      { code: "invalid_json", message: "Request body must be valid JSON." },
      400,
    );
  }

  const parsed = ManualTermsReviewSaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    return context.json(
      {
        code: "terms_review_validation_failed",
        message: "Review the structured terms and try again.",
        issues: validationIssues(parsed.error.issues),
      },
      422,
    );
  }

  try {
    return context.json(
      TermsReviewResponseSchema.parse({
        storageMode: services.storageMode,
        ...(await services.termsReviews.saveManualReview(
          caseId,
          parsed.data.expectedCaseRowVersion,
          { fields: parsed.data.fields },
          context.req.header("x-correlation-id"),
        )),
      }),
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/creator/cases/:caseId/quote", async (context) => {
  const caseId = context.req.param("caseId");
  if (!caseIdLooksValid(caseId)) {
    return context.json({ code: "case_not_found", message: "The requested case does not exist." }, 404);
  }
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);
  try {
    return context.json(QuoteViewResponseSchema.parse({
      storageMode: services.storageMode,
      ...(await services.quotes.getQuote(caseId)),
    }));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/creator/cases/:caseId/quote", async (context) => {
  const caseId = context.req.param("caseId");
  if (!caseIdLooksValid(caseId)) {
    return context.json({ code: "case_not_found", message: "The requested case does not exist." }, 404);
  }
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return context.json({ code: "invalid_json", message: "Request body must be valid JSON." }, 400);
  }
  const input = GenerateQuoteRequestSchema.safeParse(body);
  if (!input.success) {
    return context.json({
      code: "quote_request_invalid",
      message: "A current case version is required to generate a quote.",
    }, 422);
  }
  try {
    return context.json(QuoteViewResponseSchema.parse({
      storageMode: services.storageMode,
      ...(await services.quotes.generateQuote(caseId, input.data.expectedCaseRowVersion)),
    }), 201);
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/request/:capability/clarify", async (context) => {
  const capability = context.req.param("capability");
  if (!requestTokenLooksValid(capability)) {
    return context.json({code:"capability_invalid",message:"This buyer clarification link is not available."},404);
  }
  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);
  try {
    return context.json(BuyerClarificationResponseSchema.parse(
      await services.buyerClarifications.get(capability),
    ));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body,response.status);
  }
});

app.get("/api/request/:capability", async (context) => {
  const capability = context.req.param("capability");
  if (!requestTokenLooksValid(capability)) {
    return context.json(
      {
        code: "request_link_not_found",
        message: "This buyer request link is invalid or no longer available.",
      },
      404,
    );
  }

  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  try {
    return context.json(
      BuyerRequestContextResponseSchema.parse({
        storageMode: services.storageMode,
        ...(await services.buyerRequests.getRequestContext(capability)),
      }),
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/request/:capability", async (context) => {
  const capability = context.req.param("capability");
  if (!requestTokenLooksValid(capability)) {
    return context.json(
      {
        code: "request_link_not_found",
        message: "This buyer request link is invalid or no longer available.",
      },
      404,
    );
  }

  const contentLength = Number(context.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    return context.json(
      {
        code: "request_too_large",
        message: "The buyer request body is too large.",
      },
      413,
    );
  }

  const services = servicesFromBindings(context.env);
  if (!services) return dependencyUnavailable(context);

  let input: unknown;
  try {
    input = await context.req.json();
  } catch {
    return context.json(
      { code: "invalid_json", message: "Request body must be valid JSON." },
      400,
    );
  }

  const parsed = BuyerRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return context.json(
      {
        code: "buyer_request_validation_failed",
        message: "Review the buyer request and try again.",
        issues: validationIssues(parsed.error.issues),
      },
      422,
    );
  }

  try {
    return context.json(
      BuyerRequestSubmissionResponseSchema.parse({
        storageMode: services.storageMode,
        ...(await services.buyerRequests.submitRequest(capability, parsed.data)),
      }),
      201,
    );
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});


app.get("/api/creator/cases/:caseId/mock", async (context) => {
  const service = mockServiceForBindings(context.env, context.req.url);
  if (!service) return mockUnavailable(context);
  try {
    return context.json(MockTransactionViewSchema.parse(
      await service.getCreator(context.req.param("caseId")),
    ));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/creator/cases/:caseId/mock/decision", async (context) => {
  const service = mockServiceForBindings(context.env, context.req.url);
  if (!service) return mockUnavailable(context);
  let body: unknown;
  try { body = await context.req.json(); }
  catch { return context.json({ code: "invalid_json", message: "Valid JSON is required." }, 400); }
  const parsed = MockDecisionRequestSchema.safeParse(body);
  if (!parsed.success) return context.json({
    code: "invalid_mock_decision", message: "Review the selected decision and version identifiers.",
    issues: validationIssues(parsed.error.issues),
  }, 422);
  try {
    return context.json(MockTransactionViewSchema.parse(
      await service.decide(context.req.param("caseId"), parsed.data),
    ));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/creator/cases/:caseId/mock/payment", async (context) => {
  const service = mockServiceForBindings(context.env, context.req.url);
  if (!service) return mockUnavailable(context);
  let body: unknown;
  try { body = await context.req.json(); }
  catch { return context.json({ code: "invalid_json", message: "Valid JSON is required." }, 400); }
  const parsed = MockPaymentRequestSchema.safeParse(body);
  if (!parsed.success) return context.json({
    code: "invalid_mock_payment", message: "The simulation requires a current quote and revision.",
  }, 422);
  try {
    return context.json(MockTransactionViewSchema.parse(
      await service.simulatePayment(context.req.param("caseId"), parsed.data),
    ));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/request/:capability/mock", async (context) => {
  const token = context.req.param("capability");
  if (!requestTokenLooksValid(token)) return context.json({
    code: "request_link_not_found", message: "This buyer request link is invalid.",
  }, 404);
  const service = mockServiceForBindings(context.env, context.req.url);
  if (!service) return mockUnavailable(context);
  try {
    return context.json(MockTransactionViewSchema.parse(await service.getBuyer(token)));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.post("/api/request/:capability/mock/accept", async (context) => {
  const token = context.req.param("capability");
  if (!requestTokenLooksValid(token)) return context.json({
    code: "request_link_not_found", message: "This buyer request link is invalid.",
  }, 404);
  const service = mockServiceForBindings(context.env, context.req.url);
  if (!service) return mockUnavailable(context);
  let body: unknown;
  try { body = await context.req.json(); }
  catch { return context.json({ code: "invalid_json", message: "Valid JSON is required." }, 400); }
  const parsed = MockBuyerAcceptanceRequestSchema.safeParse(body);
  if (!parsed.success) return context.json({
    code: "invalid_mock_acceptance",
    message: "Explicit acceptance of the exact saved quote is required.",
  }, 422);
  try {
    return context.json(MockTransactionViewSchema.parse(
      await service.accept(token, parsed.data),
    ));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.get("/api/mock/verify/:publicId", async (context) => {
  const publicId = context.req.param("publicId");
  if (!requestTokenLooksValid(publicId)) return context.json({
    code: "receipt_not_found", message: "No simulated receipt exists for this identifier.",
  }, 404);
  const service = mockServiceForBindings(context.env, context.req.url);
  if (!service) return mockUnavailable(context);
  try {
    return context.json(MockVerificationViewSchema.parse(await service.verify(publicId)));
  } catch (error) {
    const response = safeError(error);
    return context.json(response.body, response.status);
  }
});

app.notFound((context) =>
  context.json(
    {
      code: "route_not_found",
      message: "No API route matches this request.",
    },
    404,
  ),
);

export default app;
