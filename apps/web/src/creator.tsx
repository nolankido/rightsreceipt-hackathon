import type {
  AssetRegistrationInputDto,
  CreatorAssetDetailResponse,
  CreatorWorkspaceResponse,
} from "@rightsreceipt/contracts";
import { RoleBanner, ScaffoldNotice, SurfaceCard } from "@rightsreceipt/ui";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import "./creator.css";
import {
  CreatorApiError,
  loadCreatorAsset,
  loadCreatorWorkspace,
  registerCreatorAsset,
} from "./api";

function LoadingState({ message }: { message: string }) {
  return (
    <div className="rr-status-panel" role="status">
      <strong>Loading</strong>
      <span>{message}</span>
    </div>
  );
}

function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="rr-error-panel" role="alert">
      <strong>Creator workspace unavailable</strong>
      <span>{error.message}</span>
      <button className="rr-button rr-button-secondary" onClick={retry} type="button">
        Try again
      </button>
    </div>
  );
}

function PreviewImage({
  reference,
  alt,
}: {
  reference: string;
  alt: string;
}) {
  return (
    <div className="rr-asset-preview">
      <img alt={alt} loading="lazy" src={reference} />
    </div>
  );
}

function availabilityLabel(value: "active" | "archived") {
  return value === "active" ? "Available for requests" : "Archived";
}

