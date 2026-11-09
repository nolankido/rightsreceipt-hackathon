import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './sandbox-webhook-bind.mjs';

const script = fileURLToPath(new URL('./sandbox-webhook-bind.mjs',import.meta.url));
test('help is offline and does not need a payment account',()=>{
  const result=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8',timeout:3000});
  assert.equal(result.status,0);
  assert.match(result.stdout,/writes an exclusive local binding/u);
});
test('pnpm forwarding separator is accepted',()=>{
  assert.deepEqual(parseArgs(['--','--route-file','x','--state','y']),{routeFile:'x',statePath:'y'});
});
test('flags must be complete and unique',()=>{
  for(const args of [['--route-file','a'],['--route-file','a','--route-file','b'],['--state','a','--foo','b']])assert.equal(parseArgs(args),null);
});
test('malformed private inputs return fixed failure codes without paths',()=>{
  const result=spawnSync(process.execPath,[script,'--route-file','/unknown/private-route.txt','--state','/unknown/state.json'],{encoding:'utf8',timeout:3000});
  assert.equal(result.status,1);
  const value=JSON.parse(result.stdout);
  assert.equal(value.status,'failed');
  assert.match(value.code,/^capture_binding_/u);
  assert.equal(result.stdout.includes('/unknown'),false);
});
