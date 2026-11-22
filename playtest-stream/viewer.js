import {api,delay,gather} from './rtc.js';
const status=document.querySelector('#status'), video=document.querySelector('video'), start=document.querySelector('#start'), actions=document.querySelector('#actions');
const controls=document.querySelector('#controls'), objective=document.querySelector('#objective');
const storageKey='hollow-soul-player-session-v1';
const normalizeName=value=>typeof value==='string'?value.trim().normalize('NFC'):'';
const nameKey=value=>normalizeName(value).toLowerCase();
const validName=value=>Boolean(value)&&[...value].length<=64;
const validCredential=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
let savedSession=null;
try{
  const saved=JSON.parse(localStorage.getItem(storageKey));
  if(saved&&validName(normalizeName(saved.name))&&validCredential(saved.credential))savedSession=saved;
}catch{}
function saveSession(value){
  savedSession=value;
  try{if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey)}catch{}
}
const nameEntry=document.createElement('div');
nameEntry.className='player-name';
const nameLabel=document.createElement('label');
nameLabel.textContent='Player name';
const nameInput=document.createElement('input');
nameInput.id='player-name';
nameInput.type='text';
nameInput.autocomplete='nickname';
nameInput.maxLength=128;
nameInput.spellcheck=false;
nameInput.value=savedSession?.name||'';
nameInput.setAttribute('aria-describedby','status');
nameLabel.append(nameInput);
nameEntry.append(nameLabel);
start.before(nameEntry);
start.textContent='Play';
status.setAttribute('aria-live','polite');
status.textContent='Choose a name to join.';
controls.hidden=true;
const guidance=document.createElement('p');
guidance.hidden=true;
objective.after(guidance);
const story=document.createElement('div');
story.setAttribute('aria-live','polite');
story.setAttribute('aria-atomic','true');
story.hidden=true;
guidance.after(story);
let previousStory='';
function showStory(lines){
  const next=Array.isArray(lines)?lines.filter(line=>typeof line==='string'&&line.trim()):[];
  const serialized=JSON.stringify(next);
  if(serialized===previousStory)return;
  previousStory=serialized;
  story.hidden=next.length===0;
  story.replaceChildren(...next.map(line=>{
    const p=document.createElement('p');
    p.textContent=line;
    return p;
  }));
}
let current=null, kickedCredential='';
const keys=new Set(['w','a','s','d','e','j','k','.','Enter','Escape']);
const held=new Set();
function send(value){
  if(!current?.admitted||current.channel?.readyState!=='open')return false;
  try{current.channel.send(JSON.stringify(value));return true}catch{return false}
}
function key(value,down){
  if(down===held.has(value))return;
  if(down){if(send({key:value,down}))held.add(value)}
  else{send({key:value,down});held.delete(value)}
}
function releaseKeys(){for(const value of [...held])key(value,false)}
function clearControls(){
  held.clear();
  actions.replaceChildren();
  objective.textContent='';
  guidance.textContent='';
  guidance.hidden=true;
  showStory([]);
  controls.hidden=true;
  video.srcObject=null;
}
window.addEventListener('blur',releaseKeys);
window.addEventListener('pagehide',()=>current?.close('Disconnected. Reconnect to play.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseKeys()});
for(const down of [true,false])window.addEventListener(down?'keydown':'keyup',event=>{
  if(!keys.has(event.key))return;
  // Always release an existing hold, including after focus moves into a field.
  if(!down&&held.has(event.key)){event.preventDefault();key(event.key,false);return}
  if(!current?.admitted||event.repeat||event.altKey||event.metaKey||event.ctrlKey||
     event.target?.closest('input,textarea,select,[contenteditable]')||
     event.target?.closest('button')&&event.key==='Enter')return;
  event.preventDefault();key(event.key,down);
});
for(const element of document.querySelectorAll('[data-key]')){
  element.onpointerdown=event=>{
    if(!current?.admitted)return;
    event.preventDefault();
    try{element.setPointerCapture(event.pointerId)}catch{}
    key(element.dataset.key,true);
  };
  element.onpointerup=element.onpointercancel=element.onlostpointercapture=()=>key(element.dataset.key,false);
}
nameInput.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!start.disabled){event.preventDefault();start.click()}
});
const denialMessages={
  NAME_TAKEN:'That name is already in use. Choose another name.',
  BLOCKED:'This player is blocked from the playtest.',
  FULL:'The playtest is full. Try again shortly.',
  INVALID_NAME:'Enter a name of 1–64 characters.',
  KICKED:'Removed from the playtest. Select Join again to return.'
};
start.onclick=async()=>{
  if(start.disabled)return;
  const name=normalizeName(nameInput.value);
  if(!validName(name)){
    status.textContent=denialMessages.INVALID_NAME;
    nameInput.focus();
    return;
  }
  nameInput.value=name;
  // The explicit Join again click starts a new session after a kick.
  if(kickedCredential&&savedSession?.credential===kickedCredential)saveSession(null);
  kickedCredential='';
  current?.close('Reconnecting…');
  const attempt={peer:null,channel:null,admitted:false,closed:false,challenge:false,stream:null,heartbeat:null,admissionTimer:null,deadline:null};
  const active=()=>current===attempt&&!attempt.closed;
  attempt.close=(message,code='')=>{
    if(!active())return;
    releaseKeys();
    attempt.closed=true;
    attempt.admitted=false;
    clearTimeout(attempt.deadline);
    clearTimeout(attempt.admissionTimer);
    clearInterval(attempt.heartbeat);
    current=null;
    if(attempt.channel){attempt.channel.onopen=null;attempt.channel.onmessage=null;attempt.channel.onclose=null;attempt.channel.onerror=null;try{attempt.channel.close()}catch{}}
    if(attempt.peer){attempt.peer.ontrack=null;attempt.peer.onconnectionstatechange=null;try{attempt.peer.close()}catch{}}
    clearControls();
    status.textContent=message;
    status.title='';
    nameEntry.hidden=false;
    nameInput.disabled=false;
    start.disabled=false;
    start.hidden=false;
    start.textContent=code==='KICKED'?'Join again':'Reconnect';
    if(code==='KICKED')kickedCredential=attempt.credential||'';
  };
  current=attempt;
  clearControls();
  start.disabled=true;
  nameInput.disabled=true;
  status.textContent='Connecting to Hollow Soul…';
  attempt.deadline=setTimeout(()=>attempt.close('The game took too long to answer. Try again.'),65000);
  try{
    const config=await api('config');
    if(!active())return;
    if(!config?.hostReady)throw Error('The game is offline. Try again shortly.');
    const peer=attempt.peer=new RTCPeerConnection({iceServers:config.iceServers});
    peer.addTransceiver('video',{direction:'recvonly'});
    peer.ontrack=event=>{
      if(!active())return;
      attempt.stream=new MediaStream([event.track]);
      if(attempt.admitted){video.srcObject=attempt.stream;video.play().catch(()=>{})}
    };
    peer.onconnectionstatechange=()=>{
      if(['closed','failed','disconnected'].includes(peer.connectionState))attempt.close('Connection lost. Reconnect to play.');
    };
    const game=attempt.channel=peer.createDataChannel('game');
    game.onopen=()=>{
      if(!active())return;
      status.textContent='Joining the shared game…';
      attempt.admissionTimer=setTimeout(()=>attempt.close('The game host needs an update before joining is available.'),10000);
    };
    game.onclose=()=>attempt.close('Game connection closed. Reconnect to play.');
    game.onerror=()=>attempt.close('Game connection failed. Reconnect to play.');
    game.onmessage=event=>{
      if(!active())return;
      try{
        if(typeof event.data!=='string'||event.data.length>262144)throw Error('Invalid game message.');
        let message;
        try{message=JSON.parse(event.data)}catch{throw Error('Invalid game message.')}
        if(!message||typeof message!=='object')throw Error('Invalid game message.');
        if(message.type==='admission-required'){
          if(message.protocol!==1)throw Error('The game host needs an update before joining is available.');
          if(attempt.admitted||attempt.challenge)return;
          attempt.challenge=true;
          // A new label keeps the same private identity, including its blocks.
          const credential=savedSession?.credential;
          attempt.credential=credential;
          game.send(JSON.stringify({type:'admit',name,...(credential?{credential}:{})}));
          return;
        }
        if(message.type==='admitted'){
          if(!attempt.challenge||attempt.admitted||nameKey(message.name)!==nameKey(name)||!validCredential(message.credential))throw Error('Invalid admission response.');
          saveSession({name:normalizeName(message.name),credential:message.credential});
          attempt.credential=message.credential;
          nameInput.value=savedSession.name;
          attempt.admitted=true;
          clearTimeout(attempt.admissionTimer);
          clearTimeout(attempt.deadline);
          status.textContent='Connected as '+savedSession.name;
          nameEntry.hidden=true;
          start.hidden=true;
          controls.hidden=false;
          if(attempt.stream){video.srcObject=attempt.stream;video.play().catch(()=>{})}
          video.focus();
          attempt.heartbeat=setInterval(()=>{if(active()&&!send({type:'ping'}))attempt.close('Connection lost. Reconnect to play.')},5000);
          return;
        }
        if(message.type==='admission-denied'||message.type==='revoked'){
          attempt.close(denialMessages[message.code]||'Unable to join the playtest. Try again.',message.code);
          return;
        }
        if(message.type==='pong')return;
        if(!attempt.admitted)throw Error('The game host needs an update before joining is available.');
        if(message.type||!Array.isArray(message.actions)||typeof message.heading!=='string'||typeof message.objective!=='string')throw Error('Invalid game message.');
        const available=message.actions.filter(action=>action&&Number.isSafeInteger(action.id)&&typeof action.name==='string');
        document.querySelector('h1').textContent=message.heading;
        objective.textContent=message.objective;
        guidance.textContent=typeof message.guidance==='string'?message.guidance:'';
        guidance.hidden=!guidance.textContent;
        showStory(message.storyLines);
        const connected='Connected as '+savedSession.name;
        status.textContent=typeof message.notice==='string'&&message.notice?message.notice:(message.revision?connected+' · Action '+message.revision:connected);
        status.title=typeof message.renderer==='string'?message.renderer:'';
        actions.replaceChildren(...available.map(action=>{
          const button=document.createElement('button');
          button.textContent=action.name;
          button.onclick=()=>{if(active()&&attempt.admitted)send({action:action.id})};
          return button;
        }));
      }catch(error){
        const safeMessages=new Set(['Invalid game message.','Invalid admission response.','The game host needs an update before joining is available.']);
        attempt.close(safeMessages.has(error.message)?error.message:'The game sent an invalid response. Reconnect to play.');
      }
    };
    const offer=await gather(peer,await peer.createOffer());
    if(!active())return;
    const {id}=await api('join',{offer});
    if(!active())return;
    let answer;
    for(let index=0;index<60&&!answer&&active();index++){
      await delay(500);
      if(active())answer=await api('result',{id});
    }
    if(!active())return;
    if(!answer)throw Error('The game took too long to answer. Try again.');
    await peer.setRemoteDescription(answer);
    for(let index=0;index<80&&active()&&game.readyState!=='open';index++)await delay(250);
    if(active()&&game.readyState!=='open')throw Error('This network could not reach the game stream.');
  }catch(error){attempt.close(error?.message||'Unable to connect. Try again.')}
};
