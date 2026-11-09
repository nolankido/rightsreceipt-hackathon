/** Focused SQL fixture for Turn 030. Uses real production receipt and temporal
 * SQL, with a synthetic relational schema derived from the Turn 029 source fixture.
 * This is NOT the complete migration/seed runner or live Cloudflare D1.
 */
import { DatabaseSync } from 'node:sqlite';
import { receiptExperienceFixture, ids, publicId } from './receipt-experience-fixture.mjs';
import { createD1TemporalStore } from '../../packages/receipts/src/temporal-store.ts';
import { createReceiptService } from '../../packages/receipts/src/service.ts';
export { ids, publicId };
export async function temporalDatabase({state='active',file=':memory:',initialize=true}={}) {
 const source=await receiptExperienceFixture({state,issued:false});
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000');
 if(initialize){
  const root=source.root;
  const mapping={licensing_cases:'case',creator_workspaces:'workspace',assets:'asset',request_submissions:'request',terms_versions:'terms',quotes:'quote',pricing_policy_versions:'policy',creator_decisions:'decision',buyer_acceptances:'acceptance',invoice_bindings:'binding',permissions:'permission',verification_records:'verification',paypal_reconciliation_outbox:'outbox',paypal_lifecycle_observations:'financial',quote_lines:'lines',payment_evidence:'evidence',extraction_attempts:'extractions',audit_events:'audit'};
  for(const [table,key] of Object.entries(mapping)){
   const rows=Array.isArray(root[key])?root[key]:[root[key]];
   const sample={...rows[0]};
   if(['licensing_cases','permissions','verification_records'].includes(table))sample.updated_at=source.clock().toISOString();
   const primary={licensing_cases:'case_id',permissions:'permission_id',verification_records:'verification_record_id',audit_events:'audit_event_id'}[table];
   const defs=Object.entries(sample).map(([k,v])=>`${k} ${typeof v==='number'?'INTEGER':'TEXT'}${k===primary?' PRIMARY KEY':''}${table==='audit_events'&&k==='case_id'?' NOT NULL':''}`);
   if(table==='audit_events')defs.push('UNIQUE(case_id,aggregate_type,aggregate_id,aggregate_sequence)','UNIQUE(case_id,idempotency_key)');
   db.exec(`CREATE TABLE ${table} (${defs.join(',')}) STRICT`);
   for(const row of rows){const value={...row};if('updated_at' in sample)value.updated_at=sample.updated_at;
    db.prepare(`INSERT INTO ${table} (${Object.keys(value).join(',')}) VALUES (${Object.keys(value).map(()=>'?').join(',')})`).run(...Object.values(value));}
  }
  db.exec(`CREATE TABLE receipt_revisions (
   receipt_revision_id TEXT PRIMARY KEY,verification_record_id TEXT NOT NULL,permission_id TEXT NOT NULL,
   revision_number INTEGER NOT NULL,schema_version TEXT NOT NULL,previous_revision_hash TEXT,canonical_payload_json TEXT NOT NULL,
   payload_hash TEXT NOT NULL,created_at TEXT NOT NULL,material_sha256 TEXT,audit_root_sha256 TEXT,
   UNIQUE(verification_record_id,revision_number),UNIQUE(verification_record_id,payload_hash)) STRICT;
   CREATE TRIGGER immutable_receipt BEFORE UPDATE ON receipt_revisions BEGIN SELECT RAISE(ABORT,'receipt immutable');END;
   CREATE TRIGGER immutable_audit BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'audit immutable');END;
   CREATE TRIGGER terminal_permission BEFORE UPDATE ON permissions
   WHEN (OLD.permission_state IN ('expired','refunded','revoked') AND NEW.permission_state IN ('scheduled','active'))
     OR (OLD.permission_state IN ('refunded','revoked') AND NEW.permission_state IS NOT OLD.permission_state)
   BEGIN SELECT RAISE(ABORT,'terminal permission');END;`);
 }
 const faults={at:-1,kind:'all',beforeBatch:null,loseAck:false,errors:[]};
 function statement(sql,values=[]){return {sql,values,bind(...v){return statement(sql,v);},async first(){return db.prepare(sql).get(...values)??null;},
  async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};}
 const adapter={prepare:statement,async batch(statements){
  const kind=statements[0].sql.includes('INSERT INTO receipt_revisions')?'receipt':statements[0].sql.includes("'permission_clock'")?'clock':'other';
  if(faults.beforeBatch){const callback=faults.beforeBatch;faults.beforeBatch=null;await callback(kind);}
  db.exec('BEGIN IMMEDIATE');let results;
  try{results=statements.map((s,i)=>{if(faults.at===i&&(faults.kind==='all'||faults.kind===kind))throw Error('PRIVATE_SQL_ERROR');
   const r=db.prepare(s.sql).run(...s.values);return {success:true,meta:{changes:Number(r.changes)}};});db.exec('COMMIT');}
  catch(e){db.exec('ROLLBACK');faults.errors.push(e.message);throw e;}
  if(faults.loseAck&&(faults.kind==='all'||faults.kind===kind)){faults.loseAck=false;throw Error('LOST_ACK');}
  return results;
 }};
 const store=createD1TemporalStore(adapter),issuer=createReceiptService(store.receipts,source.clock);
 if(initialize){const issued=await issuer.issue(ids.case);if(issued.outcome!=='issued')throw Error('SQL fixture issuance '+JSON.stringify(issued));}
 return {db,adapter,faults,store,issuer,clock:source.clock,setNow:source.setNow,close:()=>db.close(),
  count:t=>db.prepare(`SELECT count(*) n FROM ${t}`).get().n,
  permission:()=>db.prepare('SELECT * FROM permissions').get(),verification:()=>db.prepare('SELECT * FROM verification_records').get(),
  receipts:()=>db.prepare('SELECT * FROM receipt_revisions ORDER BY revision_number').all()};
}
