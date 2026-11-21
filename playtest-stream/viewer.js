import {api,delay,gather} from './rtc.js';
const status=document.querySelector('#status'), video=document.querySelector('video'), start=document.querySelector('#start'), actions=document.querySelector('#actions');
let pc,channel;
const keys=new Set(['w','a','s','d','e','j','k','.','Enter','Escape']);
function send(x){if(channel?.readyState==='open')channel.send(JSON.stringify(x))}
const held=new Set();
function key(k,down){send({key:k,down});if(down)held.add(k);else held.delete(k)}
window.onblur=()=>{for(const k of [...held])key(k,false)};
for(const down of [true,false])window.addEventListener(down?'keydown':'keyup',e=>{
  if(!keys.has(e.key)||channel?.readyState!=='open'||e.repeat||e.altKey||e.metaKey||e.ctrlKey||e.target.closest('button')&&e.key==='Enter')return;
  e.preventDefault();key(e.key,down);
});
for(const el of document.querySelectorAll('[data-key]')){
  el.onpointerdown=e=>{el.setPointerCapture(e.pointerId);key(el.dataset.key,true)};
  el.onpointerup=el.onpointercancel=()=>key(el.dataset.key,false);
}
start.onclick=async()=>{
  const previous=pc;
  pc=null;
  channel=null;
  previous?.close();
  let peer=null;
  const controls=document.querySelector('#controls'), objective=document.querySelector('#objective');
  function clearControls(){
    held.clear();
    actions.replaceChildren();
    objective.textContent='';
    controls.hidden=true;
    video.srcObject=null;
  }
  function disconnected(message){
    if(pc!==peer)return;
    pc=null;
    channel=null;
    peer?.close();
    clearControls();
    status.textContent=message;
    start.disabled=false;
    start.hidden=false;
  }
  clearControls();
  start.disabled=true;
  status.textContent='Connecting to the Alienware…';
  try{
    const config=await api('config');
    if(!config.hostReady)throw Error('The Alienware game window is offline.');
    pc=peer=new RTCPeerConnection({iceServers:config.iceServers});
    peer.addTransceiver('video',{direction:'recvonly'});
    peer.ontrack=e=>{
      if(pc!==peer)return;
      video.srcObject=new MediaStream([e.track]);
      video.play().catch(()=>{});
    };
    peer.onconnectionstatechange=()=>{
      if(['failed','disconnected'].includes(peer.connectionState))disconnected('Connection lost. Reconnect to play.');
    };
    const game=peer.createDataChannel('game');
    channel=game;
    game.onopen=()=>{
      if(pc!==peer)return;
      status.textContent='Connected to the Alienware';
      start.hidden=true;
      controls.hidden=false;
      video.focus();
    };
    game.onclose=()=>disconnected('Game connection closed. Connect to the current game.');
    game.onmessage=e=>{
      if(pc!==peer)return;
      const q=JSON.parse(e.data);
      document.querySelector('h1').textContent=q.heading;
      objective.textContent=q.objective;
      status.textContent=q.notice||'Connected to the Alienware';
      status.title=q.renderer||'';
      actions.replaceChildren(...q.actions.map(action=>{
        const button=document.createElement('button');
        button.textContent=action.name;
        button.onclick=()=>{if(channel===game)send({action:action.id})};
        return button;
      }));
    };
    const offer=await gather(peer,await peer.createOffer());
    const {id}=await api('join',{offer});
    let answer;
    for(let i=0;i<60&&!answer&&pc===peer;i++){
      await delay(500);
      if(pc===peer)answer=await api('result',{id});
    }
    if(pc!==peer)return;
    if(!answer)throw Error('The Alienware took too long to answer.');
    await peer.setRemoteDescription(answer);
    for(let i=0;i<80&&pc===peer&&game.readyState!=='open';i++)await delay(250);
    if(pc===peer&&game.readyState!=='open')throw Error('This network could not reach the Alienware stream.');
  }catch(e){disconnected(e.message)}
};
