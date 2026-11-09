/** Isolate canonical transactions, receipts and authenticated webhooks from Hono. */
import app from "./index";
import { createJudgeTourRoute } from "./judge-tour";
import { createJudgeRuntimeProfileRoute } from "./judge-runtime-profile";
import { createCreatorSessionAuthorization } from "./creator-session";
import { createTransactionRoutes, configuredSandboxTransport, type TransactionBindings } from "./transaction-routes";
import { createPayPalWebhookRoute, PAYPAL_WEBHOOK_ROUTE, type PayPalWebhookBindings } from "./paypal-webhook-route";
import { runPayPalWebhookProcessing, type PayPalProcessingBindings } from "./paypal-webhook-processing";
import { createReceiptRoutes, type ReceiptExperienceBindings } from "./receipt-routes";

import { runPermissionClock, type PermissionClockBindings } from "./permission-clock";

const webhook = createPayPalWebhookRoute();
const judgeTour = createJudgeTourRoute();
const judgeRuntimeProfile = createJudgeRuntimeProfileRoute();
// Signed human Access sessions plus explicit workspace mapping. Default off.
const sessions = createCreatorSessionAuthorization({ fetch: (url, init) => fetch(url, init) });
const receipts = createReceiptRoutes(async (request, caseId, env) => !!await sessions.authorize(request, caseId, env));
const transactions = createTransactionRoutes({ sessions,
  transport: env => configuredSandboxTransport(env, (url, init) => fetch(url, init)) });
export default {
  async fetch(...args: Parameters<typeof app.fetch>) {
    const [request, env] = args;
    const tour = judgeTour(request);
    if (tour) return tour;
    const profile = judgeRuntimeProfile(request, env);
    if (profile) return profile;
    if (new URL(request.url).pathname === PAYPAL_WEBHOOK_ROUTE) {
      return webhook(request, env as PayPalWebhookBindings | undefined);
    }
    const transaction = await transactions(request, env as TransactionBindings | undefined);
    if (transaction) return transaction;
    const receipt = await receipts(request, env as ReceiptExperienceBindings | undefined);
    if (receipt) return receipt;
    return app.fetch(...args);
  },
  // Disabled by default. No Cron Trigger is configured by this turn.
  async scheduled(_event: unknown, env: PayPalProcessingBindings & PermissionClockBindings) {
    await runPayPalWebhookProcessing(env);
    await runPermissionClock(env);
  },
};
