/** Served as a same-origin static script. No tokens in URLs, cookies or storage. */
export const RECEIPT_CLIENT_JS = String.raw`"use strict";
(()=>{
 const el=id=>document.getElementById(id), form=el('rr-access-form'), input=el('rr-token'), status=el('rr-client-status'), result=el('rr-result'), actions=el('rr-actions'), access=el('rr-access');
 const refresh=el('rr-refresh'), print=el('rr-print'), download=el('rr-export'), close=el('rr-lock');
 const COPY={
  closed:'Receipt closed. Enter your access token to reopen.',
  denied:'Receipt access denied or no record is available.',
  review:'The current receipt requires review or is not ready.',
  limited:'Too many requests. Wait before retrying.',
  unavailable:'Receipt is temporarily unavailable. Enter your access token to try again.',
  format:'Receipt format could not be verified. Enter your access token to try again.',
  integrity:'Receipt export could not be verified against the displayed receipt. Reopen your original receipt link or enter your access token.',
  timeout:'Receipt request timed out. Reopen your original receipt link or enter your access token to try again.',
  boundary:'The receipt status must be checked again. Reopen your original receipt link or enter your access token.',
  canceled:'This receipt request was canceled.'
 };
 let token='',session=0,operation=null,view=null,refreshTimer=0;
 const valid=value=>/^[A-Za-z0-9_-]{43}$/.test(value);
 const visible=()=>document.visibilityState!=='hidden';
 const stopTimer=()=>{clearTimeout(refreshTimer);refreshTimer=0;};
 const owns=op=>operation===op&&op.session===session;
 const fresh=state=>!!state&&state.session===session&&!!token&&visible()&&Date.now()<state.wallUntil&&performance.now()<state.monoUntil;
 function failure(code){const error=new Error(COPY[code]);error.receiptCode=code;return error;}
 function controls(){
  actions.hidden=!token;close.disabled=!token;refresh.disabled=!token||!!operation;
  print.disabled=download.disabled=!!operation||!fresh(view);result.setAttribute('aria-busy',String(!!operation));
 }
 function invalidate(){
  session++;const previous=operation;operation=null;token='';view=null;stopTimer();
  if(previous){previous.code='';previous.controller.abort();}
  input.value='';result.replaceChildren();access.hidden=false;controls();
 }
 function lock(message=COPY.closed){invalidate();status.textContent=message;}
 function start(){
  const op={session,code:token,controller:new AbortController(),wallStart:Date.now(),monoStart:performance.now()};
  operation=op;access.hidden=false;controls();return op;
 }
 const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
 const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))throw failure('format');
  const time=Date.parse(value);
  if(!Number.isFinite(time)||new Date(time).toISOString()!==value)throw failure('format');
  return time;
 }
 function responseDigest(response,format){
  const type=/^(text\/html|application\/json)(?:\s*;\s*charset\s*=\s*(?:"utf-8"|utf-8))?$/i.exec((response.headers.get('Content-Type')||'').trim());
  const digest=response.headers.get('X-Receipt-SHA256');
  if(response.status!==200||!type||type[1].toLowerCase()!==(format==='json'?'application/json':'text/html')||!hash(digest))throw failure('format');
  return digest;
 }
 function htmlReceipt(html,digest){
  const doc=new DOMParser().parseFromString(html,'text/html'),documents=doc.querySelectorAll('#rr-document');
  if(documents.length!==1||documents[0].tagName!=='MAIN')throw failure('format');
  const main=documents[0],checked=instant(main.dataset.checkedAt),boundary=main.dataset.nextBoundary;
  if(typeof boundary!=='string')throw failure('format');
  return {main,checked,next:boundary===''?Infinity:instant(boundary),digest};
 }
 function receiptEnvelope(value){
  if(!record(value)||value.schema_version!=='rightsreceipt-receipt-v1'||!uuid(value.case_id)||!uuid(value.receipt_chain_id)
   ||typeof value.verification_public_id!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(value.verification_public_id)||/^\d+$/.test(value.verification_public_id)
   ||!Number.isSafeInteger(value.revision_number)||value.revision_number<1||!hash(value.material_sha256)
   ||(value.revision_number===1?value.previous_revision_hash!==null:!hash(value.previous_revision_hash))
   ||!['asset','creator','buyer','terms','period','quote','consent','ai_provenance','payment','permission','audit_anchor'].every(key=>record(value[key])))throw failure('format');
  instant(value.created_at);
 }
 // Headers, complete body, parsing and hashing share one owned request budget.
 // A cancellation race settles even if transport or WebCrypto completes late.
 async function read(op,format,expectedView=null){
  let timer=0,problem=null,finished=false,rejectStopped,body=null,reader=null;
  const stopped=new Promise((_resolve,reject)=>{rejectStopped=reject;});
  function releaseBody(cancel){
   const active=reader,unread=body;reader=null;body=null;
   // Cancellation may reject or never settle. Neither can retain UI authority.
   if(cancel){try{Promise.resolve(active?active.cancel():unread?.cancel()).catch(()=>{});}catch{}}
   if(active){try{active.releaseLock();}catch{}}
  }
  function stop(error){if(finished||problem)return;problem=error;releaseBody(true);op.controller.abort();rejectStopped(error);}
  function check(){
   if(!problem&&(!owns(op)||op.controller.signal.aborted||!visible()))stop(failure('canceled'));
   if(!problem&&(Date.now()-op.wallStart>=15000||performance.now()-op.monoStart>=15000))stop(failure('timeout'));
   if(!problem&&format==='json'&&(view!==expectedView||!fresh(expectedView)))stop(failure('boundary'));
   if(problem)throw problem;
  }
  const onAbort=()=>stop(failure('canceled'));
  async function bodyBytes(response){
   // Canonical JSON is capped by the server. Rendered HTML has a separately
   // derived 128 KiB budget, including escaped fields and the fixed-size QR.
   const limit=format==='json'?262144:131072;
   const length=response.headers.get('Content-Length');
   const encoding=(response.headers.get('Content-Encoding')||'').trim().toLowerCase();
   let declared=null;
   if(length!==null){
    if(!/^\d+$/.test(length.trim())||!Number.isSafeInteger(Number(length)))throw failure('format');
    // Fetch exposes decoded bytes. Compressed wire length cannot be compared
    // with their size, but is still required to be valid decimal metadata.
    if(!encoding||encoding==='identity')declared=Number(length);
   }
   if(declared!==null&&(declared<1||declared>limit))throw failure('format');
   if(!body||typeof body.getReader!=='function')throw failure('format');
   try{reader=body.getReader();}catch{throw failure('format');}
   const active=reader,bytes=new Uint8Array(limit);let size=0;
   while(true){
    check();const part=await active.read();check();
    if(part.done)break;
    if(!(part.value instanceof Uint8Array)||part.value.byteLength>limit-size
     ||(declared!==null&&part.value.byteLength>declared-size))throw failure('format');
    // Copy only accepted bytes; never retain a growing list of tiny chunks or
    // a chunk's potentially much larger backing buffer across subsequent reads.
    bytes.set(part.value,size);size+=part.value.byteLength;
   }
   if(size<1||(declared!==null&&size!==declared))throw failure('format');
   releaseBody(false);check();return bytes.slice(0,size);
  }
  const request=async()=>{
   try{
   check();
   const response=await fetch('/api/receipts/buyer?format='+format,{headers:{Authorization:'Bearer '+op.code},cache:'no-store',signal:op.controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
   body=response.body;check();
   if(!response.ok)throw failure([401,403,404].includes(response.status)?'denied':response.status===409?'review':response.status===429?'limited':'unavailable');
   const digest=responseDigest(response,format);check();
   if(format==='json'&&digest!==expectedView.digest)throw failure('integrity');
   const bytes=await bodyBytes(response);check();
   if(format==='html'){
    let html;
    try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw failure('format');}
    check();const verified=htmlReceipt(html,digest);check();return verified;
   }
   let payload;
   try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{throw failure('format');}
   receiptEnvelope(payload);check();
   const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
   check();if(actual!==digest)throw failure('integrity');
   // Preserve the verified bytes, including their original encoding and order.
   const verified=new Blob([bytes],{type:'application/json'});check();return verified;
   }finally{releaseBody(true);}
  };
  try{
   op.controller.signal.addEventListener('abort',onAbort,{once:true});
   timer=setTimeout(()=>stop(failure('timeout')),15000);
   const value=await Promise.race([Promise.resolve().then(request),stopped]);check();return value;
  }catch(error){check();op.controller.abort();throw error;}
  finally{finished=true;releaseBody(true);clearTimeout(timer);op.controller.signal.removeEventListener('abort',onAbort);op.code='';}
 }
 function currentForOutput(){
  if(operation||!token)return false;
  if(!fresh(view)){lock(COPY.boundary);return false;}
  return true;
 }
 function schedule(state){
  stopTimer();
  refreshTimer=setTimeout(()=>{
   refreshTimer=0;if(view!==state||state.session!==session)return;
   if(operation){lock(COPY.boundary);return;}
   load();
  },Math.max(0,Math.min(state.wallUntil-Date.now(),state.monoUntil-performance.now())));
 }
 async function load(shouldPrint=false){
  if(operation||!token)return;
  if(!visible()){lock();return;}
  stopTimer();view=null;result.replaceChildren();
  const op=start();let completed=null;
  status.textContent='Checking current receipt and integrity...';
  try{
   const {main,checked,next,digest}=await read(op,'html');if(!owns(op))return;
   // Calendar status can change at UTC midnight even before the licensing end.
   const midnight=Date.parse(new Date(checked+86400000).toISOString().slice(0,10)+'T00:00:00.000Z');
   const budget=Math.min(60000,next-checked,midnight-checked);
   const state={session:op.session,digest,wallUntil:op.wallStart+budget,monoUntil:op.monoStart+budget};
   if(!fresh(state))throw failure('boundary');
   const section=document.createElement('section');section.id='rr-document';
   while(main.firstChild)section.append(main.firstChild);
   result.append(document.importNode(section,true));view=state;access.hidden=true;input.value='';
   status.textContent='Current Sandbox receipt loaded. Status is rechecked within 60 seconds.';
   schedule(state);completed=state;
  }catch(error){if(owns(op))lock(COPY[error?.receiptCode]||COPY.unavailable);}
  finally{if(owns(op)){operation=null;controls();}}
  // A canceled print cannot use a newer session's successfully loaded document.
  if(shouldPrint&&completed&&view===completed&&!operation&&fresh(completed))window.print();
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();const value=input.value.trim();
  if(!valid(value)){status.textContent='Enter a valid buyer access token.';return;}
  invalidate();token=value;load();
 });
 refresh.addEventListener('click',()=>load());
 close.addEventListener('click',()=>{lock();input.focus();});
 print.addEventListener('click',()=>{if(currentForOutput())load(true);});
 download.addEventListener('click',async()=>{
  if(!currentForOutput())return;
  const state=view,op=start();let url=null;
  status.textContent='Checking current canonical JSON...';
  try{
   const blob=await read(op,'json',state);if(!owns(op))return;
   if(view!==state||!fresh(state))throw failure('boundary');
   url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='rightsreceipt-sandbox.json';
   if(!owns(op)||view!==state||!fresh(state))return;
   anchor.click();
   if(owns(op)){access.hidden=true;input.value='';status.textContent='Canonical JSON exported. Verify current status before relying on any saved copy.';}
  }catch(error){if(owns(op))lock(COPY[error?.receiptCode]||COPY.unavailable);}
  finally{
   if(url){const released=url;setTimeout(()=>URL.revokeObjectURL(released),1000);}
   if(owns(op)){operation=null;controls();}
  }
 });
 // Lifecycle clearing owns the view before any older completion can run.
 document.addEventListener('visibilitychange',()=>{if(!visible())lock();});
 window.addEventListener('pagehide',()=>lock());window.addEventListener('pageshow',event=>{if(event.persisted)lock();});
 let initial=location.hash.slice(1);history.replaceState(null,'',location.pathname);controls();
 if(valid(initial)){token=initial;session++;load();}initial='';
})();
`;
