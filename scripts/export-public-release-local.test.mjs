import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { makeReleaseJudgeFixture, releaseJudgeFixtureHtml } from "./support/release-judge-fixture.mjs";
import { serializeJudgeRehearsalReport } from "./support/judge-rehearsal-report.mjs";

const auditSource=fileURLToPath(new URL("./public-release-audit.mjs",import.meta.url));
const policySource=fileURLToPath(new URL("./public-audit-blob-policy.mjs",import.meta.url));
const classifierSource=fileURLToPath(new URL("./support/public-audit-fixture-value.mjs",import.meta.url));
const tokenPatternSource=fileURLToPath(new URL("./support/public-audit-token-patterns.mjs",import.meta.url));
const exportSource=fileURLToPath(new URL("./export-public-release.mjs",import.meta.url));
const releaseSource=fileURLToPath(new URL("./release-candidate-verify.mjs",import.meta.url));
const identitySource=fileURLToPath(new URL("./tracked-source-identity.mjs",import.meta.url));
const judgeSupport=["release-judge-evidence.mjs","judge-console-evidence.mjs","judge-rehearsal-report.mjs","release-judge-fixture.mjs"];
const required=[
  "LICENSE","README.md","JUDGES.md","docs/submission/README.md",
  "docs/submission/DEVPOST_DRAFT.md","docs/submission/VIDEO_STORYBOARD.md",
  "docs/submission/JUDGE_QUICKSTART.md","docs/submission/PUBLIC_REPO_PREFLIGHT.md",
];
const safeEmail="212063387+nolankido@users.noreply.github.com";

function run(cwd,command,args=[]){
  const result=spawnSync(command,args,{cwd,encoding:"utf8",windowsHide:true});
  if(result.error)throw result.error;
  return result;
}
function git(cwd,...args){
  const result=run(cwd,"git",args);
  assert.equal(result.status,0,result.stderr);
  return result.stdout.trim();
}
function fixture(){
  const dir=join(tmpdir(),`rr-public-export-${randomUUID()}`);
  mkdirSync(join(dir,"scripts"),{recursive:true});
  cpSync(auditSource,join(dir,"scripts","public-release-audit.mjs"));
  cpSync(policySource,join(dir,"scripts","public-audit-blob-policy.mjs"));
  cpSync(exportSource,join(dir,"scripts","export-public-release.mjs"));
  cpSync(releaseSource,join(dir,"scripts","release-candidate-verify.mjs"));
  cpSync(identitySource,join(dir,"scripts","tracked-source-identity.mjs"));
  mkdirSync(join(dir,"scripts","support"),{recursive:true});
  cpSync(classifierSource,join(dir,"scripts","support","public-audit-fixture-value.mjs"));
  cpSync(tokenPatternSource,join(dir,"scripts","support","public-audit-token-patterns.mjs"));
  for (const name of judgeSupport) cpSync(fileURLToPath(new URL("./support/"+name,import.meta.url)),join(dir,"scripts","support",name));
  writeFileSync(join(dir,".gitignore"),".data/\n.dev.vars.*\n");
  writeFileSync(join(dir,"package.json"),'{"private":true,"type":"module","packageManager":"pnpm@12.8.2"}\n');
  writeFileSync(join(dir,"pnpm-lock.yaml"),"lockfileVersion: '9.0'\n");
  writeFileSync(join(dir,".dev.vars.example"),"# safe ignored-but-tracked example\n");
  for(const path of required){
    const full=join(dir,path);mkdirSync(dirname(full),{recursive:true});
    writeFileSync(full,path==="README.md"?"fixture@example.test\n":`fixture ${path}\n`);
  }
  git(dir,"init");
  git(dir,"config","user.name","Initial Fixture");
  git(dir,"config","user.email","fixture@example.test");
  git(dir,"add",".");
  git(dir,"add","--force",".dev.vars.example");
  git(dir,"commit","-m","initial fixture");
  const privateEmail="private-author"+"@real-domain.test";
  writeFileSync(join(dir,"source.txt"),"frozen source\n");
  git(dir,"add","source.txt");
  git(dir,"-c","user.name=Private Source","-c",`user.email=${privateEmail}`,"commit","-m","private development commit");
  return dir;
}


