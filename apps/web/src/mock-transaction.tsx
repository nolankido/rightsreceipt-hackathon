import type { MockTransactionViewDto, MockVerificationViewDto } from "@rightsreceipt/contracts";
import { RoleBanner, SurfaceCard } from "@rightsreceipt/ui";
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  acceptMockQuote, decideMockQuote, loadBuyerMock, loadCreatorMock,
  loadMockVerification, simulateMockPayment,
} from "./api";
import "./mock-transaction.css";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const FINAL = new Set(["simulated_scheduled", "simulated_active", "simulated_expired"]);

function MockWarning() {
  return (
    <div className="rr-mock-warning" role="note">
      <strong>SIMULATED DEMONSTRATION ONLY</strong>
      <span>No PayPal transaction will occur. No real license or payment evidence is issued.</span>
    </div>
  );
}

function MockQuoteSummary({ view }: { view: MockTransactionViewDto }) {
  if (!view.quote || !view.licensePeriod) {
    return <p>Complete the creator rights review and generate a deterministic quote first.</p>;
  }
  return (
    <div className="rr-mock-summary">
      <img alt={`${view.asset.title} controlled demo preview`} src={view.asset.previewReference} />
      <dl>
        <div><dt>Asset</dt><dd>{view.asset.title}</dd></div>
        <div><dt>Buyer organization</dt><dd>{view.buyerOrganization}</dd></div>
        <div><dt>Exact quote</dt><dd>{money(view.quote.record.amountCents)} USD</dd></div>
        <div><dt>Terms and quote</dt><dd>Terms {view.quote.record.termsVersionId.slice(0, 8)}, quote v{view.quote.record.quoteVersionNumber}</dd></div>
        <div><dt>Start</dt><dd>{view.licensePeriod.startDate}</dd></div>
        <div><dt>End exclusive</dt><dd>{view.licensePeriod.endDateExclusive}</dd></div>
      </dl>
      <table>
        <caption>Exact deterministic USD price components</caption>
        <thead><tr><th scope="col">License component</th><th scope="col">Price</th></tr></thead>
        <tbody>{view.quote.lines.map((line) => (
          <tr key={line.quoteLineId}><td>{line.description}</td><td>{money(line.amountCents)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function useMockLoader(source: "creator" | "buyer", key: string) {
  const [data, setData] = useState<MockTransactionViewDto | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    let active = true;
    // Retry and source changes reset the transaction loading indicator.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setData(null);
    setError("");
    (source === "creator" ? loadCreatorMock(key) : loadBuyerMock(key))
      .then((view) => { if (active) { setData(view); setError(""); } })
      .catch((failure: unknown) => {
        if (active) {
          setData(null);
          setError(failure instanceof Error ? failure.message : "Transaction unavailable.");
        }
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key, source, refreshCount]);
  return {data, setData, error, setError, loading, refresh: () => setRefreshCount((v) => v + 1)};
}

export function MockCreatorPage() {
  const { caseId = "" } = useParams();
  const state = useMockLoader("creator", caseId);
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState("");

  async function decision(value: "approved" | "rejected" | "clarification_requested") {
    const view = state.data;
    if (!view?.quote || working) return;
    state.setError(""); setWorking(true);
    try {
      state.setData(await decideMockQuote(caseId, {
        decision: value, quoteId: view.quote.record.quoteId,
        termsVersionId: view.quote.record.termsVersionId,
        expectedCaseRowVersion: view.caseRowVersion,
        expectedMockRevision: view.mockRevision,
        ...(value !== "approved" ? { reason } : {}),
      }));
    } catch (failure) { state.setError(failure instanceof Error ? failure.message : "Decision not saved."); }
    finally { setWorking(false); }
  }

  async function fakePayment() {
    const view = state.data;
    if (!view?.quote || working) return;
    setWorking(true);state.setError("");
    try {
      state.setData(await simulateMockPayment(caseId, {
        expectedMockRevision: view.mockRevision, quoteId: view.quote.record.quoteId,
      }));
    } catch (failure) { state.setError(failure instanceof Error ? failure.message : "Simulation failed."); }
    finally { setWorking(false); }
  }

  return (
    <>
      <RoleBanner role="Creator simulation" nextAction="Approve exact terms, then obtain buyer acceptance" />
      <div className="rr-mock-page">
        <h1>Creator decision and simulated payment</h1>
        <MockWarning />
        {state.loading ? <p role="status">Loading current transaction.</p> : null}
        {state.error ? <p className="rr-mock-error" role="alert">{state.error} <button type="button" onClick={state.refresh}>Reload</button></p> : null}
        {state.data ? (
          <>
            <p className="rr-mock-stage" role="status">Current stage: {state.data.stage.replaceAll("_", " ")}</p>
            <SurfaceCard title="Current terms and quote" eyebrow="Human authority">
              <MockQuoteSummary view={state.data} />
            </SurfaceCard>
            {state.data.stage === "awaiting_creator" ? (
              <section className="rr-mock-actions" aria-label="Creator decision">
                <h2>Creator decision</h2>
                <p>A quote is not permission. Choose an action for this exact saved version.</p>
                <button disabled={working} type="button" className="rr-button rr-button-primary" onClick={() => decision("approved")}>Approve this quote</button>
                <label>Reason for clarification or rejection
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
                </label>
                <button disabled={working || !reason.trim()} type="button" className="rr-button rr-button-secondary" onClick={() => decision("clarification_requested")}>Request clarification</button>
                <button disabled={working || !reason.trim()} type="button" className="rr-button rr-button-secondary" onClick={() => decision("rejected")}>Reject request</button>
              </section>
            ) : null}
            {state.data.stage === "awaiting_buyer" ? (
              <SurfaceCard title="Waiting for buyer acceptance" eyebrow="Consent pending">
                <p>Return to the buyer's existing request link to review and accept the same quote version. Approval alone does not create a payment.</p>
              </SurfaceCard>
            ) : null}
            {state.data.stage === "awaiting_simulated_payment" ? (
              <SurfaceCard title="Simulate payment evidence" eyebrow="Fake adapter, not PayPal">
                <p>Both people accepted this exact version. The next action creates fake test evidence and a clearly simulated receipt.</p>
                <button className="rr-button rr-button-primary" type="button" disabled={working} onClick={fakePayment}>Simulate payment, no real money</button>
              </SurfaceCard>
            ) : null}
            {state.data.publicReceiptId && FINAL.has(state.data.stage) ? (
              <SurfaceCard title="Simulated receipt generated" eyebrow="Not a valid paid license">
                <p>Fake payment reference: {state.data.payment?.reference}</p>
                <NavLink className="rr-button rr-button-primary" to={`/verify/simulated/${state.data.publicReceiptId}`}>Verify simulated receipt</NavLink>
              </SurfaceCard>
            ) : null}
            <div className="rr-actions"><NavLink className="rr-button rr-button-secondary" to={`/creator/cases/${caseId}/quote`}>Return to quote</NavLink></div>
          </>
        ) : null}
      </div>
    </>
  );
}

export function MockBuyerPage() {
  const { capability = "" } = useParams();
  const state = useMockLoader("buyer", capability);
  const [agreed, setAgreed] = useState(false);
  const [working, setWorking] = useState(false);
  async function accept() {
    if (!state.data?.quote || !agreed || working) return;
    setWorking(true);state.setError("");
    try {
      state.setData(await acceptMockQuote(capability, {
        expectedMockRevision: state.data.mockRevision,
        quoteId: state.data.quote.record.quoteId,
        termsVersionId: state.data.quote.record.termsVersionId,
        accepted: true,
      }));
    } catch (failure) { state.setError(failure instanceof Error ? failure.message : "Acceptance not saved."); }
    finally { setWorking(false); }
  }
  return (
    <>
      <RoleBanner role="Buyer simulation" nextAction="Accept only the exact creator-approved quote" />
      <div className="rr-mock-page">
        <h1>Review and accept simulated license terms</h1>
        <MockWarning />
        {state.loading ? <p role="status">Checking your request link.</p> : null}
        {state.error ? <p role="alert" className="rr-mock-error">{state.error} <button onClick={state.refresh} type="button">Retry</button></p> : null}
        {state.data ? (
          <>
            <p className="rr-mock-stage" role="status">Status: {state.data.stage.replaceAll("_", " ")}</p>
            <SurfaceCard title="Creator-approved scope" eyebrow="Buyer consent">
              <MockQuoteSummary view={state.data} />
              {state.data.stage === "awaiting_buyer" ? (
                <div className="rr-mock-actions">
                  <label className="rr-mock-checkbox"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I accept this exact terms version and price for the simulation.</label>
                  <button type="button" className="rr-button rr-button-primary" disabled={!agreed || working} onClick={accept}>Accept quoted terms</button>
                </div>
              ) : null}
              {state.data.stage === "awaiting_simulated_payment" ? <p>Acceptance saved. The creator can now run the fake payment step.</p> : null}
              {state.data.publicReceiptId ? <NavLink className="rr-button rr-button-secondary" to={`/verify/simulated/${state.data.publicReceiptId}`}>View simulated receipt</NavLink> : null}
            </SurfaceCard>
            <p>Your acceptance is recorded only for the exact quoted terms. Creator actions remain on a separate protected surface.</p>
          </>
        ) : null}
      </div>
    </>
  );
}

export function MockVerifyPage() {
  const { publicId = "" } = useParams();
  const [data, setData] = useState<MockVerificationViewDto | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    // A new verification ID invalidates the previous receipt data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError("");
    loadMockVerification(publicId).then((result) => { if (active) setData(result); })
      .catch((failure: unknown) => { if (active) { setData(null); setError(failure instanceof Error ? failure.message : "Receipt unavailable."); } });
    return () => { active = false; };
  }, [publicId]);
  return (
    <>
      <RoleBanner role="Public simulation verifier" nextAction="Review the integrity result" />
      <div className="rr-mock-page">
        <h1>Simulated receipt verification</h1>
        <MockWarning />
        {error ? <p role="alert" className="rr-mock-error">{error}</p> : null}
        {!data && !error ? <p role="status">Checking the simulated record.</p> : null}
        {data ? (
          <SurfaceCard title={data.verified ? "Simulated record hash matches" : "Integrity check failed"} eyebrow="No PayPal evidence">
            <p>Status: {data.currentPermissionStatus.replaceAll("_", " ")}</p>
            <p className="rr-mock-hash">SHA-256: <code>{data.hash}</code></p>
            {data.verified && data.payload ? (
              <dl className="rr-mock-verification">
                <div><dt>Asset</dt><dd>{String(data.payload.asset_title)}</dd></div>
                <div><dt>Simulated amount</dt><dd>{money(Number(data.payload.amount_cents))}</dd></div>
                <div><dt>Provider</dt><dd>Fake adapter, not PayPal</dd></div>
                <div><dt>Start date</dt><dd>{String(data.payload.license_start_date)}</dd></div>
                <div><dt>End exclusive</dt><dd>{String(data.payload.license_end_date_exclusive)}</dd></div>
              </dl>
            ) : null}
            <p>{data.disclaimer}</p>
          </SurfaceCard>
        ) : null}
      </div>
    </>
  );
}
