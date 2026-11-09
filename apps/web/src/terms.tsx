import type {
  CreatorCaseListResponse,
  ManualTermsReviewSaveRequest,
  RightsFieldNameDto,
  RightsFieldReviewViewDto,
  TermsReviewResponse,
} from "@rightsreceipt/contracts";
import { RoleBanner, ScaffoldNotice, SurfaceCard } from "@rightsreceipt/ui";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavLink, useParams } from "react-router-dom";
import { CreatorWorkspacePage } from "./creator";
import {
  RightsReceiptApiError,
  loadCreatorCases,
  loadTermsReview,
  saveManualTermsReview,
} from "./api";
import "./terms.css";
import { beginExplicitResolution, fieldsAwaitingExplicitChoice } from "./review-draft";

const FIELD_ORDER: readonly RightsFieldNameDto[] = [
  "use_purpose",
  "channels",
  "paid_advertising",
  "territories",
  "start_date",
  "duration_days",
  "max_impressions",
  "exclusivity",
  "modification_scope",
  "attribution",
  "sublicensing",
  "ai_use",
];

interface DraftEdit {
  state: "resolved" | "unresolved" | "unsupported" | "contradictory";
  value?: unknown;
  note?: string;
}

type DraftFields = Record<RightsFieldNameDto, DraftEdit>;

function draftFromReview(review: TermsReviewResponse): DraftFields {
  return Object.fromEntries(
    review.fields.map((field) => {
      if (field.resolutionState === "resolved") {
        return [
          field.fieldName,
          { state: "resolved", value: field.value },
        ];
      }
      if (
        field.resolutionState === "unsupported"
        || field.resolutionState === "contradictory"
      ) {
        return [
          field.fieldName,
          { state: field.resolutionState, note: field.note ?? "" },
        ];
      }
      return [field.fieldName, { state: "unresolved" }];
    }),
  ) as DraftFields;
}

function submissionFields(draft: DraftFields): ManualTermsReviewSaveRequest["fields"] {
  return Object.fromEntries(
    FIELD_ORDER.map((field) => {
      const edit = draft[field];
      if (edit.state === "resolved") {
        return [field, { state: "resolved", value: edit.value }];
      }
      if (edit.state === "unsupported" || edit.state === "contradictory") {
        return [field, { state: edit.state, note: edit.note ?? "" }];
      }
      return [field, { state: "unresolved" }];
    }),
  ) as ManualTermsReviewSaveRequest["fields"];
}

function stageLabel(stage: CreatorCaseListResponse["cases"][number]["stage"]) {
  switch (stage) {
    case "review_not_started":
      return "Review not started";
    case "needs_resolution":
      return "Needs resolution";
    case "unsupported":
      return "Unsupported terms recorded";
    case "contradictory":
      return "Contradiction recorded";
    case "ready_for_pricing":
      return "Ready for deterministic pricing";
  }
}

