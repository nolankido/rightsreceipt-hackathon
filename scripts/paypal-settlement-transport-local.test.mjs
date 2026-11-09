import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPayPalSandboxInvoiceAdapter} from '../packages/paypal/src/sandbox-invoice.ts';
import {createMemoryDeliveryJournal} from '../packages/paypal/src/delivery-journal.ts';
import {isLocallyAssessedSettlement} from '../packages/paypal/src/settlement.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config={APP_MODE:'sandbox',PAYPAL_MODE:'paypal_sandbox',PAYPAL_BASE_URL:'https://api-m.sandbox.paypal.com',
 PAYPAL_SANDBOX_CLIENT_ID:'test-client-id-2701',PAYPAL_SANDBOX_CLIENT_SECRET:'test-secret-no-real-credential-2701'};
const request={caseId:id(1),assetId:id(2),termsVersionId:id(3),quoteId:id(4),creatorDecisionId:id(5),buyerAcceptanceId:id(6),
 amountCents:42500,currency:'USD',recipientEmail:'buyer@example.test',rightsSummary:'Commercial paid social rights in US and Canada for 90 days.',requestId:'rr027-transport-test'};
const money=value=>({currency_code:'USD',value});
async function harness(mutate=v=>v){let draft,reads=0,oauth=0;const calls=[];
 const adapter=createPayPalSandboxInvoiceAdapter(config,{merchant:{name:'Test creator',email:'merchant@example.test'},
  sandboxDraftTransportEnabled:true,sandboxInvoiceTransportEnabled:true,journal:createMemoryDeliveryJournal(),authorize:async()=>true,
  now:()=>Date.parse('2026-10-27T12:00:00.000Z'),fetch:async(url,init)=>{
   calls.push({url,method:init.method});assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));assert.equal(init.redirect,'error');
   if(url.endsWith('/oauth2/token')){oauth++;return Response.json({token_type:'Bearer',access_token:'mock-token',expires_in:3600});}
   if(init.method==='POST'){draft=JSON.parse(init.body);return Response.json({id:'INV2-TEST-027',status:'DRAFT'},{status:201});}
   reads++;const body={...draft,id:'INV2-TEST-027',status:'PAID',amount:money('425.00'),due_amount:money('0.00'),
    payments:{paid_amount:money('425.00'),transactions:[{type:'PAYPAL',method:'PAYPAL',payment_id:'PAYTEST027',payment_date:'2026-10-27',amount:money('425.00')}]}};
   return Response.json(mutate(body));
  }});
 await adapter.createDraftInvoice(request);
 return {adapter,calls,counts:()=>({reads,oauth})};
}
test('content-validated authenticated GET returns original-response financial details and no raw PII',async()=>{
 const h=await harness();const v=await h.adapter.getInvoice('INV2-TEST-027');assert.equal(v.settlement.conclusion,'paid');
 assert.equal(isLocallyAssessedSettlement(v.settlement),true);assert.equal(v.authoritativePaymentEvidence,false);
 assert.equal(v.settlement.paidCents,42500);assert.ok(!JSON.stringify(v).includes('buyer@example.test'));
 assert.equal(h.calls.filter(x=>x.url.endsWith('/send')).length,0);await h.adapter.getInvoice('INV2-TEST-027');assert.equal(h.counts().reads,2);
});
test('PAID string with no transaction details remains review-only',async()=>{
 const h=await harness(v=>{delete v.payments;return v;});assert.equal((await h.adapter.getInvoice('INV2-TEST-027')).settlement.conclusion,'review_required');
});
test('manual record cannot pass financial validation even when status is PAID',async()=>{
 const h=await harness(v=>{v.payments.transactions[0].type='EXTERNAL';return v;});assert.equal((await h.adapter.getInvoice('INV2-TEST-027')).settlement.conclusion,'review_required');
});
test('mismatched invoice content is rejected before financial detail reaches lifecycle',async()=>{
 for(const change of [v=>{v.amount.value='424.00';return v;},v=>{v.primary_recipients[0].billing_info.email_address='attacker@example.test';return v;},v=>{v.detail.note='forged rights';return v;}]){
  const h=await harness(change);await assert.rejects(h.adapter.getInvoice('INV2-TEST-027'),e=>e.code==='invoice_mismatch');
 }
});
test('full PayPal refund details travel through the exact validated invoice response',async()=>{
 const h=await harness(v=>{v.status='REFUNDED';v.refunds={refund_amount:money('425.00'),transactions:[{type:'PAYPAL',method:'PAYPAL',refund_id:'REFT027',refund_date:'2026-10-27',amount:money('425.00')}]};return v;});
 const v=await h.adapter.getInvoice('INV2-TEST-027');assert.equal(v.settlement.conclusion,'fully_refunded');assert.equal(v.settlement.refundedCents,42500);
});
