import type { CreatorExtractionResponse } from "@rightsreceipt/contracts";
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { loadCreatorExtraction, runCreatorExtraction } from "./api";
import "./extraction.css";

export function CreatorExtractionPage() {
  const { caseId = "" } = useParams();
  const [state, setState] = useState<CreatorExtractionResponse | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let live = true;
    loadCreatorExtraction(caseId).then(data => { if(live) setState(data); })
      .catch((err: unknown) => {if(live) setError(err instanceof Error ? err.message : "Request failed");});
    return () => { live = false; };
  }, [caseId]);
  async function extract() {
    if(!state || working) return;
    setWorking(true);setError("");
    try { setState(await runCreatorExtraction(caseId,state.caseRowVersion)); }
    catch(err) {setError(err instanceof Error ? err.message : "Extraction failed");}
    finally { setWorking(false); }
  }
  return (
    <main className="rr-extraction-shell">
      <h1>Review-only source extraction</h1>
      <p>These suggestions are not permissions, payments, or accepted terms.</p>
      {error ? <p role="alert">{error}</p> : null}
      {!state && !error ? <p role="status">Loading original buyer request</p> : null}
      {state ? (
        <>
          <section className="rr-extraction-source">
            <h2>Original buyer evidence</h2>
            <blockquote>{state.originalText}</blockquote>
          </section>
          {state.status==="not_started" && state.termsVersionNumber===null
            ? <button type="button" disabled={working} onClick={extract}>{working?"Extracting":"Extract suggestions"}</button>
            : null}
          {state.deterministic ? (
            <div className="rr-extraction-grid">
              {state.deterministic.fields.map(field => (
                <section className="rr-extraction-field" key={field.fieldName}>
                  <h2>{field.fieldName.replaceAll("_"," ")}</h2>
                  <p>{field.resolutionState}. Proposed value: {JSON.stringify(field.normalizedValue)}</p>
                  {field.reasonNote ? <p>{field.reasonNote}</p> : null}
                  <ol>{field.evidenceSpans.map(span=>(
                    <li key={span.startUtf16}>{span.text} (UTF-16 {span.startUtf16} to {span.endUtf16})</li>
                  ))}</ol>
                  {field.evidenceSpans.length===0 ? <p>Not stated with sufficient evidence</p> : null}
                </section>
              ))}
            </div>
          ) : null}
          {state.learned ? (
            <section className="rr-extraction-panel">
              <h2>Unverified model suggestions</h2>
              <p>Model {state.learned.modelVersion}. Raw margins are not calibrated confidence; no model value may resolve a right.</p>
              <ul>{state.learned.assessment.fields.map(field=>(
                <li key={field.fieldName}>{field.fieldName}: {field.gate}; {field.candidateLabel ? JSON.stringify(field.candidateLabel.normalizedValue) : "abstained"}</li>
              ))}</ul>
            </section>
          ) : <p>Learned-model diagnostics unavailable or not run.</p>}
          <NavLink to={"/creator/cases/"+caseId}>Open human rights review</NavLink>
          <NavLink to={"/creator/cases/"+caseId+"/clarification"}>Review clarification questions</NavLink>
        </>
      ) : null}
    </main>
  );
}
