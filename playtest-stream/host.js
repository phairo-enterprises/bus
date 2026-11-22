// Hollow Soul stream transport v1
import {api,delay,gather} from './rtc.js';

const MAX_PLAYERS=8, GRACE_MS=60000, ADMISSION_MS=15000, HEARTBEAT_MS=120000;
const STORAGE_KEY='hollow-soul-stream-admission-v1';
const STATE_KEY=Symbol.for('hollow-soul.stream.admission.v1');
const keys={w:'KeyW',a:'KeyA',s:'KeyS',d:'KeyD',e:'KeyE',j:'KeyJ',k:'KeyK','.':'Period',Enter:'Enter',Escape:'Escape'};
// Versioned transport imports share one authority. A stream release does not
// create a second name registry or forget reconnect credentials and blocks.
const state=globalThis[STATE_KEY]??=restore();
const members=state.members, heldByKey=state.heldByKey;

function normalizeName(value){
  if(typeof value!=='string')return null;
  const name=value.trim().normalize('NFC');
  if(!name||[...name].length>64||/[\u0000-\u001f\u007f]/u.test(name))return null;
  return {name,key:name.toLowerCase()};
}
function restore(){
  const restored={members:new Set(),heldByKey:new Map(),sessions:new Map(),blocked:new Map(),revoked:new Map(),operator:null,storageWarning:''};
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved?.version!==1)return restored;
    for(const entry of Array.isArray(saved.blocked)?saved.blocked:[]){
      const normalized=normalizeName(entry.name);
      if(normalized)restored.blocked.set(normalized.key,{...normalized,credentials:new Set((entry.credentials||[]).filter(token=>/^[a-f0-9]{64}$/.test(token)))});
    }
    for(const entry of Array.isArray(saved.revoked)?saved.revoked:[]){
      if(/^[a-f0-9]{64}$/.test(entry.credential)&&entry.until>Date.now())restored.revoked.set(entry.credential,{code:'KICKED',until:entry.until});
    }
    for(const entry of Array.isArray(saved.sessions)?saved.sessions:[]){
      const normalized=normalizeName(entry.name);
      const until=entry.reservedUntil||Number(entry.lastSeen)+GRACE_MS;
      if(normalized&&/^[a-f0-9]{64}$/.test(entry.credential)&&until>Date.now()&&!restored.blocked.has(normalized.key)){
        restored.sessions.set(normalized.key,{...normalized,credential:entry.credential,member:null,lastSeen:Number(entry.lastSeen)||Date.now(),reservedUntil:Math.min(until,Date.now()+GRACE_MS)});
      }
    }
  }catch{restored.storageWarning='Player blocks and reconnects could not be restored.';}
  return restored;
}
function persist(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,
      sessions:[...state.sessions.values()].map(({name,credential,lastSeen,reservedUntil})=>({name,credential,lastSeen,reservedUntil})),
      blocked:[...state.blocked.values()].map(({name,credentials})=>({name,credentials:[...credentials]})),
      revoked:[...state.revoked].map(([credential,value])=>({credential,...value}))
    }));
    state.storageWarning='';
  }catch{state.storageWarning='Player blocks are active, but browser storage is unavailable; blocks will not survive a host restart.';}
}
function sweep(){
  let changed=false;
  for(const [key,session] of state.sessions){
    if(!session.member&&session.reservedUntil<=Date.now()){state.sessions.delete(key);changed=true;}
  }
  for(const [credential,value] of state.revoked){
    if(value.until<=Date.now()){state.revoked.delete(credential);changed=true;}
  }
  if(changed)persist();
}
function send(member,value){
  if(member.channel?.readyState!=='open')return false;
  try{member.channel.send(JSON.stringify(value));return true;}catch{return false;}
}
function press(key,down,member){
  if(!Object.hasOwn(keys,key))return;
  const own=member.held;
  if(down&&own.has(key)||!down&&!own.has(key))return;
  if(down)own.add(key);else own.delete(key);
  const previous=heldByKey.get(key)||0;
  const next=previous+(down?1:-1);
  if(next>0)heldByKey.set(key,next);else heldByKey.delete(key);
  if(down&&previous>0||!down&&next>0)return;
  const canvas=document.querySelector('#nexus-canvas');
  canvas?.focus();
  canvas?.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key,code:keys[key],bubbles:true,cancelable:true}));
}
function cleanupMember(member){
  if(!members.delete(member))return;
  member.admitted=false;
  clearInterval(member.timer);
  clearTimeout(member.deadline);
  clearTimeout(member.disconnectTimer);
  clearTimeout(member.closeTimer);
  for(const key of [...member.held])press(key,false,member);
  if(member.track)member.track.enabled=false;
  const session=member.session;
  // A reconnect may already own this identity. The old peer cannot reserve
  // or disconnect its replacement when its close event eventually arrives.
  if(session?.member===member){
    session.member=null;
    session.reservedUntil=Date.now()+GRACE_MS;
    persist();
  }
  if(member.channel){member.channel.onclose=null;member.channel.onmessage=null;try{member.channel.close();}catch{}}
  if(member.peer){member.peer.onconnectionstatechange=null;try{member.peer.close();}catch{}}
  try{member.track?.stop();}catch{}
  renderOperator();
}
function cleanup(){for(const member of [...members])cleanupMember(member);}
function deny(member,code,message,type='admission-denied'){
  if(member.closing)return;
  member.closing=true;
  member.admitted=false;
  if(member.track)member.track.enabled=false;
  for(const key of [...member.held])press(key,false,member);
  send(member,{type,code,message});
  // Give the ordered channel a chance to deliver the reason, while input and
  // game video are already disabled. Cleanup remains bounded on a lost peer.
  member.closeTimer=setTimeout(()=>cleanupMember(member),150);
}
function kick(session){
  state.revoked.set(session.credential,{code:'KICKED',until:Date.now()+86400000});
  state.sessions.delete(session.key);
  if(session.member)deny(session.member,'KICKED','Removed from the game by the operator.','revoked');
  persist();renderOperator();
}
function block(session){
  const record=state.blocked.get(session.key)||{key:session.key,name:session.name,credentials:new Set()};
  record.credentials.add(session.credential);
  state.blocked.set(session.key,record);
  state.sessions.delete(session.key);
  if(session.member)deny(session.member,'BLOCKED','This player is blocked by the operator.','revoked');
  persist();renderOperator();
}
function unblock(key){state.blocked.delete(key);persist();renderOperator();}
function renderOperator(){
  if(!document.body||!document.querySelector('#nexus-canvas')||!['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname))return;
  let root=state.operator;
  if(!root?.isConnected){
    root=document.createElement('section');
    root.id='hollow-stream-operator';
    root.setAttribute('aria-label','Playtest players');
    document.body.append(root);
    state.operator=root;
  }
  const heading=document.createElement('h2');heading.textContent='Playtest players';
  const note=document.createElement('p');note.textContent='Shared game · '+[...state.sessions.values()].filter(s=>s.member?.admitted).length+' / '+MAX_PLAYERS+' connected';
  const nodes=[heading,note];
  if(state.storageWarning){const warning=document.createElement('p');warning.textContent=state.storageWarning;nodes.push(warning);}
  for(const session of state.sessions.values()){
    const row=document.createElement('div');
    const label=document.createElement('span');label.textContent=session.name+(session.member?.admitted?' · connected':' · reconnect reserved');
    const remove=document.createElement('button');remove.type='button';remove.textContent='Kick '+session.name;remove.onclick=()=>kick(session);
    const ban=document.createElement('button');ban.type='button';ban.textContent='Block '+session.name;ban.onclick=()=>block(session);
    row.append(label,remove,ban);nodes.push(row);
  }
  for(const entry of state.blocked.values()){
    const button=document.createElement('button');button.type='button';button.textContent='Unblock '+entry.name;button.onclick=()=>unblock(entry.key);nodes.push(button);
  }
  root.replaceChildren(...nodes);
}
function admit(member,message){
  if(member.admitted||member.closing)return;
  sweep();
  const normalized=normalizeName(message.name);
  if(!normalized){deny(member,'INVALID_NAME','Enter a name from 1 to 64 characters.');return;}
  const credential=typeof message.credential==='string'?message.credential:'';
  if(state.blocked.has(normalized.key)||[...state.blocked.values()].some(entry=>entry.credentials.has(credential))){
    deny(member,'BLOCKED','This player is blocked by the operator.');return;
  }
  if(state.revoked.has(credential)){deny(member,'KICKED','Removed from the game by the operator. Join again to start a new session.');return;}
  let session=state.sessions.get(normalized.key);
  if(session&&session.credential!==credential){deny(member,'NAME_TAKEN','That name is already in use.');return;}
  // A reconnect credential carries the same identity across a name change.
  // Renaming to an available name replaces only that identity's old peer.
  const credentialOwner=credential&&[...state.sessions.values()].find(s=>s.credential===credential);
  const rename=Boolean(credentialOwner&&credentialOwner!==session);
  if(rename)session=credentialOwner;
  const connected=[...members].filter(m=>m.admitted).length;
  if(!session?.member&&connected>=MAX_PLAYERS){deny(member,'FULL','The shared game already has eight players.');return;}
  if(!session){
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    session={...normalized,credential:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),member:null,lastSeen:Date.now(),reservedUntil:0};
    state.sessions.set(session.key,session);
  }else if(rename){
    state.sessions.delete(session.key);
    session.name=normalized.name;session.key=normalized.key;
    state.sessions.set(session.key,session);
  }
  const previous=session.member;
  session.member=member;session.lastSeen=Date.now();session.reservedUntil=0;
  member.session=session;member.admitted=true;member.lastSeen=Date.now();
  clearTimeout(member.deadline);
  if(previous&&previous!==member)cleanupMember(previous);
  if(!send(member,{type:'admitted',name:session.name,credential:session.credential,graceMs:GRACE_MS})){cleanupMember(member);return;}
  member.track.enabled=true;
  persist();renderOperator();member.update();
}

const buttons=new WeakMap();
let serial=0;
let previousMeta,nextMetaCheck=0;

async function hostNeedsReload() {
  const response = await fetch('/holosoul/meta', {cache:'no-store', signal:AbortSignal.timeout(2500)});
  if (!response.ok) return false;
  const current = await response.json();
  if (current.protocol !== 'experimental-two-body-transfer-preparation-play.r1' ||
      !Number.isSafeInteger(current.generation) || !Number.isSafeInteger(current.nextRequestId)) return false;
  const previous = previousMeta;
  previousMeta = current;
  if (current.closed || current.frozen) return false;
  const cursorReset = previous && (current.generation < previous.generation ||
    (current.generation === previous.generation && current.nextRequestId < previous.nextRequestId));
  const status = document.querySelector('#holosoul-status')?.textContent || '';
  const refusedBinding = /\b(?:CLOSE_METADATA_UNCONFIRMED|REFRESH_METADATA_UNCONFIRMED)\b/.test(status);
  return Boolean(cursorReset || refusedBinding);
}

function panel(){
  const region=[...document.querySelectorAll('#hollow-opening-choice,#holosoul-development')].find(x=>x.getClientRects().length);
  const choices=region?[...region.querySelectorAll('button')].filter(x=>!x.disabled && x.getClientRects().length && !x.textContent.startsWith('TEST fixture')):[];
  const actions=choices.map(el=>{if(!buttons.has(el))buttons.set(el,++serial);return {id:buttons.get(el),name:el.textContent.trim()}});
  const status=region?.querySelector('#holosoul-status')?.textContent || '';
  const notice=status.startsWith('Hollow game-only close confirmed.')?'Game saved and closed.':
    /^(?:Resumed |Display or request error:)/.test(status)?status:'';
  const selected = region?.querySelector('#holosoul-room-targets button[aria-pressed="true"]');
  const guidance = choices.includes(selected) ? selected.nextElementSibling?.textContent?.trim() || '' : '';
  // NPC speech is in the host HUD, outside the streamed canvas. Only mirror
  // the active actor's visible consequence, never the expandable save history.
  const consequence = region?.querySelector('#holosoul-latest-consequence');
  const paragraphs = consequence?.getClientRects().length
    ? Array.from(consequence.querySelectorAll(':scope > p'), el => el.textContent.trim())
    : [];
  // The HUD uses a single paragraph when no dialogue record is available.
  const storyLines = paragraphs.length > 1 ? paragraphs.filter(Boolean) : [];
  const revision = /\brevision (\d+)\b/i.exec(status)?.[1] || '';
  return {choices,actions,notice,guidance,storyLines,revision,heading:region?.querySelector('h2')?.textContent||'Arcade',objective:region?.querySelector('#hollow-next-objective')?.textContent||''};
}
async function answer(incoming){
  if(!incoming||typeof incoming.id!=='string'&&typeof incoming.id!=='number'||incoming.offer?.type!=='offer')throw Error('Invalid stream offer');
  if([...members].some(member=>member.id===incoming.id))return;
  // Pending handshakes are separate from the eight admitted slots so a
  // reconnect can replace its old peer even while the room is full.
  if([...members].filter(member=>!member.admitted).length>=8)throw Error('Too many pending stream connections');
  const member={id:incoming.id,peer:null,track:null,channel:null,timer:null,deadline:null,disconnectTimer:null,closeTimer:null,held:new Set(),session:null,admitted:false,closing:false,lastSeen:Date.now(),lastPersist:0};
  members.add(member);
  member.deadline=setTimeout(()=>cleanupMember(member),45000);
  try{
    const peer=member.peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});
    const canvas=document.querySelector('#nexus-canvas');
    if(!canvas)throw Error('The game canvas is unavailable');
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    const info=gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl?'WebGL':'Canvas 2D';
    member.track=canvas.captureStream(30).getVideoTracks()[0];
    if(!member.track)throw Error('The game stream has no video track');
    member.track.enabled=false;
    peer.addTrack(member.track,new MediaStream([member.track]));
    peer.onconnectionstatechange=()=>{
      if(['closed','failed'].includes(peer.connectionState)){cleanupMember(member);return;}
      clearTimeout(member.disconnectTimer);
      if(peer.connectionState==='disconnected'){
        for(const key of [...member.held])press(key,false,member);
        member.disconnectTimer=setTimeout(()=>cleanupMember(member),20000);
      }
    };
    peer.ondatachannel=e=>{
      const ch=e.channel;
      if(member.channel||ch.label!=='game'){try{ch.close();}catch{}return;}
      member.channel=ch;
      let previous='';
      member.update=()=>{
        if(!member.admitted||member.closing||ch.readyState!=='open')return;
        if(Date.now()-member.lastSeen>HEARTBEAT_MS){cleanupMember(member);return;}
        const {actions,heading,objective,notice,guidance,storyLines,revision}=panel();
        const next=JSON.stringify({actions,heading,objective,notice,guidance,storyLines,revision,renderer});
        if(next!==previous){try{ch.send(next);previous=next;}catch{cleanupMember(member);}}
      };
      ch.onopen=()=>{
        if(!members.has(member)||member.opened)return;
        member.opened=true;
        clearTimeout(member.deadline);
        member.deadline=setTimeout(()=>deny(member,'INVALID_NAME','Enter a name to join the game.'),ADMISSION_MS);
        send(member,{type:'admission-required',protocol:1});
        member.timer=setInterval(member.update,250);
      };
      ch.onclose=()=>cleanupMember(member);
      ch.onmessage=({data})=>{try{
        if(!members.has(member)||member.closing||typeof data!=='string'||data.length>2048)return;
        const q=JSON.parse(data);
        if(!q||typeof q!=='object'||Array.isArray(q))return;
        if(q.type==='admit'){admit(member,q);return;}
        if(!member.admitted)return;
        member.lastSeen=Date.now();member.session.lastSeen=member.lastSeen;
        if(member.lastSeen-member.lastPersist>5000){member.lastPersist=member.lastSeen;persist();}
        if(q.type==='ping'){send(member,{type:'pong'});return;}
        if(typeof q.down==='boolean')press(q.key,q.down,member);
        if(Number.isSafeInteger(q.action))panel().choices.find(el=>buttons.get(el)===q.action)?.click();
      }catch{}};
      if(ch.readyState==='open')ch.onopen();
    };
    await peer.setRemoteDescription(incoming.offer);
    const reply=await gather(peer,await peer.createAnswer());
    if(!members.has(member))return;
    await api('answer',{id:incoming.id,answer:reply});
  }catch(error){cleanupMember(member);throw error;}
}

