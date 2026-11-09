import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkedSandboxHandoffUrl, writeSandboxPaymentHandoff } from './sandbox-payment-handoff.mjs';

const PAY = 'https://www.sandbox.paypal.com/invoice/p/#SAFE049';
function fixture(run) { const dir = mkdtempSync(join(tmpdir(),'rr070-')); try {run(dir)} finally { rmSync(dir,{recursive:true,force:true}); } }
test('private file contains validated Sandbox recipient link and is owner-only',()=>fixture(dir=>{
  const path = writeSandboxPaymentHandoff(dir,{status:'UNPAID',paymentUrl:PAY});
  assert.ok(path.endsWith('sandbox-payment-link.txt'));
  assert.equal(readFileSync(path,'utf8'),PAY+'\n');
  if(process.platform!=='win32') assert.equal(statSync(path).mode & 0o777, 0o600);
}));
test('no handoff for a paid, refunded, draft or unknown invoice',()=>fixture(dir=>{
  for(const status of ['PAID','DRAFT','REFUNDED','UNKNOWN','CANCELLED'])
    assert.equal(writeSandboxPaymentHandoff(dir,{status,paymentUrl:PAY}),null);
}));
test('second write fails rather than replacing an earlier private link',()=>fixture(dir=>{
  writeSandboxPaymentHandoff(dir,{status:'UNPAID',paymentUrl:PAY});
  assert.throws(()=>writeSandboxPaymentHandoff(dir,{status:'SENT',paymentUrl:PAY}), e=>e.code==='payment_handoff_unavailable');
  assert.equal(readFileSync(join(dir,'sandbox-payment-link.txt'),'utf8'),PAY+'\n');
}));
test('unsafe destinations, credentials, encodings and query strings are rejected',()=>{
  for(const url of [
    'https://www.paypal.com/invoice/p/#SAFE049',
    'http://www.sandbox.paypal.com/invoice/p/#SAFE049',
    'https://sandbox.paypal.com/invoice/p/#SAFE049',
    'https://www.sandbox.paypal.com.evil.test/invoice/p/#SAFE049',
    'https://attacker' + String.fromCharCode(64) + 'www.sandbox.paypal.com/invoice/p/#SAFE049',
    'https://www.sandbox.paypal.com/invoice/p/#SAFE049?token=x',
    'https://www.sandbox.paypal.com/invoice/p/%23SAFE049',
    'https://www.sandbox.paypal.com/invoice/p/',
    'https://www.sandbox.paypal.com/redirect/to/attacker',
    'https://www.sandbox.paypal.com/invoice/p/#a.b',
    '',null
  ]) assert.throws(()=>checkedSandboxHandoffUrl(url),e=>e.code==='payment_handoff_unavailable',String(url));
});
test('accepts only expected Sandbox invoicing view paths',()=>{
  assert.equal(checkedSandboxHandoffUrl(PAY),PAY);
  const alt='https://www.sandbox.paypal.com/invoice/payerView/details/INV2-FAKE';
  assert.equal(checkedSandboxHandoffUrl(alt),alt);
});
