import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindSandboxCaptureInvoice, readSandboxCaptureInvoiceBinding } from './sandbox-webhook-binding.mjs';

const ID = 'INV2-HARBOR-073';
const ROUTE = '/webhooks/paypal/sandbox/capture/' + 'a'.repeat(48);
function fixture(fn) {
  const base = mkdtempSync(join(tmpdir(),'rr73-bind-'));
  const dir = join(base,'run-fixture-073');
  mkdirSync(dir);
  const routeFile = join(dir,'private-route.txt');
  const stateDir = join(base,'invoice-state');
  mkdirSync(stateDir);
  const statePath = join(stateDir,'state.json');
  writeFileSync(routeFile,ROUTE+'\n');
  const state = { schemaVersion:'rightsreceipt-paypal-sandbox-state-v1', phase:'sent_checked', invoiceId: ID,
    entry:{sendState:'confirmed', binding:{draft:{invoiceId:ID}}}};
  writeFileSync(statePath,JSON.stringify(state));
  try {return fn({base,dir,routeFile,statePath,state})} finally {rmSync(base,{recursive:true,force:true})}
}
test('bind after invoice creation without contacting network and read same invoice',()=>fixture(f=>{
  assert.equal(readSandboxCaptureInvoiceBinding({directory:f.dir,routePath:ROUTE}),null);
  const result=bindSandboxCaptureInvoice({routeFile:f.routeFile,statePath:f.statePath});
  assert.equal(result.status,'bound');
  assert.match(result.invoiceIdSha256,/^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(result).includes(ID),false);
  const raw=JSON.parse(readFileSync(result.bindingPath,'utf8'));
  assert.equal(raw.invoiceId,ID);
  assert.deepEqual(readSandboxCaptureInvoiceBinding({directory:f.dir,routePath:ROUTE}),{invoiceId:ID});
  if(process.platform!=='win32') assert.equal(lstatSync(result.bindingPath).mode&0o777,0o600);
}));
test('binding is exclusive and cannot be silently switched to another invoice',()=>fixture(f=>{
  const first=bindSandboxCaptureInvoice({routeFile:f.routeFile,statePath:f.statePath});
  assert.throws(()=>bindSandboxCaptureInvoice({routeFile:f.routeFile,statePath:f.statePath}),e=>e.code==='capture_binding_already_exists');
  assert.equal(JSON.parse(readFileSync(first.bindingPath,'utf8')).invoiceId,ID);
}));
test('rejects a state that was not successfully sent and checked',()=>fixture(f=>{
  for(const change of [{phase:'draft_bound'}, {phase:'failed_unknown_send_outcome'}, {entry:{sendState:'started',binding:{draft:{invoiceId:ID}}}}, {invoiceId:'INV2-OTHER-073'}]) {
    writeFileSync(f.statePath,JSON.stringify({...f.state,...change}));
    assert.throws(()=>bindSandboxCaptureInvoice({routeFile:f.routeFile,statePath:f.statePath}),e=>e.code==='capture_binding_state_invalid');
  }
}));
test('the private route must be exact and originate from a capture run directory',()=>fixture(f=>{
  writeFileSync(f.routeFile,'/webhooks/paypal/sandbox/capture/'+'b'.repeat(47)+'\n');
  assert.throws(()=>bindSandboxCaptureInvoice({routeFile:f.routeFile,statePath:f.statePath}),e=>e.code==='capture_binding_route_invalid');
}));
test('rejects symlinked route and state files',()=>fixture(f=>{
  if(process.platform==='win32')return;
  const symlink=join(f.dir,'link','private-route.txt');
  mkdirSync(join(f.dir,'link'));
  symlinkSync(f.routeFile,symlink);
  assert.throws(()=>bindSandboxCaptureInvoice({routeFile:symlink,statePath:f.statePath}),e=>e.code==='capture_binding_path_invalid');
}));
test('wrong route cannot use an already-created binding',()=>fixture(f=>{
  bindSandboxCaptureInvoice({routeFile:f.routeFile,statePath:f.statePath});
  const other='/webhooks/paypal/sandbox/capture/'+'b'.repeat(48);
  assert.throws(()=>readSandboxCaptureInvoiceBinding({directory:f.dir,routePath:other}),e=>e.code==='capture_binding_invalid');
}));
test('malformed binding is rejected rather than silently falling back to any invoice',()=>fixture(f=>{
  writeFileSync(join(f.dir,'invoice-binding.json'),JSON.stringify({schemaVersion:'wrong',invoiceId:ID}));
  assert.throws(()=>readSandboxCaptureInvoiceBinding({directory:f.dir,routePath:ROUTE}),e=>e.code==='capture_binding_invalid');
}));
test('private state cannot come from a tracked source folder',()=>fixture(f=>{
  assert.throws(()=>bindSandboxCaptureInvoice({routeFile:f.routeFile,statePath:'scripts/support/nonexistent/state.json'}),e=>e.code==='capture_binding_path_invalid');
}));