// The game owner and its canvas stay mounted across stream releases.
export const transport={answer,cleanup};
async function publishedTransport(){
  const url=new URL(import.meta.url);url.search='';
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw Error('Host module unavailable');
  const bytes=await response.arrayBuffer();
  if(!new TextDecoder().decode(bytes.slice(0,64)).startsWith('// Hollow Soul stream transport v1'))throw Error('Incompatible host transport');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  url.searchParams.set('hs-transport',Array.from(digest,b=>b.toString(16).padStart(2,'0')).join(''));
  const release=await import(url.href);
  if(typeof release.transport?.answer!=='function'||typeof release.transport?.cleanup!=='function')throw Error('Host transport missing');
  return release.transport;
}
async function listen(){
  let active=transport,answered,attemptId,attempts=0;
  for(;;){
    try{
      sweep();
      const pending=await api('pending');
      if((pending&&pending.id!==answered)||Date.now()>=nextMetaCheck){
        nextMetaCheck=Date.now()+5000;
        renderOperator();
        if(await hostNeedsReload().catch(()=>false)){
          active.cleanup();location.reload();break;
        }
      }
      if(pending&&pending.id!==answered){
        if(pending.id!==attemptId){attemptId=pending.id;attempts=0;}
        const next=await publishedTransport().catch(()=>active);
        if(next!==active){active.cleanup();active=next;}
        try{
          await active.answer(pending);
          answered=pending.id;
        }catch(error){
          // Retry transient negotiation/signalling errors. A broken offer
          // still has a bounded lifetime and cannot monopolize the poller.
          if(++attempts>=3)answered=pending.id;
          throw error;
        }
      }
    }catch{}
    await delay(900);
  }
}
sweep();renderOperator();
if(!new URL(import.meta.url).searchParams.has('hs-transport'))await listen();
