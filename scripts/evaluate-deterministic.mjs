import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { extractDeterministicFields, DETERMINISTIC_EXTRACTOR_VERSION, DETERMINISTIC_FIELDS } from '../packages/ai-runtime/src/deterministic-rules.ts';
import { AI_TASK_CONTRACT_VERSION, validateAiExtractionProposal } from '../packages/ai-runtime/src/contract.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const splits=process.argv.includes('--heldout') ? ['test'] : ['train','validation'];
const dataDir=process.argv.includes('--data-dir') ? resolve(process.argv[process.argv.indexOf('--data-dir')+1]) : join(root,'data','synthetic','v1');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const manifestBytes=readFileSync(join(dataDir,'manifest.json'));
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const sourceSha256=sha256(readFileSync(join(root,'packages','ai-runtime','src','deterministic-rules.ts')));
const fields = Object.fromEntries(DETERMINISTIC_FIELDS.map(name=>[name,{goldResolved:0,predResolved:0,correctResolved:0,falseResolved:0,abstainedOnNonResolved:0,stateAgreement:0,total:0}]));
const categories={};
let total=0, invalid=0;
const examples=[];
const score=(record)=>{
 const predicted=extractDeterministicFields(record.inputText);
 const proposal={contractVersion:AI_TASK_CONTRACT_VERSION,inputSha256:sha256(record.inputText),extractor:{kind:'deterministic',extractorVersion:DETERMINISTIC_EXTRACTOR_VERSION,modelId:null,modelVersion:null,artifactSha256:null},fields:predicted};
 const validated=validateAiExtractionProposal(proposal,record.inputText,proposal.inputSha256);
 if(!validated.ok){invalid++; if(examples.length<12) examples.push({id:record.exampleId,issueCodes:validated.issueCodes});}
 if(proposal.inputSha256!==record.inputSha256)throw Error('dataset input hash mismatch '+record.exampleId);
 const cat=categories[record.category]??={correctResolved:0,falseResolved:0,goldResolved:0,total:0};cat.total++;
 for(let i=0;i<12;i++){
  const gold=record.fieldLabels[i], pred=predicted[i];
  if(gold.fieldName!==pred.fieldName)throw Error('field order mismatch');
  const metric=fields[gold.fieldName];metric.total++;
  const expected=JSON.stringify(gold.normalizedValue);
  const got=JSON.stringify(pred.normalizedValue);
  const goldResolved=gold.resolutionState==='resolved';
  const predResolved=pred.resolutionState==='resolved';
  if(goldResolved){metric.goldResolved++;cat.goldResolved++}
  if(predResolved){metric.predResolved++;
   if(goldResolved&&expected===got){metric.correctResolved++;cat.correctResolved++}
   else {metric.falseResolved++;cat.falseResolved++;if(examples.length<12)examples.push({id:record.exampleId,field:gold.fieldName,pred:got,gold:expected,goldState:gold.resolutionState,evidence:pred.evidenceSpans});}
  }
  if(!goldResolved&&!predResolved)metric.abstainedOnNonResolved++;
  if(gold.resolutionState===pred.resolutionState)metric.stateAgreement++;
 }
 total++;
};
for(const split of splits){const text=readFileSync(join(dataDir,split+'.jsonl'),'utf8');
 const expected=manifest.files?.[split+'.jsonl'];
 const rows=text.split('\n').filter(Boolean);
 if(!expected || expected.sha256!==sha256(text) || expected.bytes!==Buffer.byteLength(text) || expected.rows!==rows.length)
   throw Error('The checked-in corpus differs from the Turn 015 manifest for '+split);
 for(const line of rows)score(JSON.parse(line));
}
const aggregate=Object.values(fields).reduce((a,m)=>{for(const key of Object.keys(a))a[key]+=m[key];return a;},{goldResolved:0,predResolved:0,correctResolved:0,falseResolved:0,abstainedOnNonResolved:0,stateAgreement:0,total:0});
const fraction=(numerator,denominator)=>denominator?Number((numerator/denominator).toFixed(6)):null;
const summary={extractor:DETERMINISTIC_EXTRACTOR_VERSION,extractorSourceSha256:sourceSha256,manifestMatched:true,splits,records:total,invalidProposals:invalid,
  resolvedPrecision:fraction(aggregate.correctResolved,aggregate.predResolved),
  resolvedRecall:fraction(aggregate.correctResolved,aggregate.goldResolved),
  falseResolved:aggregate.falseResolved,
  predictedResolved:aggregate.predResolved,
  goldResolved:aggregate.goldResolved,
  stateAgreement:fraction(aggregate.stateAgreement,aggregate.total),
  correctAbstentionRate:fraction(aggregate.abstainedOnNonResolved,aggregate.total-aggregate.goldResolved),
  fieldMetrics:Object.fromEntries(Object.entries(fields).map(([field,m])=>[field,{...m,precision:fraction(m.correctResolved,m.predResolved),recall:fraction(m.correctResolved,m.goldResolved)}])),
  categoryMetrics:categories,firstFailures:examples};
if(process.argv.includes('--json'))console.log(JSON.stringify(summary,null,2));else {console.log(`${total} requests, ${aggregate.goldResolved} gold resolved, ${aggregate.predResolved} predicted resolved, ${aggregate.correctResolved} correct, ${aggregate.falseResolved} false resolved, ${invalid} invalid proposals`);
console.log(`precision=${summary.resolvedPrecision}, recall=${summary.resolvedRecall}, correct-abstention=${summary.correctAbstentionRate}, state agreement=${summary.stateAgreement}`);
for(const [name,m] of Object.entries(summary.fieldMetrics))console.log(`${name.padEnd(20)} ${String(m.correctResolved).padStart(4)}/${String(m.goldResolved).padStart(4)} recall=${m.recall} false_resolved=${m.falseResolved} state_agreement=${m.stateAgreement}/${m.total}`);
if(examples.length)console.log('FIRST FAILURES',JSON.stringify(examples,null,2));}
if(invalid||aggregate.falseResolved)process.exitCode=1;
