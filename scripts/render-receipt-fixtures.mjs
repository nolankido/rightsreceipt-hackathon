/** Offline markup for layout checks. Synthetic records only. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {receiptExperienceFixture,ids,publicId} from './support/receipt-experience-fixture.mjs';
import {createReceiptReader} from '../packages/receipts/src/experience.ts';
import {RECEIPT_CLIENT_JS} from '../packages/receipts/src/client.ts';
import {renderPrivateReceipt,renderPublicVerification,renderAccessShell} from '../packages/receipts/src/presentation.ts';
const out=process.env.RR_BROWSER_ARTIFACTS??join(tmpdir(),'rightsreceipt-browser-checks');mkdirSync(out,{recursive:true});
for(const state of ['active','scheduled','expired','refunded','revoked']){
 const f=await receiptExperienceFixture({state});const result=await createReceiptReader(f.store,f.clock).read(ids.case,publicId);
 writeFileSync(join(out,`public-${state}.html`),renderPublicVerification(result.publicView));
 if(state==='active')writeFileSync(join(out,'buyer-receipt.html'),renderPrivateReceipt(result.payload,result.publicView,'https://rightsreceipt.example/verify/receipt/'+publicId));
}
writeFileSync(join(out,'buyer-access.html'),renderAccessShell());
writeFileSync(join(out,'receipt-client.js'),RECEIPT_CLIENT_JS);
console.log(JSON.stringify({output:out,syntheticOnly:true}));
