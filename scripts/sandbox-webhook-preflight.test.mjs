import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main } from './sandbox-webhook-preflight.mjs';

test('help does not call PayPal and exposes the narrow read-only purpose',()=>{
  const script=fileURLToPath(new URL('./sandbox-webhook-preflight.mjs',import.meta.url));
  const r=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8'});
  assert.equal(r.status,0);
  assert.match(r.stdout,/read-only/u);
  assert.match(r.stdout,/Does not prove/u);
});
test('invalid arguments exit before any network activity',async()=>{
  const code=await main(['--create'],{},()=>{throw Error('unexpected');});
  assert.equal(code,2);
});
test('missing configuration fails with a fixed code and no network',async()=>{
  const code=await main([],{PAYPAL_SANDBOX_CLIENT_ID:'fixture'},()=>{throw Error('unexpected');});
  assert.equal(code,1);
});
