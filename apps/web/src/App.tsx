import {CreatorClarificationPage,BuyerClarificationPage} from "./clarification";
import { MockCreatorPage, MockBuyerPage, MockVerifyPage } from "./mock-transaction";
import { CreatorQuotePage } from "./quote";
import { CreatorExtractionPage } from "./extraction";
import { APP_AUTHORITY_BOUNDARIES } from "@rightsreceipt/contracts";
import {
  AppHeader,
  ModeBadge,
  RoleBanner,
  ScaffoldNotice,
  SurfaceCard,
} from "@rightsreceipt/ui";
import { NavLink, Route, Routes } from "react-router-dom";
import {
  BuyerRequestLauncherPage,
  BuyerRequestPage,
} from "./buyer";
import {
  CreatorAssetDetailPage,
  CreatorAssetRegistrationPage,
} from "./creator";
import { scaffoldRoutes, type ScaffoldRole } from "./routes";
import {
  CreatorCaseListPage,
  CreatorDashboardPage,
  CreatorTermsReviewPage,
} from "./terms";

const roleLabels: Record<ScaffoldRole, string> = {
  public: "Public overview",
  judge: "Judge demonstration",
  creator: "Creator workspace",
  buyer: "Buyer request",
  verifier: "Public verifier",
};

function ScaffoldPage({ role }: { role: ScaffoldRole }) {
  const route = scaffoldRoutes.find((candidate) => candidate.role === role);
  if (!route) return null;

  return (
    <>
      <RoleBanner role={roleLabels[role]} nextAction="Review the implementation boundary" />
      <div className="rr-page-grid">
        <SurfaceCard title={route.label} eyebrow="Executable shell">
          <p>{route.purpose}</p>
          <ScaffoldNotice>
            This route is wired, but its business workflow belongs to a later management turn.
          </ScaffoldNotice>
        </SurfaceCard>
        <SurfaceCard title="Authority stays explicit" eyebrow="Guardrail">
          <ul className="rr-list">
            {APP_AUTHORITY_BOUNDARIES.map((boundary) => (
              <li key={boundary.actor}>
                <strong>{boundary.actor}:</strong> {boundary.responsibility}
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </div>
    </>
  );
}

function OverviewPage() {
  return (
    <>
      <RoleBanner role="Public overview" nextAction="Explore the illustrative judge walkthrough" />
      <section className="rr-hero" aria-labelledby="overview-title">
        <div>
          <p className="rr-eyebrow">Paid permissions for creative work</p>
          <h1 id="overview-title">From a creative request to reviewable permission.</h1>
          <p className="rr-lede">
            RightsReceipt organizes a creative-use request into preserved evidence, reviewable rights, a deterministic quote and a permission record. The public judge walkthrough is synthetic and read-only. A genuine PayPal Sandbox payment is not yet verified.
          </p>
          <div className="rr-actions">
            <a className="rr-button rr-button-primary" href="/judge">
              Explore judge walkthrough
            </a>
          </div>
          <p className="rr-lede">
            Restricted previews expose private-code entry and receipt-viewer screens, but they do not issue buyer codes, create invoices or process payments. Local-only demo routes in the navigation use simulated evidence.
          </p>
        </div>
        <SurfaceCard title="What the prototype proves" eyebrow="Authority boundary">
          <p>
            The offline rehearsal exercises request intake, AI-assisted clarification, human review, deterministic pricing, invoice recovery and a scheduled receipt against injected provider responses.
          </p>
          <p>
            AI does not approve rights or decide payment state. Creator approval, buyer acceptance and genuine PayPal evidence are separate requirements. The restricted preview is not an end-to-end licensing transaction.
          </p>
        </SurfaceCard>
      </section>
    </>
  );
}

function JudgeFallbackPage() {
  return (
    <>
      <RoleBanner role="Judge demonstration" nextAction="Open the read-only walkthrough" />
      <SurfaceCard title="Illustrative judge walkthrough" eyebrow="Synthetic evidence only">
        <p>
          The judge walkthrough is served as a separate, no-login HTML page. It never creates a private request or contacts PayPal.
        </p>
        <p><a href="/judge">Open the judge walkthrough with a full page request</a></p>
      </SurfaceCard>
    </>
  );
}

export function App() {
  return (
    <div className="rr-app-shell">
      <AppHeader
        productName="RightsReceipt"
        mode={<ModeBadge mode="prototype, simulated evidence" tone="simulated" />}
      >
        <nav aria-label="Primary navigation" className="rr-nav">
          {scaffoldRoutes.map((route) =>
            route.role === "judge" ? (
              <a className="rr-nav-link" href={route.path} key={route.path}>
                {route.label}
              </a>
            ) : (
              <NavLink
                className={({ isActive }: { isActive: boolean }) =>
                  isActive ? "rr-nav-link rr-nav-link-active" : "rr-nav-link"
                }
                end={route.path === "/"}
                key={route.path}
                to={route.path}
              >
                {route.label}
              </NavLink>
            ),
          )}
          <NavLink
            className={({ isActive }: { isActive: boolean }) =>
              isActive ? "rr-nav-link rr-nav-link-active" : "rr-nav-link"
            }
            to="/creator/cases"
          >
            Request queue
          </NavLink>
        </nav>
      </AppHeader>
      <main className="rr-main" id="main-content">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/judge" element={<JudgeFallbackPage />} />
          <Route path="/creator" element={<CreatorDashboardPage />} />
          <Route path="/creator/assets/new" element={<CreatorAssetRegistrationPage />} />
          <Route path="/creator/assets/:assetId" element={<CreatorAssetDetailPage />} />
          <Route path="/creator/cases" element={<CreatorCaseListPage />} />
          <Route path="/creator/cases/:caseId" element={<CreatorTermsReviewPage />} />
          <Route path="/creator/cases/:caseId/quote" element={<CreatorQuotePage />} />
          <Route path="/creator/cases/:caseId/extraction" element={<CreatorExtractionPage />} />
          <Route path="/creator/cases/:caseId/clarification" element={<CreatorClarificationPage />} />
          <Route path="/creator/cases/:caseId/mock" element={<MockCreatorPage />} />
          <Route path="/buyer/demo" element={<BuyerRequestLauncherPage />} />
          <Route path="/request/:capability" element={<BuyerRequestPage />} />
          <Route path="/request/:capability/clarify" element={<BuyerClarificationPage />} />
          <Route path="/request/:capability/mock" element={<MockBuyerPage />} />
          <Route path="/verify/demo" element={<ScaffoldPage role="verifier" />} />
          <Route path="/verify/simulated/:publicId" element={<MockVerifyPage />} />
          <Route path="*" element={<ScaffoldPage role="public" />} />
        </Routes>
      </main>
      <footer className="rr-footer">
        <span>Offline rehearsal: injected provider responses</span>
        <span>Genuine PayPal Sandbox payment: not yet verified</span>
      </footer>
    </div>
  );
}
