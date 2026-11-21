import {empty,propose,reconcile,project} from './replica.mjs';
const $=id=>document.getElementById(id), dbKey='axiom-gauge.projection.v1';
let state=empty(),packet=null,link='Starting',busy=false,storageWarning='';
const labels={timely:'Current phase',timeless:'Future phase'};
const base64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const key=await fetch('./authority-key.json').then(r=>r.json()).then(j=>crypto.subtle.importKey('jwk',j,{name:'Ed25519'},false,['verify']));
async function verified(p){
  if(!await crypto.subtle.verify('Ed25519',key,base64(p.signature),new TextEncoder().encode(p.body)))throw Error('Signature mismatch');
  const head=JSON.parse(p.body);
  if(head.schema!==1||!Number.isSafeInteger(head.revision)||head.revision<1||JSON.stringify(AxiomGauge.assess(head.input))!==JSON.stringify(head.result))throw Error('Invalid checkpoint');
  return head;
}
function save(){try{localStorage.setItem(dbKey,JSON.stringify({packet,pending:state.pending,history:state.history}));}catch{storageWarning=' · device storage unavailable';}}
function el(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function draw(){
  if(!state.head){$('status').textContent=link+' · waiting for the first confirmed checkpoint';return;}
  const h=state.head,input=project(state),scores=AxiomGauge.assess(input);
  $('program').textContent=input.program;
  $('status').textContent=link+' · authority revision '+h.revision+' · '+new Date(h.at).toLocaleString()+storageWarning;
  $('hardware').textContent=h.cpu+' / '+h.gpu+(h.game?' · '+h.game.slot+' · last observed action '+h.game.action:'');
  const cards=Object.keys(labels).map(p=>{
    const sec=el('article','');sec.className='lens';sec.append(el('h2',labels[p]),el('small',input[p].phase));
    const s=scores[p];const n=el('p',s.mean===null?(s.unknown?s.unknown+' unknown':'No applicable criteria'):s.mean.toFixed(2)+' / 4');n.className='score';sec.append(n);
    const ul=el('ul','');for(const c of input[p].criteria){const item=el('li','');item.append(el('strong',AxiomGauge.policy.dimensions[c.id]+' · '+(c.value??c.state)),el('br',''),el('small',c.rationale));ul.append(item);}sec.append(ul);return sec;
  });$('lenses').replaceChildren(...cards);
  $('decision').textContent=input.lifecycle.whyNow;$('next').textContent=input.lifecycle.route;
  $('pending').textContent=state.pending.length+' provisional rating(s) on this device.';
  $('history').replaceChildren(...state.history.map(c=>el('li','Revision '+c.revision+' · '+c.draft.phase+' / '+c.draft.dimension+' · proposed '+c.draft.value+' ('+c.draft.rationale+') → '+(c.correctedTo?.value??c.correctedTo?.state??'retired'))));
  $('policy').textContent=input.modelVersion+' · '+AxiomGauge.policy.calculation;
}
try{const saved=JSON.parse(localStorage.getItem(dbKey));if(saved?.packet){const h=await verified(saved.packet);state={head:h,pending:saved.pending,history:saved.history};packet=saved.packet;link='Retained checkpoint';draw();}}catch{link='Stored checkpoint unavailable';}
async function sync(){
  if(busy)return;busy=true;
  try{
    const r=await fetch('./state.json',{cache:'no-store',signal:AbortSignal.timeout(5500)});if(!r.ok)throw Error('Checkpoint unavailable');
    const incoming=await r.json(),head=await verified(incoming),next=reconcile(state,head);
    if(!state.head||head.revision>state.head.revision){state=next;packet=incoming;save();}
    link=head.revision<state.head.revision?'Stale publication · retained newer revision':'Verified published checkpoint';
  }catch(e){link='Local strawman · '+(e.message==='Failed to fetch'?'offline':e.message);}
  finally{busy=false;draw();}
}
$('draft').onsubmit=e=>{e.preventDefault();if(!state.head)return;state=propose(state,$('phase').value,$('dim').value,Number($('rating').value),$('basis').value);save();draw();};
await sync();setInterval(sync,15000);window.addEventListener('online',sync);window.addEventListener('offline',()=>{link='Local strawman · offline';draw();});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{storageWarning=' · offline launch unavailable';draw();});
