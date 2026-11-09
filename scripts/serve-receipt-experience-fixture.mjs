/** Local synthetic browser fixture, never imported by the Worker. */
import {createServer} from 'node:http';
import {receiptExperienceFixture,ids,publicId,buyerToken} from './support/receipt-experience-fixture.mjs';
import {createReceiptExperienceHandler} from '../packages/receipts/src/http.ts';
const port=Number(process.env.RR_RECEIPT_TEST_PORT??8789),origin=`http://127.0.0.1:${port}`;
let fixture=await receiptExperienceFixture(),revoked=false;
function handler(){return createReceiptExperienceHandler({store:fixture.store,now:fixture.clock,publicOrigin:origin,allowRead:async()=>true,
 directory:{async byPublicId(id){return id===publicId?ids.case:null;},async byBuyerToken(token){return !revoked&&token===buyerToken?ids.case:null;}},
 authorizeCreator:async(req,id)=>req.headers.get('Cookie')==='fixture-only-session'&&id===ids.case});}
let current=handler();
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__fixture/revoke'){revoked=true;res.end('revoked');return;}
  if(url.pathname.startsWith('/__fixture/state/')){const state=url.pathname.split('/').at(-1);if(!['active','scheduled','expired','refunded','revoked'].includes(state)){res.statusCode=400;res.end();return;}fixture=await receiptExperienceFixture({state});revoked=false;current=handler();res.end('ready');return;}
  const request=new Request(url,{method:req.method,headers:req.headers});const response=await current(request);
  if(!response){res.statusCode=404;res.end('Not found');return;}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=500;res.end('Fixture failed');}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,origin,publicId,buyerToken,synthetic:true})));
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>server.close(()=>process.exit(0)));
