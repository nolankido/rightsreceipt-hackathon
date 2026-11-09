import type {
  BuyerRequestContextResponse,
  BuyerRequestInputDto,
  BuyerRequestSubmissionResponse,
} from "@rightsreceipt/contracts";
import { RoleBanner, ScaffoldNotice } from "@rightsreceipt/ui";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  BuyerRequestApiError,
  createBuyerRequestLink,
  loadBuyerRequestContext,
  submitBuyerRequest,
} from "./api";
import "./buyer.css";

const DEMO_REQUEST =
  "We would like to use Harbor After Rain in paid Instagram and Facebook ads in the United States and Canada for about three months. We expect around 500,000 impressions and may crop it for vertical formats.";
const DEMO_ASSET_ID = "00000000-0000-4000-8000-000000000003";

export function BuyerRequestLauncherPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startRequest() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const link = await createBuyerRequestLink(DEMO_ASSET_ID);
      navigate(link.requestPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The local request link could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <RoleBanner role="Buyer request" nextAction="Create a local demonstration request" />
      <section className="rr-buyer-form-shell" aria-labelledby="request-launch-title">
        <p className="rr-eyebrow">Local demonstration</p>
        <h1 id="request-launch-title">Request rights to Harbor After Rain</h1>
        <p>
          Create a new private request link for the seeded asset. The creator-only
          demonstration action is available on local development origins, not public deployments.
        </p>
        {error ? <p className="rr-error-panel" role="alert">{error}</p> : null}
        <div className="rr-actions">
          <button className="rr-button rr-button-primary" disabled={creating}
            onClick={() => void startRequest()} type="button">
            {creating ? "Creating private request" : "Start buyer request"}
          </button>
          <NavLink className="rr-button rr-button-secondary" to="/">Return to overview</NavLink>
        </div>
        <ScaffoldNotice>
          This flow is a local demonstration. Creating a request does not approve rights or trigger payment.
        </ScaffoldNotice>
      </section>
    </>
  );
}

function BuyerLoading() {
  return (
    <div className="rr-status-panel" role="status">
      <strong>Loading buyer request</strong>
      <span>Checking the asset and request-link status.</span>
    </div>
  );
}

function BuyerUnavailable({ error }: { error: Error }) {
  return (
    <div className="rr-error-panel" role="alert">
      <strong>Buyer request unavailable</strong>
      <span>{error.message}</span>
      <NavLink className="rr-button rr-button-secondary" to="/">
        Return to overview
      </NavLink>
    </div>
  );
}

