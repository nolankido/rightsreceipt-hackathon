/** Reproduce evaluation with pinned immutable dataset, artifact and validation-only thresholds. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadVerifiedPortableModel } from "../packages/ai-runtime/src/portable-model.ts";
import { CALIBRATION_FIELD_ORDER, verifySelectiveMarginPolicy, inspectLearnedRanking } from "../packages/ai-runtime/src/calibration.ts";
const raw = path => readFileSync(new URL("../"+path,import.meta.url));
const parsed = path => JSON.parse(raw(path).toString("utf8"));
const sha = b => createHash("sha256").update(b).digest("hex");
const same = (a,b) => a.resolutionState===b.resolutionState
  && JSON.stringify(a.normalizedValue)===JSON.stringify(b.normalizedValue);
export async function evaluateSplit(split) {
  if (split!=="validation" && split!=="test")throw Error("Select validation or held-out test");
  const manifest=parsed("data/synthetic/v1/manifest.json");
  const artifact=raw("data/model/v1/artifact.json");
  const p=verifySelectiveMarginPolicy(parsed("data/model/v1/validation-margin-gates.json"),
    sha(artifact),manifest.files["validation.jsonl"].sha256);
  const model=await loadVerifiedPortableModel(artifact.toString("utf8"),p.artifactSha256);
  const data=raw("data/synthetic/v1/"+split+".jsonl");
  if(sha(data)!==manifest.files[split+".jsonl"].sha256)throw Error("Dataset integrity mismatch");
  const rows=data.toString("utf8").trimEnd().split("\n").map(JSON.parse);
  if(rows.length!==manifest.files[split+".jsonl"].rows)throw Error("Record count mismatch");
  const result={schemaVersion:"rightsreceipt-selective-evaluation-v1",split,records:rows.length,
    fieldLabels:0,rawExact:0,rawWrongResolved:0,reviewCandidates:0,incorrectCandidates:0,
    correctCandidates:0,goldResolved:0,fieldMetrics:{},categories:{},errorExamples:[],
    deploymentApproved:false,calibratedProbability:false};
  for(const name of CALIBRATION_FIELD_ORDER)result.fieldMetrics[name]=
    {rawExact:0,rawWrongResolved:0,reviewCandidates:0,incorrectCandidates:0};
  for(const row of rows){
    if(row.split!==split||sha(row.inputText)!==row.inputSha256)throw Error("Input provenance mismatch");
    const ranking=model.predict(row.inputText),screen=inspectLearnedRanking(ranking,p);
    const cat=result.categories[row.category]??=
      {records:0,rawExact:0,rawWrongResolved:0,reviewCandidates:0,incorrectCandidates:0};
    cat.records++;
    if(row.fieldLabels.length!==12)throw Error("Incomplete gold labels");
    for(let i=0;i<12;i++){
      const name=CALIBRATION_FIELD_ORDER[i],gold=row.fieldLabels[i],
        predicted=ranking.fields[i],guard=screen.fields[i],fm=result.fieldMetrics[name];
      if(gold.fieldName!==name||predicted.fieldName!==name||guard.resolutionState!=="unresolved")
        throw Error("Field ordering or authority error");
      const ok=same(predicted.label,gold),wrongResolved=predicted.label.resolutionState==="resolved"&&!ok,
        candidate=guard.gate==="candidate_unverified";
      result.fieldLabels++;if(ok){result.rawExact++;fm.rawExact++;cat.rawExact++}
      if(wrongResolved){result.rawWrongResolved++;fm.rawWrongResolved++;cat.rawWrongResolved++}
      if(gold.resolutionState==="resolved")result.goldResolved++;
      if(candidate){result.reviewCandidates++;fm.reviewCandidates++;cat.reviewCandidates++;
        if(!ok){result.incorrectCandidates++;fm.incorrectCandidates++;cat.incorrectCandidates++;
          result.errorExamples.push({exampleId:row.exampleId,fieldName:name,category:row.category,
            predicted:predicted.label,gold:{resolutionState:gold.resolutionState,normalizedValue:gold.normalizedValue}})}
        else result.correctCandidates++}
    }
  }
  result.verdict= result.incorrectCandidates>0?"blocked_false_resolutions_on_heldout":"review_only";
  return result;
}
const arg=process.argv[2],split=arg==="--heldout"?"test":arg==="--validation"?"validation":null;
if(process.argv[1] && import.meta.url.endsWith(process.argv[1])){
  if(!split)throw Error("Usage: --validation or --heldout");
  const result=await evaluateSplit(split);
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(split==="test"&&result.incorrectCandidates!==3)throw Error("Frozen held-out regression changed");
}
