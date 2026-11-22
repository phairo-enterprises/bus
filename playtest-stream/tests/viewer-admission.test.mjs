import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=(await readFile(new URL('../viewer.js',import.meta.url),'utf8')).replace(/^import .*\n/,'');
const credential='a'.repeat(64);
const storeKey='hollow-soul-player-session-v1';

function harness({saved,config,deferConfig=false}={}){
  const elements=[],windowEvents=new Map(),documentEvents=new Map(),timers=new Map(),peers=[],calls=[];
  let timerId=0,resolveConfig;
  class Element{
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.events=new Map();this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.dataset={};elements.push(this)}
    append(...items){for(const item of items){item.parent=this;this.children.push(item)}}
    before(item){item.parent=this.parent||null;this.beforeElement=item}
    after(item){item.parent=this.parent||null;this.afterElement=item}
    replaceChildren(...items){this.children=[];this.append(...items)}
    setAttribute(name,value){this.attributes[name]=String(value)}
    addEventListener(name,handler){const list=this.events.get(name)||[];list.push(handler);this.events.set(name,list)}
    closest(selector){return selector.split(',').some(part=>part.toUpperCase()===this.tagName||part==='[contenteditable]'&&this.attributes.contenteditable!==undefined)?this:null}
    focus(){this.focused=true}
    click(){return this.onclick?.()}
    setPointerCapture(){}
    play(){return Promise.resolve()}
  }
  const nodes={};
  for(const [selector,tag] of Object.entries({'#status':'p',video:'video','#start':'button','#actions':'div','#controls':'div','#objective':'p',h1:'h1'}))nodes[selector]=new Element(tag);
  const touch=new Element('button');touch.dataset.key='w';
  const document={
    hidden:false,
    createElement:tag=>new Element(tag),
    querySelector:selector=>nodes[selector]||elements.find(element=>'#'+element.id===selector),
    querySelectorAll:selector=>selector==='[data-key]'?[touch]:[],
    addEventListener(name,handler){documentEvents.set(name,handler)}
  };
  const window={
    addEventListener(name,handler){const list=windowEvents.get(name)||[];list.push(handler);windowEvents.set(name,list)}
  };
  class Channel{
    constructor(){this.readyState='connecting';this.sent=[]}
    send(value){assert.equal(this.readyState,'open');this.sent.push(JSON.parse(value))}
    close(){this.readyState='closed';this.onclose?.()}
    receive(value){this.onmessage?.({data:typeof value==='string'?value:JSON.stringify(value)})}
  }
  class Peer{
    constructor(){this.connectionState='new';peers.push(this)}
    addTransceiver(){}
    createDataChannel(){return this.channel=new Channel()}
    createOffer(){return Promise.resolve({type:'offer',sdp:'offer'})}
    async setRemoteDescription(answer){
      this.answer=answer;this.connectionState='connected';this.channel.readyState='open';
      this.channel.onopen?.();
      this.ontrack?.({track:{kind:'video'}});
    }
    close(){this.connectionState='closed';this.channel?.close();this.onconnectionstatechange?.()}
  }
  const storage=new Map();
  if(saved)storage.set(storeKey,JSON.stringify(saved));
  const configPromise=deferConfig?new Promise(resolve=>{resolveConfig=resolve}):null;
  const api=async(name,payload)=>{
    calls.push({name,payload});
    if(name==='config')return configPromise||config||{hostReady:true,iceServers:[]};
    if(name==='join')return{id:'join-'+peers.length};
    if(name==='result')return{type:'answer',sdp:'answer'};
    throw Error('Unexpected API call '+name);
  };
  function addTimer(fn,ms,repeat){const id=++timerId;timers.set(id,{fn,ms,repeat});return id}
  const context={
    document,window,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    RTCPeerConnection:Peer,MediaStream:class{constructor(tracks){this.tracks=tracks}},
    api,gather:async(_peer,offer)=>offer,delay:async()=>{},
    setTimeout:(fn,ms)=>addTimer(fn,ms,false),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>addTimer(fn,ms,true),clearInterval:id=>timers.delete(id),
    console
  };
  vm.runInNewContext(source,context,{filename:'viewer.js'});
  const nameInput=document.querySelector('#player-name');
  const fireWindow=(type,event={})=>{for(const handler of windowEvents.get(type)||[])handler(event)};
  const keyboard=(type,key,target=nodes.video)=>fireWindow(type,{key,target,preventDefault(){this.prevented=true}});
  const runTimers=ms=>{for(const [id,timer]of [...timers])if(timer.ms===ms){if(!timer.repeat)timers.delete(id);timer.fn()}};
  const enter=async(name='Soul')=>{nameInput.value=name;await nodes['#start'].click();return peers.at(-1)?.channel};
  function admit(channel,name='Soul',token=credential){
    channel.receive({type:'admission-required',protocol:1});
    channel.receive({type:'admitted',name,credential:token,graceMs:60000});
  }
  return{elements,nodes,nameInput,peers,calls,timers,storage,touch,enter,admit,keyboard,fireWindow,runTimers,resolveConfig,document,documentEvents};
}