const sha256=value=>createHash("sha256").update(value).digest("hex");
/** Synthetic passing record only, never evidence of an actual Node 22 release. */
function syntheticEvidence(dir,{windowsCorepack=false}={}){
  const root=join(dir,".data","release-candidate","run-fixture");
  const judgeRun=join(root,"judge","run-abc123");
  mkdirSync(judgeRun,{recursive:true});
  const judge=makeReleaseJudgeFixture({commit:git(dir,"rev-parse","HEAD"),node:"22.18.0"});
  writeFileSync(join(judgeRun,"evidence.json"),serializeJudgeRehearsalReport(judge));
  writeFileSync(join(judgeRun,"report.html"),releaseJudgeFixtureHtml(judge));
  const commands=[
    [process.execPath,join(dir,"scripts","public-release-audit.mjs"),"--snapshot-only"],
    ["corepack","pnpm","install","--frozen-lockfile"],
    ["corepack","pnpm","verify"],
    [process.execPath,join(dir,"scripts","judge-rehearsal.mjs"),"--output",join(root,"judge")],
  ];
  if (windowsCorepack) {
    commands[1]=["cmd.exe","/d","/c","corepack.cmd pnpm install --frozen-lockfile"];
    commands[2]=["cmd.exe","/d","/c","corepack.cmd pnpm verify"];
  }
  const records=commands.map((command,i)=>{
    const stdout="synthetic stdout "+i+"\n",stderr="";
    const stem=String(i+1).padStart(2,"0")+"-"+command[0].replace(/[^A-Za-z0-9._-]/g,"_");
    writeFileSync(join(root,stem+".stdout.log"),stdout);
    writeFileSync(join(root,stem+".stderr.log"),stderr);
    return {command,exitCode:0,signal:null,durationMs:1,
      stdoutSha256:sha256(stdout),stderrSha256:sha256(stderr),spawnError:null};
  });
  const lockBytes=readFileSync(join(dir,"pnpm-lock.yaml"));
  const committedGitBlobSha=git(dir,"rev-parse","--verify","HEAD:pnpm-lock.yaml");
  const evidence={
    schemaVersion:"rightsreceipt-release-candidate-v1",
    startedAt:"2026-10-31T00:00:00.000Z",
    finishedAt:"2026-10-31T00:00:01.000Z",
    status:"passed",mode:"full",commit:git(dir,"rev-parse","HEAD"),branch:"main",
    node:"22.18.0",packageManager:"pnpm@12.8.2",
    lockfile:{exists:true,sha256:sha256(lockBytes),
      committedGitBlobSha,workingGitBlobSha:committedGitBlobSha},
    preflightFailures:[],gitStatusSha256:sha256(""),
    commands:records,judgeEvidence:{root:"judge"},
  };
  const path=join(root,"verification.json");
  writeFileSync(path,JSON.stringify(evidence,null,2)+"\n");
  return path;
}
function changeEvidence(path,mutate){
  const value=JSON.parse(readFileSync(path,"utf8"));
  mutate(value);
  writeFileSync(path,JSON.stringify(value,null,2)+"\n");
}
function exportWithEvidence(dir,evidencePath){
  return run(dir,process.execPath,["scripts/export-public-release.mjs","--release-evidence",evidencePath]);
}

