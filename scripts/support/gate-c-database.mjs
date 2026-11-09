/** Gate C exercises the complete checked-in schema, not simplified parent tables. */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../../", import.meta.url);
export const ids = Object.freeze({
  workspace: "00000000-0000-4000-8000-000000000001",
  policy: "00000000-0000-4000-8000-000000000002",
  asset: "00000000-0000-4000-8000-000000000003",
  case: "10000000-0000-4000-8000-000000000001",
  terms: "10000000-0000-4000-8000-000000000002",
  quote: "10000000-0000-4000-8000-000000000003",
  decision: "10000000-0000-4000-8000-000000000004",
  acceptance: "10000000-0000-4000-8000-000000000005",
  binding: "10000000-0000-4000-8000-000000000006",
  verification: "10000000-0000-4000-8000-000000000007",
  request: "10000000-0000-4000-8000-000000000008",
});
export const invoiceId = "INV2-GATEC-TEST";
export const now = "2026-10-27T19:00:00.000Z";
export function migrateAll(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS rr_schema_migrations (
    migration_name TEXT PRIMARY KEY,content_sha256 TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT`);
  const applied = [];
  for (const name of readdirSync(new URL("migrations/",root)).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/u.test(n)).sort()) {
    const sql=readFileSync(new URL(`migrations/${name}`,root),"utf8");
    const hash=createHash("sha256").update(sql).digest("hex");
    const prior=db.prepare("SELECT content_sha256 FROM rr_schema_migrations WHERE migration_name=?").get(name);
    if(prior){if(prior.content_sha256!==hash)throw Error("Migration drift");continue;}
    db.exec("BEGIN IMMEDIATE");
    try{db.exec(sql);db.prepare("INSERT INTO rr_schema_migrations VALUES(?,?,?)").run(name,hash,now);db.exec("COMMIT");applied.push(name);}
    catch(e){db.exec("ROLLBACK");throw e;}
  }
  return applied;
}
export function reset(db) {
  db.exec("BEGIN IMMEDIATE");
  try{db.exec(readFileSync(new URL("seed/demo-reset.sql",root),"utf8"));db.exec("COMMIT");}
  catch(e){db.exec("ROLLBACK");throw e;}
}
export function seedAcceptedCase(db,{startDate="2026-10-27",days=90}={}) {
  const insert=(table,values)=>db.prepare(`INSERT INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.keys(values).map(()=>"?").join(",")})`).run(...Object.values(values));
  db.exec("BEGIN IMMEDIATE");
  try{
    insert("licensing_cases",{case_id:ids.case,workspace_id:ids.workspace,asset_id:ids.asset,created_at:now,updated_at:now});
    insert("request_submissions",{request_submission_id:ids.request,case_id:ids.case,buyer_name:"Jordan Lee",buyer_organization:"Cedar & Tide Travel",
      buyer_email:"buyer@example.test",intended_use_text:"Original source evidence for a commercial image licensing request.",
      consent_copy_version:"buyer-request-v1",consent_acknowledged:1,submitted_at:now});
    insert("terms_versions",{terms_version_id:ids.terms,case_id:ids.case,version_number:1,resolution_status:"complete",
      use_purpose:"commercial",channels_json:'["instagram_paid","facebook_paid"]',paid_advertising:1,territories_json:'["US","CA"]',
      start_date:startDate,duration_days:days,max_impressions:500000,exclusivity:"non_exclusive",modification_scope:"crop_only",
      attribution:"not_required",sublicensing:"prohibited",ai_use:"prohibited",source_kind:"human_corrected",terms_hash:"a".repeat(64),created_by_actor:"creator",created_at:now});
    insert("quotes",{quote_id:ids.quote,case_id:ids.case,quote_version_number:1,terms_version_id:ids.terms,pricing_policy_id:ids.policy,
      pricing_policy_version:1,amount_cents:42500,currency:"USD",status:"current",calculation_hash:"b".repeat(64),created_at:now});
    insert("creator_decisions",{creator_decision_id:ids.decision,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,
      decision:"approved",actor_reference:"gate-c-test-creator",decided_at:now});
    insert("buyer_acceptances",{buyer_acceptance_id:ids.acceptance,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,
      creator_decision_id:ids.decision,acceptance_copy_version:"acceptance-v1",accepted_at:now});
    insert("invoice_bindings",{invoice_binding_id:ids.binding,case_id:ids.case,terms_version_id:ids.terms,quote_id:ids.quote,
      buyer_acceptance_id:ids.acceptance,provider:"paypal",environment:"sandbox",provider_invoice_id:invoiceId,
      invoice_status:"sent",created_at:now,updated_at:now});
    insert("verification_records",{verification_record_id:ids.verification,case_id:ids.case,public_verification_id:"GATEC_NOT_A_REAL_PUBLIC_TOKEN",current_status:"pending",created_at:now,updated_at:now});
    db.prepare(`UPDATE licensing_cases SET request_submission_id=?,latest_terms_version_id=?,latest_quote_id=?,latest_creator_decision_id=?,
      latest_buyer_acceptance_id=?,invoice_binding_id=?,verification_record_id=? WHERE case_id=?`)
      .run(ids.request,ids.terms,ids.quote,ids.decision,ids.acceptance,ids.binding,ids.verification,ids.case);
    db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e;}
}
export function fullDatabase({file=":memory:",initialize=true,startDate,days}={}) {
  const db=new DatabaseSync(file);db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000");
  const faults={at:-1,loseAck:false,errors:[]};
  if(initialize){migrateAll(db);reset(db);seedAcceptedCase(db,{startDate,days});}
  function statement(sql,values=[]){return {sql,values,bind(...v){return statement(sql,v);},
    async first(){return db.prepare(sql).get(...values)??null;},
    async all(){return {success:true,results:db.prepare(sql).all(...values)};},
    async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};}
  const adapter={prepare:statement,async batch(statements){
    db.exec("BEGIN IMMEDIATE");let results;
    try{results=statements.map((s,i)=>{if(faults.at===i)throw Error("injected SQL error");
      const r=db.prepare(s.sql).run(...s.values);return {success:true,meta:{changes:Number(r.changes)}};});db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");faults.errors.push(e.message);throw e;}
    if(faults.loseAck){faults.loseAck=false;throw Error("lost acknowledgement");}return results;
  }};
  return {db,adapter,faults,close:()=>db.close(),count:table=>db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n};
}