test('requires a nonempty name and bounds Unicode code points before signaling',async()=>{
  const h=harness();
  await h.enter('  \n ');
  assert.equal(h.peers.length,0);
  assert.equal(h.calls.length,0);
  assert.match(h.nodes['#status'].textContent,/1–64/);
  await h.enter('😀'.repeat(65));
  assert.equal(h.calls.length,0);
  const ch=await h.enter('  '+'😀'.repeat(64)+'  ');
  ch.receive({type:'admission-required',protocol:1});
  assert.equal(ch.sent[0].name,'😀'.repeat(64));
});

test('waits for admission before showing video, controls, or transmitting gameplay',async()=>{
  const h=harness();
  const ch=await h.enter(' Soul ');
  assert.equal(h.nodes['#controls'].hidden,true);
  assert.equal(h.nodes.video.srcObject,null);
  h.keyboard('keydown','w');
  h.touch.onpointerdown({pointerId:1,preventDefault(){}});
  assert.equal(ch.sent.length,0);
  h.admit(ch);
  assert.equal(ch.sent[0].type,'admit');
  assert.equal(ch.sent[0].name,'Soul');
  assert.equal(h.nodes['#controls'].hidden,false);
  assert.ok(h.nodes.video.srcObject);
  assert.deepEqual(JSON.parse(h.storage.get(storeKey)),{name:'Soul',credential});
  assert.equal(h.timers.size,1);
  h.runTimers(5000);
  assert.equal(ch.sent.at(-1).type,'ping');
  assert.ok(h.elements.every(element=>!JSON.stringify([element.textContent,element.value,element.attributes]).includes(credential)));
});

test('old unadmitted state fails closed instead of enabling an anonymous player',async()=>{
  const h=harness(),ch=await h.enter();
  ch.receive({heading:'Hollow Soul',objective:'Walk',actions:[],revision:'821'});
  assert.equal(h.nodes['#controls'].hidden,true);
  assert.equal(h.nodes.video.srcObject,null);
  assert.equal(ch.readyState,'closed');
  assert.match(h.nodes['#status'].textContent,/host needs an update/);
  assert.equal(h.timers.size,0);
});

test('preserves story, guidance, revisions, actions and releases keyboard/touch holds',async()=>{
  const h=harness(),ch=await h.enter();
  h.admit(ch);
  ch.receive({heading:'Hollow Soul',objective:'Reach Waterline',guidance:'Repair the bike.',storyLines:['The bike is ready.','Ride to Waterline.'],revision:'821',renderer:'MAX',actions:[{id:12,name:'Ride'}]});
  assert.equal(h.nodes.h1.textContent,'Hollow Soul');
  assert.equal(h.nodes['#objective'].textContent,'Reach Waterline');
  assert.match(h.nodes['#status'].textContent,/Action 821/);
  assert.ok(h.elements.find(element=>element.textContent==='The bike is ready.'));
  h.nodes['#actions'].children[0].click();
  assert.deepEqual(ch.sent.at(-1),{action:12});
  h.keyboard('keydown','w');
  assert.deepEqual(ch.sent.at(-1),{key:'w',down:true});
  h.keyboard('keyup','w',h.nameInput);
  assert.deepEqual(ch.sent.at(-1),{key:'w',down:false});
  const count=ch.sent.length;
  h.keyboard('keydown','w',h.nameInput);
  assert.equal(ch.sent.length,count);
  h.touch.onpointerdown({pointerId:1,preventDefault(){}});
  h.touch.onlostpointercapture();
  assert.deepEqual(ch.sent.at(-1),{key:'w',down:false});
  h.keyboard('keydown','a');
  h.fireWindow('blur');
  assert.deepEqual(ch.sent.at(-1),{key:'a',down:false});
  h.keyboard('keydown','d');
  h.document.hidden=true;
  h.documentEvents.get('visibilitychange')();
  assert.deepEqual(ch.sent.at(-1),{key:'d',down:false});
});

test('duplicate rejection survives closing callbacks and leaves the name editable',async()=>{
  const h=harness(),ch=await h.enter();
  const closeHandler=ch.onclose;
  ch.receive({type:'admission-required',protocol:1});
  ch.receive({type:'admission-denied',code:'NAME_TAKEN',message:'Name occupied'});
  closeHandler();
  assert.match(h.nodes['#status'].textContent,/name is already in use/);
  assert.equal(h.nameInput.disabled,false);
  assert.equal(h.nodes['#start'].disabled,false);
  assert.equal(h.nodes['#controls'].hidden,true);
  assert.equal(h.timers.size,0);
  assert.equal(h.storage.has(storeKey),false);
});