test("public export replaces private history with one byte-identical noreply commit",()=>{
  const dir=fixture();
  try{
    const sourceTree=git(dir,"rev-parse","HEAD^{tree}");
    const evidencePath=syntheticEvidence(dir);
    const result=exportWithEvidence(dir,evidencePath);
    assert.equal(result.status,0,result.stderr);
    const summary=JSON.parse(result.stdout);
    assert.equal(summary.status,"passed");
    const publicRepo=summary.repositoryPath;
    assert.equal(git(publicRepo,"rev-list","--count","HEAD"),"1");
    assert.equal(git(publicRepo,"rev-parse","HEAD^{tree}"),sourceTree);
    assert.equal(readFileSync(join(publicRepo,".dev.vars.example"),"utf8"),"# safe ignored-but-tracked example\n");
    const identities=git(publicRepo,"log","-1","--format=%ae%x09%ce").split("\t");
    assert.deepEqual(identities,[safeEmail,safeEmail]);
    const manifest=JSON.parse(readFileSync(summary.manifestPath,"utf8"));
    assert.equal(manifest.exactTreeMatch,true);
    assert.equal(manifest.sourceTree,manifest.publicTree);
    assert.equal(manifest.releaseVerificationSha256,sha256(readFileSync(evidencePath)));
    assert.equal(manifest.releaseNode,"22.18.0");
    const publicAudit=JSON.parse(readFileSync(summary.publicAuditPath,"utf8"));
    assert.equal(publicAudit.status,"passed");
    assert.equal(publicAudit.mode,"history");
    assert.equal(publicAudit.findings.length,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("public export accepts genuine Windows Corepack command records and their hashed logs",()=>{
  const dir=fixture();
  try{
    const evidencePath=syntheticEvidence(dir,{windowsCorepack:true});
    assert.match(readFileSync(join(dirname(evidencePath),"02-cmd.exe.stdout.log"),"utf8"),/synthetic stdout 1/u);
    const result=exportWithEvidence(dir,evidencePath);
    assert.equal(result.status,0,result.stdout||result.stderr);
    const summary=JSON.parse(result.stdout);
    assert.equal(summary.status,"passed");
    assert.equal(git(summary.repositoryPath,"rev-list","--count","HEAD"),"1");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("public export rejects modified Windows command strings or shell-bearing arguments",()=>{
  for(const altered of [
    ["cmd.exe","/d","/c","corepack.cmd pnpm verify & whoami"],
    ["cmd.exe","/c","corepack.cmd pnpm verify"],
    ["cmd.exe","/d","/c","pnpm verify"],
  ]){
    const dir=fixture();
    try{
      const evidencePath=syntheticEvidence(dir,{windowsCorepack:true});
      changeEvidence(evidencePath,value=>{value.commands[2].command=altered;});
      const result=exportWithEvidence(dir,evidencePath);
      assert.equal(result.status,1,JSON.stringify(altered));
      assert.equal(JSON.parse(result.stdout).code,"release_evidence_invalid");
    }finally{rmSync(dir,{recursive:true,force:true});}
  }
});

test("public export preserves executable Git file modes without exposing private history",()=>{
  const dir=fixture();
  try{
    writeFileSync(join(dir,"demo.sh"),"#!/bin/sh\nprintf 'safe fixture\\n'\n");
    git(dir,"add","demo.sh");
    git(dir,"update-index","--chmod=+x","demo.sh");
    // The index is authoritative for Git mode even on Windows filesystems.
    git(dir,"config","core.filemode","false");
    git(dir,"commit","-m","record executable judge helper");
    const sourceTree=git(dir,"rev-parse","HEAD^{tree}");
    assert.match(git(dir,"ls-tree","HEAD","demo.sh"),/^100755 blob /u);
    const evidencePath=syntheticEvidence(dir);
    const result=exportWithEvidence(dir,evidencePath);
    assert.equal(result.status,0,result.stderr||result.stdout);
    const summary=JSON.parse(result.stdout);
    assert.equal(git(summary.repositoryPath,"rev-parse","HEAD^{tree}"),sourceTree);
    assert.match(git(summary.repositoryPath,"ls-tree","HEAD","demo.sh"),/^100755 blob /u);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("public export refuses a dirty private source checkout",()=>{
  const dir=fixture();
  try{
    const evidencePath=syntheticEvidence(dir);
    writeFileSync(join(dir,"untracked-private.txt"),"do not export\n");
    const result=exportWithEvidence(dir,evidencePath);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"checkout_not_clean");
  }finally{rmSync(dir,{recursive:true,force:true});}
});


test("public export refuses a source snapshot containing a literal npm registry token",()=>{
  const dir=fixture();
  try{
    const token="npm_"+"B".repeat(32);
    writeFileSync(join(dir,".npmrc"),"//registry.npmjs.org/:_authToken="+token+"\n");
    git(dir,"add",".npmrc");
    git(dir,"commit","-m","bad npm token");
    const evidencePath=syntheticEvidence(dir);
    const result=exportWithEvidence(dir,evidencePath);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"source_snapshot_audit_failed");
  }finally{rmSync(dir,{recursive:true,force:true});}
});


test("public export requires explicit full release evidence",()=>{
  const dir=fixture();
  try{
    const result=run(dir,process.execPath,["scripts/export-public-release.mjs"]);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"release_evidence_required");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("opt-in public judge verification refuses exports without working judge entry points",()=>{
  const dir=fixture();
  try {
    const evidencePath=syntheticEvidence(dir);
    const result=run(dir,process.execPath,["scripts/export-public-release.mjs",
      "--release-evidence",evidencePath,"--verify-judge"]);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"public_judge_smoke_failed");
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("public export refuses a missing or unparseable evidence file",()=>{
  const dir=fixture();
  try{
    const missing=exportWithEvidence(dir,join(dir,".data","missing.json"));
    assert.equal(JSON.parse(missing.stdout).code,"release_evidence_unavailable");
    const path=syntheticEvidence(dir);
    writeFileSync(path,"{not-json");
    const broken=exportWithEvidence(dir,path);
    assert.equal(JSON.parse(broken.stdout).code,"release_evidence_invalid");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("a passing preflight-only record never satisfies the full release gate",()=>{
  const dir=fixture();
  try{
    const path=syntheticEvidence(dir);
    changeEvidence(path,value=>{value.mode="preflight";});
    const result=exportWithEvidence(dir,path);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"release_evidence_invalid");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("release evidence from an earlier source commit cannot be reused",()=>{
  const dir=fixture();
  try{
    const path=syntheticEvidence(dir);
    writeFileSync(join(dir,"next.txt"),"new source\n");
    git(dir,"add","next.txt");
    git(dir,"commit","-m","new candidate");
    const result=exportWithEvidence(dir,path);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"release_commit_mismatch");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("release evidence rejects a mismatched committed lockfile identity",()=>{
  const dir=fixture();
  try{
    const path=syntheticEvidence(dir);
    changeEvidence(path,value=>{value.lockfile.committedGitBlobSha="f".repeat(40);});
    const result=exportWithEvidence(dir,path);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"release_lockfile_mismatch");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("release evidence rejects altered command logs",()=>{
  const dir=fixture();
  try{
    const path=syntheticEvidence(dir);
    writeFileSync(join(dirname(path),"02-corepack.stdout.log"),"changed output\n");
    const result=exportWithEvidence(dir,path);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"release_log_mismatch");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("release evidence rejects a failed verification command",()=>{
  const dir=fixture();
  try{
    const path=syntheticEvidence(dir);
    changeEvidence(path,value=>{value.commands[2].exitCode=1;});
    const result=exportWithEvidence(dir,path);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"release_evidence_invalid");
  }finally{rmSync(dir,{recursive:true,force:true});}
});


test("public export accepts the pnpm forwarding separator with release evidence",()=>{
  const dir=fixture();
  try{
    const path=syntheticEvidence(dir);
    const result=run(dir,process.execPath,["scripts/export-public-release.mjs","--","--release-evidence",path]);
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).status,"passed");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("the one-commit exporter blocks unscannable binary source even with valid-looking release logs", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "binary-data"), Buffer.from([75, 0, 76]));
    git(dir, "add", "binary-data");
    git(dir, "commit", "-m", "binary source");
    const result = exportWithEvidence(dir, syntheticEvidence(dir));
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).code, "source_snapshot_audit_failed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the one-commit exporter blocks oversized tracked source instead of silently skipping it", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "oversized-text"), Buffer.alloc(16 * 1024 * 1024 + 1, 65));
    git(dir, "add", "oversized-text");
    git(dir, "commit", "-m", "oversized source");
    const result = exportWithEvidence(dir, syntheticEvidence(dir));
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).code, "source_snapshot_audit_failed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("public export rejects a hidden non-lockfile source edit even with passing-looking release logs", () => {
  const dir=fixture();
  try {
    const evidencePath=syntheticEvidence(dir);
    git(dir, "update-index", "--skip-worktree", "source.txt");
    writeFileSync(join(dir, "source.txt"), "hidden altered source\n");
    assert.equal(git(dir, "status", "--porcelain=v1"), "");
    const result=exportWithEvidence(dir,evidencePath);
    assert.equal(result.status,1);
    assert.equal(JSON.parse(result.stdout).code,"tracked_source_identity_failed");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

