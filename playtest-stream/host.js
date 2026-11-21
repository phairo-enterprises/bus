import {api,delay,gather} from './rtc.js';
const keys={w:'KeyW',a:'KeyA',s:'KeyS',d:'KeyD',e:'KeyE',j:'KeyJ',k:'KeyK','.':'Period',Enter:'Enter',Escape:'Escape'};
let peer,track,channel,timer;
const held=new Set();
function press(key,down){
  if(!Object.hasOwn(keys,key))return;
  const canvas=document.querySelector('#nexus-canvas');
  canvas.focus();
  canvas.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key,code:keys[key],bubbles:true,cancelable:true}));
  if(down)held.add(key);else held.delete(key);
}
function cleanup(){
  clearInterval(timer);
  for(const key of [...held])press(key,false);
  if(channel){channel.onclose=null;channel.close();channel=null}
  peer?.close();track?.stop();
}
const buttons=new WeakMap();
let serial=0;
let previousMeta, nextMetaCheck=0;

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
  cleanup();
  peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});
  const canvas=document.querySelector('#nexus-canvas');
  const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  const info=gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl?'WebGL':'Canvas 2D';
  track=canvas.captureStream(30).getVideoTracks()[0];
  peer.addTrack(track,new MediaStream([track]));
  peer.ondatachannel=e=>{
    const ch=e.channel;channel=ch;let previous='';
    function update(){
      if(ch.readyState!=='open')return;
      const {actions,heading,objective,notice,guidance,storyLines,revision}=panel();
      const next=JSON.stringify({actions,heading,objective,notice,guidance,storyLines,revision,renderer});
      if(next!==previous){ch.send(next);previous=next}
    }
    ch.onopen=()=>{update();timer=setInterval(update,250)};
    ch.onclose=()=>{for(const k of [...held])press(k,false);clearInterval(timer)};
    ch.onmessage=({data})=>{try{
      if(typeof data!=='string'||data.length>256)return;
      const q=JSON.parse(data);
      if(typeof q.down==='boolean')press(q.key,q.down);
      if(Number.isSafeInteger(q.action))panel().choices.find(el=>buttons.get(el)===q.action)?.click();
    }catch{}};
  };
  await peer.setRemoteDescription(incoming.offer);
  const reply=await gather(peer,await peer.createAnswer());
  await api('answer',{id:incoming.id,answer:reply});
}
let answered;
for(;;){
  try {
    const pending = await api('pending');
    if ((pending && pending.id !== answered) || Date.now() >= nextMetaCheck) {
      nextMetaCheck = Date.now() + 5000;
      if (await hostNeedsReload().catch(()=>false)) {
        // A replacement engine owns the save. Bind a fresh page without resending the last input.
        cleanup();
        location.reload();
        break;
      }
    }
    if (pending && pending.id !== answered) {
      await answer(pending);
      answered = pending.id;
    }
  } catch {}
  await delay(900);
}