test('the private identity follows normalized and changed names',async()=>{
  const saved={name:'Sól',credential};
  const h=harness({saved}),ch=await h.enter('  SO\u0301L  ');
  ch.receive({type:'admission-required',protocol:1});
  assert.equal(ch.sent[0].name,'SÓL');
  assert.equal(ch.sent[0].credential,credential);
  const other=harness({saved}),otherChannel=await other.enter('Hollow Soul');
  otherChannel.receive({type:'admission-required',protocol:1});
  assert.equal(otherChannel.sent[0].credential,credential);
  otherChannel.receive({type:'admitted',name:'Hollow Soul',credential,graceMs:60000});
  assert.deepEqual(JSON.parse(other.storage.get(storeKey)),{name:'Hollow Soul',credential});
});

test('disconnect returns a reconnect path and same-name return retains the credential',async()=>{
  const h=harness(),ch=await h.enter();
  h.admit(ch);
  h.keyboard('keydown','w');
  const staleActionState={heading:'Stale',objective:'Stale',actions:[]};
  const staleMessage=ch.onmessage;
  h.fireWindow('pagehide');
  assert.deepEqual(ch.sent.at(-1),{key:'w',down:false});
  assert.equal(h.timers.size,0);
  staleMessage({data:JSON.stringify(staleActionState)});
  assert.notEqual(h.nodes.h1.textContent,'Stale');
  const rejoined=await h.enter();
  rejoined.receive({type:'admission-required',protocol:1});
  assert.equal(rejoined.sent[0].credential,credential);
});

test('kick requires the explicit Join again click before dropping the old credential',async()=>{
  const h=harness(),ch=await h.enter();
  h.admit(ch);
  ch.receive({type:'revoked',code:'KICKED'});
  assert.equal(h.nodes['#start'].textContent,'Join again');
  assert.equal(JSON.parse(h.storage.get(storeKey)).credential,credential);
  assert.match(h.nodes['#status'].textContent,/Removed from the playtest/);
  const rejoined=await h.enter('New Soul');
  rejoined.receive({type:'admission-required',protocol:1});
  assert.equal('credential'in rejoined.sent[0],false);
  assert.equal(rejoined.sent[0].name,'New Soul');
  assert.equal(h.storage.has(storeKey),false);
});

test('blocked reason persists and renaming still supplies the blocked credential',async()=>{
  const h=harness(),ch=await h.enter();
  h.admit(ch);
  const onclose=ch.onclose;
  ch.receive({type:'revoked',code:'BLOCKED'});
  onclose();
  assert.match(h.nodes['#status'].textContent,/blocked/);
  assert.equal(h.timers.size,0);
  const retried=await h.enter('Different Name');
  retried.receive({type:'admission-required',protocol:1});
  assert.equal(retried.sent[0].credential,credential);
  assert.equal(retried.sent[0].name,'Different Name');
});

test('malformed input, unsolicited grants and incompatible protocols cleanly close',async()=>{
  for(const message of ['{broken',{type:'admitted',name:'Soul',credential},{type:'admission-required',protocol:2}]){
    const h=harness(),ch=await h.enter();
    ch.receive(message);
    assert.equal(ch.readyState,'closed');
    assert.equal(h.nodes['#controls'].hidden,true);
    assert.equal(h.timers.size,0);
    assert.equal(h.storage.has(storeKey),false);
  }
});

test('hung admission times out without enabling controls or leaking a heartbeat',async()=>{
  const h=harness(),ch=await h.enter();
  h.runTimers(10000);
  assert.equal(ch.readyState,'closed');
  assert.equal(h.timers.size,0);
  assert.match(h.nodes['#status'].textContent,/host needs an update/);
});

test('late config cannot resurrect an attempt closed by page navigation or its deadline',async()=>{
  for(const mode of ['pagehide','deadline']){
    const h=harness({deferConfig:true});
    const pending=h.enter();
    await Promise.resolve();
    if(mode==='pagehide')h.fireWindow('pagehide');else h.runTimers(65000);
    const message=h.nodes['#status'].textContent;
    h.resolveConfig({hostReady:true,iceServers:[]});
    await pending;
    assert.equal(h.peers.length,0);
    assert.equal(h.nodes['#status'].textContent,message);
    assert.equal(h.nodes['#start'].disabled,false);
    assert.equal(h.timers.size,0);
  }
});
