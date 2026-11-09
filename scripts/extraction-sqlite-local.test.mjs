import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createD1ExtractionRepository } from "../packages/persistence/src/extraction.ts";

const caseId="10000000-0000-4000-8000-000000000001";
const inputHash=createHash("sha256").update("example immutable buyer text").digest("hex");
function fixture({withRequest=true,closed=false,terms=false,version=1,existingAttempt=false}={}){
 const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys = ON");
 db.exec(`CREATE TABLE licensing_cases(case_id TEXT PRIMARY KEY,row_version INTEGER,case_outcome TEXT,request_submission_id TEXT,latest_terms_version_id TEXT,latest_extraction_attempt_id TEXT,updated_at TEXT);
 CREATE TABLE extraction_attempts (extraction_attempt_id TEXT PRIMARY KEY,case_id TEXT NOT NULL,attempt_number INTEGER NOT NULL,status TEXT NOT NULL,extractor_version TEXT NOT NULL,model_id TEXT,model_version TEXT,artifact_hash TEXT,input_hash TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT,error_code TEXT,UNIQUE(case_id,attempt_number),FOREIGN KEY(case_id) REFERENCES licensing_cases(case_id));
 CREATE TABLE field_observations(field_observation_id TEXT PRIMARY KEY,extraction_attempt_id TEXT NOT NULL,field_name TEXT,normalized_value_json TEXT,resolution_state TEXT,provenance TEXT,confidence_basis_points INTEGER,evidence_start_utf16 INTEGER,evidence_end_utf16 INTEGER,evidence_text TEXT,resolver_version TEXT,created_at TEXT,FOREIGN KEY(extraction_attempt_id) REFERENCES extraction_attempts(extraction_attempt_id));
 CREATE TABLE audit_events(audit_event_id TEXT PRIMARY KEY,case_id TEXT NOT NULL,aggregate_type TEXT,aggregate_id TEXT,aggregate_sequence INTEGER,event_type TEXT,actor_type TEXT,actor_reference TEXT,payload_json TEXT,correlation_id TEXT,idempotency_key TEXT,created_at TEXT,FOREIGN KEY(case_id) REFERENCES licensing_cases(case_id));`);
 db.prepare("INSERT INTO licensing_cases VALUES (?,?,?,?,?,?,?)").run(caseId,version,closed?"rejected":"open",withRequest?"20000000-0000-4000-8000-000000000001":null,terms?"30000000-0000-4000-8000-000000000001":null,existingAttempt?"40000000-0000-4000-8000-000000000001":null,"2026-10-26T12:00:00Z");
 const adapter={
  prepare(sql){const stmt=db.prepare(sql);let args=[];return {
    bind(...values){args=values;return this},
    async first(){return stmt.get(...args)??null},
    async all(){return {success:true,results:stmt.all(...args)}},
    async run(){const x=stmt.run(...args);return {success:true,meta:{changes:x.changes}}},
  }},
  async batch(statements){db.exec("BEGIN IMMEDIATE");try{const out=[];for(const stmt of statements)out.push(await stmt.run());db.exec("COMMIT");return out}catch(e){db.exec("ROLLBACK");throw e}},
 };
 const repo=createD1ExtractionRepository(adapter);
 let next=1;const uuid=()=>`50000000-0000-4000-8000-${String(next++).padStart(12,"0")}`;
 const timestamp="2026-10-26T12:05:00.000Z";
 const attempt={extractionAttemptId:uuid(),caseId,attemptNumber:1,status:"completed",extractorVersion:"rights-rule-baseline-v1",modelId:"rightsreceipt-synthetic-lexical",modelVersion:"2026-10-26-v1",artifactHash:"6".repeat(64),inputHash,startedAt:timestamp,completedAt:timestamp,errorCode:null};
 const fields=["use_purpose","channels","paid_advertising","territories","start_date","duration_days","max_impressions","exclusivity","modification_scope","attribution","sublicensing","ai_use"];
 const obs=fields.map(fieldName=>({fieldObservationId:uuid(),extractionAttemptId:attempt.extractionAttemptId,fieldName,normalizedValueJson:null,resolutionState:"unresolved",provenance:"deterministic",confidenceBasisPoints:null,evidenceStartUtf16:null,evidenceEndUtf16:null,evidenceText:null,resolverVersion:"rights-rule-baseline-v1",createdAt:timestamp}));
 const audit={auditEventId:uuid(),caseId,aggregateId:attempt.extractionAttemptId,eventType:"extraction.proposals_saved",actorReference:"deterministic-local-extractor",payloadJson:'{"review_required":true}',correlationId:uuid(),idempotencyKey:inputHash,createdAt:timestamp};
 return {db,repo,attempt,obs,audit,uuid};
}
const count=(db,table)=>Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
const state=(db)=>({attempts:count(db,"extraction_attempts"),observations:count(db,"field_observations"),audits:count(db,"audit_events"),case:db.prepare("SELECT row_version, latest_extraction_attempt_id FROM licensing_cases").get()});