function CaseQueue({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; data: CreatorCaseListResponse }
    | { status: "error"; error: Error }
  >({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    // Retry resets any previously shown case queue response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    loadCreatorCases()
      .then((data) => {
        if (active) setState({ status: "loaded", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error("Case list request failed."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.status === "loading") {
    return <div className="rr-status-panel" role="status">Loading submitted requests.</div>;
  }
  if (state.status === "error") {
    return (
      <div className="rr-error-panel" role="alert">
        <strong>Request queue unavailable</strong>
        <span>{state.error.message}</span>
        <button
          className="rr-button rr-button-secondary"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.data.cases.length === 0) {
    return (
      <SurfaceCard eyebrow="Request queue" title="No submitted requests">
        <p>Create a buyer request link from an asset, then submit the buyer form.</p>
      </SurfaceCard>
    );
  }

  return (
    <div className={compact ? "rr-case-grid rr-case-grid-compact" : "rr-case-grid"}>
      {state.data.cases.map((item) => (
        <article className="rr-case-card" key={item.caseId}>
          <img
            alt={`${item.assetTitle} controlled preview`}
            loading="lazy"
            src={item.assetPreviewReference}
          />
          <div>
            <p className="rr-eyebrow">{stageLabel(item.stage)}</p>
            <h3>{item.assetTitle}</h3>
            <p>
              Requested by <strong>{item.buyerOrganization}</strong>
            </p>
            <p className="rr-case-meta">
              Terms version {item.termsVersionNumber ?? "not created"}
            </p>
            <NavLink
              className="rr-button rr-button-primary"
              to={`/creator/cases/${item.caseId}`}
            >
              Review rights terms
            </NavLink>
          </div>
        </article>
      ))}
    </div>
  );
}

export function CreatorDashboardPage() {
  return (
    <>
      <CreatorWorkspacePage />
      <section className="rr-case-queue" aria-labelledby="case-queue-title">
        <div className="rr-section-heading">
          <div>
            <p className="rr-eyebrow">Request queue</p>
            <h2 id="case-queue-title">Submitted licensing requests</h2>
          </div>
          <NavLink className="rr-button rr-button-secondary" to="/creator/cases">
            Open full queue
          </NavLink>
        </div>
        <CaseQueue compact />
      </section>
    </>
  );
}

export function CreatorCaseListPage() {
  return (
    <>
      <RoleBanner role="Creator request queue" nextAction="Open a request and review all twelve fields" />
      <section aria-labelledby="creator-cases-title">
        <p className="rr-eyebrow">Structured review</p>
        <h1 id="creator-cases-title">Licensing requests</h1>
        <p className="rr-lede">
          Every submitted request remains evidence. Manual review creates a new immutable terms version without invoking AI.
        </p>
        <CaseQueue />
      </section>
    </>
  );
}

function stateLabel(state: DraftEdit["state"]) {
  switch (state) {
    case "resolved":
      return "Supported value";
    case "unresolved":
      return "Unresolved";
    case "unsupported":
      return "Unsupported";
    case "contradictory":
      return "Contradictory";
  }
}

function selectOptions(field: RightsFieldNameDto) {
  switch (field) {
    case "use_purpose":
      return [["commercial", "Commercial use"]] as const;
    case "paid_advertising":
      return [["true", "Yes, paid advertising"]] as const;
    case "exclusivity":
      return [["non_exclusive", "Non-exclusive"]] as const;
    case "modification_scope":
      return [
        ["none", "No modification"],
        ["crop_only", "Crop only"],
      ] as const;
    case "attribution":
      return [
        ["required", "Attribution required"],
        ["not_required", "Attribution not required"],
      ] as const;
    case "sublicensing":
      return [["prohibited", "Sublicensing prohibited"]] as const;
    case "ai_use":
      return [["prohibited", "AI training and evaluation prohibited"]] as const;
    default:
      return null;
  }
}

function scalarValue(field: RightsFieldNameDto, value: string) {
  if (field === "paid_advertising") return value === "true";
  if (field === "duration_days" || field === "max_impressions") {
    return Number(value);
  }
  return value;
}

function FieldEditor({
  field,
  persisted,
  draft,
  update,
}: {
  field: RightsFieldNameDto;
  persisted: RightsFieldReviewViewDto;
  draft: DraftEdit;
  update: (edit: DraftEdit) => void;
}) {
  const options = selectOptions(field);
  const selectedArray = Array.isArray(draft.value)
    ? draft.value.filter((item): item is string => typeof item === "string")
    : [];

  function setState(state: DraftEdit["state"]) {
    if (state === "resolved") {
      update(beginExplicitResolution());
    } else if (state === "unsupported" || state === "contradictory") {
      update({ state, note: "" });
    } else {
      update({ state: "unresolved" });
    }
  }

  function toggleArray(value: string) {
    const next = selectedArray.includes(value)
      ? selectedArray.filter((item) => item !== value)
      : [...selectedArray, value];
    update({ state: "resolved", value: next });
  }

  return (
    <fieldset className="rr-term-field">
      <legend>{persisted.label}</legend>
      <label>
        <span>Review state</span>
        <select
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setState(event.target.value as DraftEdit["state"])}
          value={draft.state}
        >
          {(["unresolved", "resolved", "unsupported", "contradictory"] as const).map(
            (state) => (
              <option key={state} value={state}>
                {stateLabel(state)}
              </option>
            ),
          )}
        </select>
      </label>

      {draft.state === "resolved" && options ? (
        <label>
          <span>Supported value</span>
          <select
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              update({ state: "resolved", value: scalarValue(field, event.target.value) })}
            value={draft.value === null || draft.value === undefined ? "" : String(draft.value)}
          >
            <option value="" disabled>Choose and confirm</option>
            {options.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {draft.state === "resolved" && field === "channels" ? (
        <div className="rr-checkbox-group">
          <span>Supported channels</span>
          {([
            ["instagram_paid", "Paid Instagram"],
            ["facebook_paid", "Paid Facebook"],
          ] as const).map(([value, label]) => (
            <label key={value}>
              <input
                checked={selectedArray.includes(value)}
                onChange={() => toggleArray(value)}
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {draft.state === "resolved" && field === "territories" ? (
        <div className="rr-checkbox-group">
          <span>Supported territories</span>
          {([
            ["US", "United States"],
            ["CA", "Canada"],
          ] as const).map(([value, label]) => (
            <label key={value}>
              <input
                checked={selectedArray.includes(value)}
                onChange={() => toggleArray(value)}
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {draft.state === "resolved" && field === "start_date" ? (
        <label>
          <span>Start date, evaluated in UTC</span>
          <input
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              update({ state: "resolved", value: event.target.value })}
            type="date"
            value={String(draft.value ?? "")}
          />
        </label>
      ) : null}

      {draft.state === "resolved"
      && (field === "duration_days" || field === "max_impressions") ? (
        <label>
          <span>{field === "duration_days" ? "Days, 1 through 365" : "Impressions, 1 through 500,000"}</span>
          <input
            max={field === "duration_days" ? 365 : 500000}
            min={1}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              update({ state: "resolved", value: event.target.value === "" ? null : Number(event.target.value) })}
            type="number"
            value={draft.value === null || draft.value === undefined ? "" : String(draft.value)}
          />
        </label>
      ) : null}

      {draft.state === "unsupported" || draft.state === "contradictory" ? (
        <label>
          <span>Plain-language explanation</span>
          <textarea
            maxLength={500}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              update({ ...draft, note: event.target.value })}
            required
            rows={3}
            value={draft.note ?? ""}
          />
        </label>
      ) : null}

      <div className="rr-term-evidence">
        <p>
          <strong>Provenance:</strong>{" "}
          {persisted.provenance === "human"
            ? "Human correction"
            : persisted.provenance === "not_set"
              ? "Not set"
              : persisted.provenance}
        </p>
        <p>
          <strong>Evidence:</strong>{" "}
          {persisted.evidenceText
            ?? "No explicit source excerpt is attached to this field. Inspect extraction suggestions separately."}
        </p>
        <p>
          <strong>Reliability:</strong>{" "}
          {persisted.confidenceBasisPoints === null
            ? "No calibrated confidence is available. Check original buyer evidence."
            : `${persisted.confidenceBasisPoints / 100}%`}
        </p>
      </div>
    </fieldset>
  );
}

export function CreatorTermsReviewPage() {
  const { caseId = "" } = useParams();
  const errorSummaryId = useId();
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; data: TermsReviewResponse; draft: DraftFields }
    | { status: "error"; error: Error }
  >({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    loadTermsReview(caseId)
      .then((data) => {
        if (active) setState({ status: "loaded", data, draft: draftFromReview(data) });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error("Terms review request failed."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attempt, caseId]);

  const persistedByName = useMemo(() => {
    if (state.status !== "loaded") return new Map<RightsFieldNameDto, RightsFieldReviewViewDto>();
    return new Map(state.data.fields.map((field) => [field.fieldName, field]));
  }, [state]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "loaded") return;
    const missingChoices = fieldsAwaitingExplicitChoice(state.draft);
    if (missingChoices.length > 0) {
      setErrors(missingChoices.map((field) => `Choose and confirm ${field.replaceAll("_", " ")} before saving.`));
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const data = await saveManualTermsReview(caseId, {
        expectedCaseRowVersion: state.data.caseRowVersion,
        fields: submissionFields(state.draft),
      });
      setState({ status: "loaded", data, draft: draftFromReview(data) });
    } catch (error) {
      if (error instanceof RightsReceiptApiError) {
        setErrors(error.issues?.map((issue) => issue.message) ?? [error.message]);
      } else {
        setErrors([error instanceof Error ? error.message : "Terms review could not be saved."]);
      }
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  if (state.status === "loading") {
    return <div className="rr-status-panel" role="status">Loading structured rights review.</div>;
  }
  if (state.status === "error") {
    return (
      <div className="rr-error-panel" role="alert">
        <strong>Terms review unavailable</strong>
        <span>{state.error.message}</span>
        <button
          className="rr-button rr-button-secondary"
          onClick={() => setAttempt((value) => value + 1)}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  const { data, draft } = state;
  return (
    <>
      <RoleBanner role="Creator terms review" nextAction="Resolve or classify all twelve material fields" />
      <section className="rr-terms-header" aria-labelledby="terms-review-title">
        <div>
          <p className="rr-eyebrow">Creator review and human correction</p>
          <h1 id="terms-review-title">{data.asset.title}</h1>
          <p className="rr-lede">
            Review the buyer evidence and create an immutable human-entered terms version. This screen does not price, approve, invoice, or activate permission.
          </p>
        </div>
        <dl className="rr-summary-list">
          <div>
            <dt>Buyer</dt>
            <dd>{data.buyer.organization}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{data.currentTermsVersion ?? "Not created"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{data.resolutionStatus.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{data.storageMode === "d1" ? "D1 database" : "Local memory fallback"}</dd>
          </div>
        </dl>
      </section>

      <div className="rr-terms-layout">
        <aside className="rr-request-evidence" aria-labelledby="request-evidence-title">
          <p className="rr-eyebrow">Original buyer evidence</p>
          <h2 id="request-evidence-title">Intended use</h2>
          <blockquote>{data.request.originalText}</blockquote>
          <p>
            Submitted by {data.buyer.name} for {data.buyer.organization}. The original text is immutable and is not treated as executable instruction.
          </p>
        </aside>

        <form className="rr-terms-form" onSubmit={save}>
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

          <div className="rr-term-grid">
            {FIELD_ORDER.map((field) => {
              const persisted = persistedByName.get(field);
              if (!persisted) return null;
              return (
                <FieldEditor
                  draft={draft[field]}
                  field={field}
                  key={field}
                  persisted={persisted}
                  update={(edit) =>
                    setState((current) =>
                      current.status === "loaded"
                        ? {
                            ...current,
                            draft: { ...current.draft, [field]: edit },
                          }
                        : current)}
                />
              );
            })}
          </div>

          <section
            className={`rr-quote-readiness rr-quote-readiness-${data.quoteReadiness.status}`}
            aria-labelledby="quote-readiness-title"
          >
            <p className="rr-eyebrow">Quote gate</p>
            <h2 id="quote-readiness-title">
              {data.quoteReadiness.status === "ready_for_pricing"
                ? "Ready for deterministic pricing"
                : "Automatic quote blocked"}
            </h2>
            <ul>
              {data.quoteReadiness.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {data.quoteReadiness.status === "ready_for_pricing" ? (
              <NavLink className="rr-button rr-button-secondary" to={`/creator/cases/${caseId}/quote`}>
                Open quote for saved terms version
              </NavLink>
            ) : null}
          </section>

          <div className="rr-actions">
            <NavLink className="rr-button rr-button-secondary" to={`/creator/cases/${caseId}/extraction`}>
              Inspect source-grounded extraction
            </NavLink>
            <NavLink className="rr-button rr-button-secondary" to={`/creator/cases/${caseId}/clarification`}>
              Review clarification questions
            </NavLink>
          </div>
          <ScaffoldNotice>
            Saving creates a new immutable terms version with human provenance. It does not approve rights or create a quote.
          </ScaffoldNotice>
          <div className="rr-actions">
            <button className="rr-button rr-button-primary" disabled={saving} type="submit">
              {saving ? "Saving manual review" : "Save manual terms version"}
            </button>
            <NavLink className="rr-button rr-button-secondary" to="/creator/cases">
              Back to request queue
            </NavLink>
          </div>
        </form>
      </div>
    </>
  );
}
