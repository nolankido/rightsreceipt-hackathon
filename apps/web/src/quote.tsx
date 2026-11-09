import type { QuoteViewResponse } from "@rightsreceipt/contracts";
import { RoleBanner, ScaffoldNotice, SurfaceCard } from "@rightsreceipt/ui";
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { generateCreatorQuote, loadCreatorQuote } from "./api";
import "./quote.css";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function CreatorQuotePage() {
  const { caseId = "" } = useParams();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [quote, setQuote] = useState<QuoteViewResponse | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadCreatorQuote(caseId).then((value) => {
      if (!active) return;
      setQuote(value);
      setStatus("ready");
    }).catch((caught: unknown) => {
      if (!active) return;
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Quote information is unavailable.");
    });
    return () => { active = false; };
  }, [caseId, refresh]);

  async function createQuote() {
    if (!quote || working) return;
    setWorking(true);
    setError("");
    try {
      const result = await generateCreatorQuote(caseId, quote.caseRowVersion);
      setQuote(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quote creation failed. Reload the case.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <RoleBanner role="Creator deterministic quote" nextAction="Verify the stored rights version and pricing policy" />
      <section className="rr-quote-page" aria-labelledby="quote-title">
        <p className="rr-eyebrow">Creator policy engine</p>
        <h1 id="quote-title">Deterministic license quote</h1>
        <p className="rr-lede">Only saved, complete, supported terms can be quoted. The local AI does not determine prices.</p>

        {status === "loading" ? <p role="status">Loading the current saved terms and quote.</p> : null}
        {status === "error" ? (
          <div className="rr-error-panel" role="alert">
            <strong>Quote unavailable</strong>
            <p>{error}</p>
            <button className="rr-button rr-button-secondary" type="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button>
          </div>
        ) : null}

        {status === "ready" && quote ? (
          <>
            <div className="rr-quote-meta">
              <dl>
                <div><dt>Terms version</dt><dd>{quote.termsVersionNumber ?? "Not saved"}</dd></div>
                <div><dt>Policy</dt><dd>{quote.policy?.policyName ?? "Unavailable"}</dd></div>
                <div><dt>Policy version</dt><dd>{quote.policy?.versionNumber ?? "None"}</dd></div>
                <div><dt>Storage</dt><dd>{quote.storageMode === "d1" ? "D1 database" : "Local memory fallback"}</dd></div>
              </dl>
            </div>
            {quote.status === "quoted" && quote.quote && quote.licensePeriod ? (
              <SurfaceCard eyebrow="Quote recorded" title={money(quote.quote.record.amountCents)}>
                <p>Quote v{quote.quote.record.quoteVersionNumber} is bound to terms version {quote.termsVersionNumber} and policy version {quote.policy?.versionNumber}.</p>
                <table className="rr-quote-table">
                  <caption>Line items calculated entirely in integer cents</caption>
                  <thead><tr><th scope="col">Policy line</th><th scope="col">Amount</th></tr></thead>
                  <tbody>
                    {quote.quote.lines.map((line) => (
                      <tr key={line.quoteLineId}><td>{line.description}</td><td>{money(line.amountCents)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th scope="row">Total USD</th><td>{money(quote.quote.record.amountCents)}</td></tr></tfoot>
                </table>
                <dl className="rr-quote-dates">
                  <div><dt>Start</dt><dd>{quote.licensePeriod.startDate}</dd></div>
                  <div><dt>Last permitted day</dt><dd>{quote.licensePeriod.lastPermittedDate}</dd></div>
                  <div><dt>End exclusive</dt><dd>{quote.licensePeriod.endDateExclusive}</dd></div>
                </dl>
                <p className="rr-quote-hash">Calculation fingerprint: <code>{quote.quote.record.calculationHash}</code></p>
              </SurfaceCard>
            ) : (
              <SurfaceCard eyebrow="Quote gate" title={quote.status === "blocked" ? "Quoting blocked" : "Ready for pricing"}>
                <p role="status">{quote.reason}</p>
                {quote.status !== "blocked" ? (
                  <button className="rr-button rr-button-primary" disabled={working} type="button" onClick={createQuote}>
                    {working ? "Generating quote" : quote.status === "stale_quote" ? "Generate updated quote" : "Generate deterministic quote"}
                  </button>
                ) : null}
              </SurfaceCard>
            )}
            {error ? <p className="rr-quote-error" role="alert">{error}</p> : null}
            <ScaffoldNotice>The next step is an explicitly simulated creator decision. No PayPal transaction or real license is created in this local demo.</ScaffoldNotice>
            {quote.status === "quoted" ? <NavLink className="rr-button rr-button-primary" to={`/creator/cases/${caseId}/mock`}>Continue to creator simulation</NavLink> : null}
            <div className="rr-actions">
              <NavLink className="rr-button rr-button-secondary" to={`/creator/cases/${caseId}`}>Back to rights review</NavLink>
              <NavLink className="rr-button rr-button-secondary" to="/creator/cases">All requests</NavLink>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