function useWorkspace() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; data: CreatorWorkspaceResponse }
    | { status: "error"; error: Error }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    // Retry replaces the prior workspace response with a loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    loadCreatorWorkspace()
      .then((data) => {
        if (active) setState({ status: "loaded", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error("Workspace request failed."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}

export function CreatorWorkspacePage() {
  const { state, retry } = useWorkspace();

  if (state.status === "loading") {
    return <LoadingState message="Loading the seeded creator workspace and assets." />;
  }
  if (state.status === "error") {
    return <ErrorState error={state.error} retry={retry} />;
  }

  const { workspace, assets, pricingPolicy } = state.data;
  return (
    <>
      <RoleBanner role="Creator workspace" nextAction="Open the seeded asset or register metadata" />
      <section className="rr-workspace-summary" aria-labelledby="workspace-title">
        <div>
          <p className="rr-eyebrow">Demo creator</p>
          <h1 id="workspace-title">{workspace.displayName}</h1>
          <p className="rr-lede">
            Manage controlled asset metadata before buyer requests enter the licensing workflow.
          </p>
        </div>
        <dl className="rr-summary-list">
          <div>
            <dt>Pricing policy</dt>
            <dd>{pricingPolicy.policyName}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{pricingPolicy.versionNumber}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{pricingPolicy.currency}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{state.data.storageMode === "d1" ? "D1 database" : "Local memory fallback"}</dd>
          </div>
        </dl>
      </section>

      <div className="rr-section-heading">
        <div>
          <p className="rr-eyebrow">Asset catalog</p>
          <h2>Registered visual work</h2>
        </div>
        <NavLink className="rr-button rr-button-secondary" to="/creator/assets/new">
          Register asset metadata
        </NavLink>
      </div>

      {assets.length === 0 ? (
        <SurfaceCard eyebrow="Empty state" title="No assets registered">
          <p>Register controlled metadata for a photograph or illustration to begin.</p>
        </SurfaceCard>
      ) : (
        <div className="rr-asset-grid">
          {assets.map((asset) => (
            <article className="rr-asset-card" key={asset.assetId}>
              <PreviewImage
                alt={`${asset.title} controlled demonstration preview`}
                reference={asset.previewReference}
              />
              <div className="rr-asset-card-body">
                <div className="rr-asset-card-topline">
                  <span className="rr-status-chip">{availabilityLabel(asset.availability)}</span>
                  <span>{asset.assetType}</span>
                </div>
                <h3>{asset.title}</h3>
                <p>{asset.provenanceNote}</p>
                <NavLink
                  className="rr-button rr-button-primary"
                  to={`/creator/assets/${asset.assetId}`}
                >
                  Open asset
                </NavLink>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="rr-page-grid rr-workspace-secondary">
        <SurfaceCard eyebrow="Request queue" title="No open requests">
          <p>Buyer request intake begins in Turn 010. No transaction records are seeded.</p>
        </SurfaceCard>
        <SurfaceCard eyebrow="Receipts" title="No rights receipts">
          <p>Rights receipts begin only after accepted terms and verified payment evidence.</p>
        </SurfaceCard>
      </div>
    </>
  );
}

export function CreatorAssetDetailPage() {
  const { assetId = "" } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; data: CreatorAssetDetailResponse }
    | { status: "error"; error: Error }
  >({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    // New asset IDs and retries invalidate previously loaded asset details.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    loadCreatorAsset(assetId)
      .then((data) => {
        if (active) setState({ status: "loaded", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error("Asset request failed."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [assetId, attempt]);

  if (state.status === "loading") {
    return <LoadingState message="Loading asset metadata." />;
  }
  if (state.status === "error") {
    return <ErrorState error={state.error} retry={() => setAttempt((value) => value + 1)} />;
  }

  const { asset, relatedCaseCount, fingerprintNotice, storageMode } = state.data;
  const fingerprintShort = `${asset.fingerprintValue.slice(0, 12)}...${asset.fingerprintValue.slice(-8)}`;

  async function copyFingerprint() {
    try {
      await navigator.clipboard.writeText(asset.fingerprintValue);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <RoleBanner role="Creator asset" nextAction="Copy the buyer request link" />
      <div className="rr-asset-detail-grid">
        <PreviewImage
          alt={`${asset.title} controlled demonstration preview`}
          reference={asset.previewReference}
        />
        <section aria-labelledby="asset-title" className="rr-asset-record">
          <p className="rr-eyebrow">{asset.assetType}</p>
          <h1 id="asset-title">{asset.title}</h1>
          <p>{asset.provenanceNote}</p>
          <dl className="rr-record-list">
            <div>
              <dt>Creator</dt>
              <dd>{asset.creatorDisplayName}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{availabilityLabel(asset.availability)}</dd>
            </div>
            <div>
              <dt>Fingerprint</dt>
              <dd>
                <code>{fingerprintShort}</code>{" "}
                <button className="rr-text-button" onClick={copyFingerprint} type="button">
                  {copied ? "Copied" : "Copy full value"}
                </button>
              </dd>
            </div>
            <div>
              <dt>Related cases</dt>
              <dd>{relatedCaseCount}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{storageMode === "d1" ? "D1 database" : "Local memory fallback"}</dd>
            </div>
          </dl>
          <ScaffoldNotice>{fingerprintNotice}</ScaffoldNotice>
          <div className="rr-actions">
            <NavLink className="rr-button rr-button-primary" to="/buyer/demo">
              Open buyer request link
            </NavLink>
            <NavLink className="rr-button rr-button-secondary" to="/creator">
              Back to workspace
            </NavLink>
          </div>
        </section>
      </div>
    </>
  );
}

type FormState = AssetRegistrationInputDto;

const initialForm: FormState = {
  title: "",
  assetType: "illustration",
  creatorDisplayName: "Maya Chen",
  provenanceNote: "Project-owned demonstration artwork created for RightsReceipt.",
  previewKey: "studio-lines",
};

export function CreatorAssetRegistrationPage() {
  const navigate = useNavigate();
  const errorSummaryId = useId();
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const { state } = useWorkspace();
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const compatiblePreviews = useMemo(() => {
    if (state.status !== "loaded") return [];
    return state.data.previewOptions.filter(
      (option) => option.compatibleAssetType === form.assetType,
    );
  }, [form.assetType, state]);

  useEffect(() => {
    const firstPreview = compatiblePreviews[0];
    if (
      firstPreview
      && !compatiblePreviews.some((option) => option.key === form.previewKey)
    ) {
      setForm((value) => ({ ...value, previewKey: firstPreview.key }));
    }
  }, [compatiblePreviews, form.previewKey]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    try {
      const response = await registerCreatorAsset(form);
      navigate(`/creator/assets/${response.asset.assetId}`);
    } catch (error) {
      if (error instanceof CreatorApiError) {
        setErrors(error.issues?.map((issue) => issue.message) ?? [error.message]);
      } else {
        setErrors([error instanceof Error ? error.message : "Asset registration failed."]);
      }
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return <LoadingState message="Loading controlled preview options." />;
  }
  if (state.status === "error") {
    return <ErrorState error={state.error} retry={() => window.location.reload()} />;
  }

  return (
    <>
      <RoleBanner role="Creator asset registration" nextAction="Review and register metadata" />
      <section className="rr-form-shell" aria-labelledby="register-title">
        <div>
          <p className="rr-eyebrow">Metadata only</p>
          <h1 id="register-title">Register a visual asset</h1>
          <p className="rr-lede">
            P0 accepts controlled metadata for a photograph or illustration. File upload and ownership verification are outside scope.
          </p>
        </div>

        {errors.length > 0 ? (
          <div
            aria-labelledby={`${errorSummaryId}-title`}
            className="rr-error-panel"
            id={errorSummaryId}
            ref={errorSummaryRef}
            role="alert"
            tabIndex={-1}
          >
            <strong id={`${errorSummaryId}-title`}>Review the following items</strong>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <form className="rr-form" onSubmit={submit}>
          <label>
            <span>Title</span>
            <input
              maxLength={200}
              onChange={(event) => update("title", event.target.value)}
              required
              value={form.title}
            />
          </label>

          <label>
            <span>Asset type</span>
            <select
              onChange={(event) =>
                update("assetType", event.target.value as FormState["assetType"])
              }
              value={form.assetType}
            >
              <option value="photograph">Photograph</option>
              <option value="illustration">Illustration</option>
            </select>
          </label>

          <label>
            <span>Creator display name</span>
            <input
              maxLength={120}
              onChange={(event) => update("creatorDisplayName", event.target.value)}
              required
              value={form.creatorDisplayName}
            />
          </label>

          <label>
            <span>Controlled preview</span>
            <select
              onChange={(event) =>
                update("previewKey", event.target.value as FormState["previewKey"])
              }
              value={form.previewKey}
            >
              {compatiblePreviews.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="rr-form-wide">
            <span>Provenance note</span>
            <textarea
              maxLength={2000}
              onChange={(event) => update("provenanceNote", event.target.value)}
              required
              rows={5}
              value={form.provenanceNote}
            />
            <small>{form.provenanceNote.length} of 2,000 characters</small>
          </label>

          <div className="rr-preview-choice rr-form-wide">
            <p className="rr-field-label">Preview</p>
            {compatiblePreviews
              .filter((option) => option.key === form.previewKey)
              .map((option) => (
                <PreviewImage
                  alt={option.altText}
                  key={option.key}
                  reference={option.previewReference}
                />
              ))}
          </div>

          <div className="rr-actions rr-form-wide">
            <button className="rr-button rr-button-primary" disabled={submitting} type="submit">
              {submitting ? "Registering metadata" : "Register asset metadata"}
            </button>
            <NavLink className="rr-button rr-button-secondary" to="/creator">
              Cancel
            </NavLink>
          </div>
        </form>
      </section>
    </>
  );
}