test("atomic save writes twelve source records and model-version metadata",async()=>{
 const f=fixture();await f.repo.saveAutomated(f.attempt,f.obs,f.audit,1);
 const s=state(f.db);assert.equal(s.attempts,1);assert.equal(s.observations,12);assert.equal(s.audits,1);assert.equal(s.case.row_version,2);
 const view=await f.repo.getAutomated(caseId);assert.equal(view.attempt.modelVersion,"2026-10-26-v1");assert.deepEqual(view.observations.map(x=>x.fieldName),f.obs.map(x=>x.fieldName));
});
test("contradictions preserve both UTF-16 source spans as separate rows",async()=>{
 const f=fixture(),a={...f.obs[3],resolutionState:"contradictory",normalizedValueJson:'{"note":"conflict"}',evidenceStartUtf16:0,evidenceEndUtf16:5,evidenceText:"abcde"},b={...a,fieldObservationId:f.uuid(),evidenceStartUtf16:7,evidenceEndUtf16:12,evidenceText:"fghij"};
 const obs=[...f.obs.slice(0,3),a,b,...f.obs.slice(4)];await f.repo.saveAutomated(f.attempt,obs,f.audit,1);
 const stored=(await f.repo.getAutomated(caseId)).observations.filter(x=>x.fieldName==="territories");assert.deepEqual(stored.map(x=>x.evidenceText),["abcde","fghij"]);
});
test("stale row version rolls back all dependent records",async()=>{
 const f=fixture({version:2});await assert.rejects(f.repo.saveAutomated(f.attempt,f.obs,f.audit,1));
 assert.equal(state(f.db).attempts,0);assert.equal(state(f.db).observations,0);assert.equal(state(f.db).audits,0);assert.equal(state(f.db).case.row_version,2);
});
test("unsubmitted case cannot create an orphaned attempt",async()=>{
 const f=fixture({withRequest:false});await assert.rejects(f.repo.saveAutomated(f.attempt,f.obs,f.audit,1));
 assert.equal(count(f.db,"audit_events"),0);assert.equal(count(f.db,"extraction_attempts"),0);
});
test("closed case fails closed",async()=>{
 const f=fixture({closed:true});await assert.rejects(f.repo.saveAutomated(f.attempt,f.obs,f.audit,1));assert.equal(count(f.db,"extraction_attempts"),0);
});
test("human-confirmed terms block a replacement",async()=>{
 const f=fixture({terms:true});await assert.rejects(f.repo.saveAutomated(f.attempt,f.obs,f.audit,1));assert.equal(count(f.db,"extraction_attempts"),0);
});
test("prior attempt pointer blocks replacement",async()=>{
 const f=fixture({existingAttempt:true});await assert.rejects(f.repo.saveAutomated(f.attempt,f.obs,f.audit,1));assert.equal(count(f.db,"extraction_attempts"),0);
});
test("duplicate attempt cannot create a second audit event",async()=>{
 const f=fixture();await f.repo.saveAutomated(f.attempt,f.obs,f.audit,1);
 await assert.rejects(f.repo.saveAutomated(f.attempt,f.obs,f.audit,1));
 assert.equal(count(f.db,"extraction_attempts"),1);assert.equal(count(f.db,"audit_events"),1);
});
test("unrelated case has no evidence",async()=>{
 const f=fixture();assert.equal(await f.repo.getAutomated(randomUUID()),null);
});