function RequestReceived({
  context,
  receipt,
  capability,
}: {
  context: BuyerRequestContextResponse;
  receipt: BuyerRequestSubmissionResponse | undefined;
  capability: string;
}) {
  return (
    <>
      <RoleBanner role="Buyer request" nextAction="Wait for creator review" />
      <section className="rr-buyer-success" aria-labelledby="request-received-title">
        <div className="rr-success-mark" aria-hidden="true">✓</div>
        <p className="rr-eyebrow">Request received</p>
        <h1 id="request-received-title">Your licensing request is saved</h1>
        <p className="rr-lede">
          RightsReceipt preserved the original request as evidence. The creator can now review it and later propose explicit terms.
        </p>
        <dl className="rr-record-list">
          <div>
            <dt>Asset</dt>
            <dd>{context.asset.title}</dd>
          </div>
          <div>
            <dt>Creator</dt>
            <dd>{context.asset.creatorDisplayName}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{receipt?.buyerOrganization ?? "Recorded with the submitted request"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Awaiting creator review</dd>
          </div>
        </dl>
        <ScaffoldNotice>
          Submission does not grant permission, approve use, create an invoice, or confirm payment.
        </ScaffoldNotice>
        <div className="rr-actions">
          <NavLink className="rr-button rr-button-secondary" to={`/request/${capability}/clarify`}>Review clarification questions</NavLink>
          <NavLink className="rr-button rr-button-secondary" to={`/request/${capability}/mock`}>Review creator quote in simulated demo</NavLink>
          <a className="rr-button rr-button-secondary" href={`/receipts/buyer#${encodeURIComponent(capability)}`} rel="noreferrer">Open Sandbox receipt (when available)</a>
        </div>
      </section>
    </>
  );
}

type FormState = Omit<BuyerRequestInputDto, "consentAcknowledged"> & {
  consentAcknowledged: boolean;
};

const initialForm: FormState = {
  buyerName: "Jordan Lee",
  buyerOrganization: "Cedar & Tide Travel",
  buyerEmail: "jordan@example.test",
  intendedUseText: DEMO_REQUEST,
  consentAcknowledged: false,
};

export function BuyerRequestPage() {
  const { capability = "" } = useParams();
  const summaryId = useId();
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [contextState, setContextState] = useState<
    | { status: "loading" }
    | { status: "loaded"; data: BuyerRequestContextResponse }
    | { status: "error"; error: Error }
  >({ status: "loading" });
  const [form, setForm] = useState<FormState>(initialForm);
  const [issues, setIssues] = useState<
    readonly { field: string; code: string; message: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<BuyerRequestSubmissionResponse | null>(null);

  useEffect(() => {
    let active = true;
    setContextState({ status: "loading" });
    loadBuyerRequestContext(capability)
      .then((data) => {
        if (active) setContextState({ status: "loaded", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setContextState({
            status: "error",
            error: error instanceof Error
              ? error
              : new Error("Buyer request context could not be loaded."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [capability]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.consentAcknowledged) {
      setIssues([{ field: "consentAcknowledged", code: "consent_required", message: "Confirm the request acknowledgment before submitting." }]);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSubmitting(true);
    setIssues([]);
    try {
      const nextReceipt = await submitBuyerRequest(capability, { ...form, consentAcknowledged: true });
      setReceipt(nextReceipt);
    } catch (error) {
      if (error instanceof BuyerRequestApiError) {
        setIssues(
          error.issues ?? [
            { field: "form", code: error.code, message: error.message },
          ],
        );
      } else {
        setIssues([
          {
            field: "form",
            code: "request_failed",
            message: error instanceof Error
              ? error.message
              : "Buyer request could not be submitted.",
          },
        ]);
      }
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  if (contextState.status === "loading") return <BuyerLoading />;
  if (contextState.status === "error") {
    return <BuyerUnavailable error={contextState.error} />;
  }

  const context = contextState.data;
  if (context.alreadySubmitted || receipt) {
    return <RequestReceived context={context} receipt={receipt ?? undefined} capability={capability} />;
  }

  const issueFor = (field: string) => issues.find((issue) => issue.field === field);
  const intendedUseCount = Array.from(form.intendedUseText).length;

  return (
    <>
      <RoleBanner role="Buyer request" nextAction="Describe the intended use" />
      <div className="rr-buyer-layout">
        <aside className="rr-buyer-asset" aria-labeledby="buyer-asset-title">
          <img
            alt={`${context.asset.title} controlled demonstration preview`}
            src={context.asset.previewReference}
          />
          <div>
            <p className="rr-eyebrow">Requested asset</p>
            <h1 id="buyer-asset-title">{context.asset.title}</h1>
            <p>By {context.asset.creatorDisplayName}</p>
            <p className="rr-muted">{context.asset.provenanceNote}</p>
          </div>
        </aside>

        <section className="rr-buyer-form-shell" aria-labelledby="buyer-form-title">
          <div>
            <p className="rr-eyebrow">Licensing request</p>
            <h2 id="buyer-form-title">Describe how you want to use this work</h2>
            <p>
              Use ordinary language. The creator will review explicit terms before any permission can be granted.
            </p>
          </div>

          {issues.length > 0 ? (
            <div
              aria-labelledby={`${summaryId}-title`}
              className="rr-error-panel"
              id={summaryId}
              ref={summaryRef}
              role="alert"
              tabIndex={-1}
            >
              <strong id={`${summaryId}-title`}>Review the following items</strong>
              <ul>
                {issues.map((issue) => (
                  <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <form className="rr-form rr-buyer-form" noValidate onSubmit={submit}>
            <label>
              <span>Buyer name</span>
              <input
                aria-describedby={issueFor("buyerName") ? "buyerName-error" : undefined}
                autoComplete="name"
                maxLength={100}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  update("buyerName", event.target.value)
                }
                required
                value={form.buyerName}
              />
              {issueFor("buyerName") ? (
                <small className="rr-field-error" id="buyerName-error">
                  {issueFor("buyerName")?.message}
                </small>
              ) : null}
            </label>

            <label>
              <span>Organization</span>
              <input
                aria-describedby={
                  issueFor("buyerOrganization")
                    ? "buyerOrganization-error"
                    : undefined
                }
                autoComplete="organization"
                maxLength={120}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  update("buyerOrganization", event.target.value)
                }
                required
                value={form.buyerOrganization}
              />
              {issueFor("buyerOrganization") ? (
                <small className="rr-field-error" id="buyerOrganization-error">
                  {issueFor("buyerOrganization")?.message}
                </small>
              ) : null}
            </label>

            <label className="rr-form-wide">
              <span>Email</span>
              <input
                aria-describedby={issueFor("buyerEmail") ? "buyerEmail-error" : undefined}
                autoComplete="email"
                maxLength={254}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  update("buyerEmail", event.target.value)
                }
                required
                type="email"
                value={form.buyerEmail}
              />
              {issueFor("buyerEmail") ? (
                <small className="rr-field-error" id="buyerEmail-error">
                  {issueFor("buyerEmail")?.message}
                </small>
              ) : null}
            </label>

            <label className="rr-form-wide">
              <span>Intended use</span>
              <textarea
                aria-describedby={`intended-use-help intended-use-count${issueFor("intendedUseText") ? " intended-use-error" : ""}`}
                maxLength={4000}
                minLength={40}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  update("intendedUseText", event.target.value)
                }
                required
                rows={9}
                value={form.intendedUseText}
              />
              <small id="intended-use-help">
                Include channels, paid or organic use, territory, dates, audience, modifications, exclusivity, attribution, sublicensing, and any AI use.
              </small>
              <small id="intended-use-count">
                {intendedUseCount} of 4,000 characters, minimum 40
              </small>
              {issueFor("intendedUseText") ? (
                <small className="rr-field-error" id="intended-use-error">
                  {issueFor("intendedUseText")?.message}
                </small>
              ) : null}
            </label>

            <label className="rr-form-wide rr-buyer-consent">
              <input
                aria-describedby={issueFor("consentAcknowledged") ? "consent-error" : undefined}
                checked={form.consentAcknowledged}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  update("consentAcknowledged", event.target.checked)
                }
                required
                type="checkbox"
              />
              <span>{context.consentCopy}</span>
              {issueFor("consentAcknowledged") ? (
                <small className="rr-field-error" id="consent-error">
                  {issueFor("consentAcknowledged")?.message}
                </small>
              ) : null}
            </label>

            <div className="rr-actions rr-form-wide">
              <button className="rr-button rr-button-primary" disabled={submitting || !form.consentAcknowledged} type="submit">
                {submitting ? "Submitting request" : "Submit licensing request"}
              </button>
              <NavLink className="rr-button rr-button-secondary" to="/">Cancel</NavLink>
            </div>
          </form>
          <ScaffoldNotice>
            Submitting is a request for terms, not approval, payment, or permission.
          </ScaffoldNotice>
        </section>
      </div>
    </>
  );
}
