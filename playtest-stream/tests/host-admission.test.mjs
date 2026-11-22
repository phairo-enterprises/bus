import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=await readFile(new URL('../host.js',import.meta.url),'utf8');

async function harness({storage=new Map(),hostname='127.0.0.1',storageFailure=false,listen=false,answerFailures=0}={}){
  let now=1000000,nextTimer=0,nextPeer=0,version=0;
  const timers=new Map(),peers=[],tracks=[],events=[],published=[];
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.parent=null;this.value='';this._text='';this.attributes={};}
    get isConnected(){return this===body||Boolean(this.parent?.isConnected);}
    set textContent(value){this._text=value;this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this._text='';this.append(...children);}
    setAttribute(name,value){this.attributes[name]=value;}
    getClientRects(){return [{}];}
    querySelectorAll(selector){if(selector==='button')return this.children.filter(child=>child.tagName==='button');return [];}
    querySelector(selector){return this.named?.[selector]||null;}
    click(){this.onclick?.();}
    focus(){}
    dispatchEvent(event){events.push(event);}
  }
  const body=new Element('body'),canvas=new Element('canvas'),region=new Element('section');
  body.append(canvas,region);
  const action=new Element('button');action.textContent='Wait';action.disabled=false;action.onclick=()=>{action.clicks=(action.clicks||0)+1;};region.append(action);
  const heading=new Element('h2');heading.textContent='Mill Verge';
  const status=new Element('p');status.textContent='revision 821';
  region.named={'h2':heading,'#holosoul-status':status};
  canvas.getContext=()=>null;
  canvas.captureStream=()=>{
    const track={enabled:true,stopped:false,stop(){this.stopped=true;}};tracks.push(track);
    return {getVideoTracks:()=>[track]};
  };
  const document={body,createElement:tag=>new Element(tag),querySelector:selector=>selector==='#nexus-canvas'?canvas:selector==='#holosoul-status'?status:null,
    querySelectorAll:selector=>selector==='#hollow-opening-choice,#holosoul-development'?[region]:[]};
  class Channel{
    constructor(){this.label='game';this.readyState='connecting';this.sent=[];}
    send(value){if(this.readyState!=='open')throw Error('closed');this.sent.push(JSON.parse(value));}
    open(){this.readyState='open';this.onopen?.();}
    close(){if(this.readyState==='closed')return;this.readyState='closed';this.onclose?.();}
    receive(value){this.onmessage?.({data:typeof value==='string'?value:JSON.stringify(value)});}
  }
  class Peer{
    constructor(){this.connectionState='new';peers.push(this);}
    addTrack(track){this.track=track;}
    async setRemoteDescription(description){this.remote=description;}
    async createAnswer(){return {type:'answer',sdp:'answer'};}
    close(){this.connectionState='closed';this.onconnectionstatechange?.();}
    change(value){this.connectionState=value;this.onconnectionstatechange?.();}
  }
  function schedule(fn,ms,interval){const id=++nextTimer;timers.set(id,{fn,at:now+ms,interval});return id;}
  const context=vm.createContext({document,location:{hostname,reload(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(storageFailure)throw Error('storage denied');storage.set(key,value);}},
    crypto:webcrypto,Uint8Array,URL,TextDecoder,AbortSignal,RTCPeerConnection:Peer,MediaStream:class{constructor(trackList){this.tracks=trackList;}},
    KeyboardEvent:class{constructor(type,args){this.type=type;Object.assign(this,args);}},
    Date:class extends Date{static now(){return now;}},setTimeout:(fn,ms)=>schedule(fn,ms,0),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>schedule(fn,ms,ms),clearInterval:id=>timers.delete(id),console,
    fetch:async()=>({ok:true,json:async()=>({})})});
  async function load(){
    let answers=0,loops=0;
    const module=new vm.SourceTextModule(source,{context,identifier:'host-'+(++version),initializeImportMeta(meta){meta.url='http://127.0.0.1:4174/host.js'+(listen?'':'?hs-transport='+version);}});
    await module.link(()=>new vm.SyntheticModule(['api','delay','gather'],function(){
      this.setExport('api',async(name,value)=>{
        published.push({name,value});
        if(listen&&name==='pending')return {id:'retry-offer',offer:{type:'offer',sdp:'offer'}};
        if(listen&&name==='answer'&&++answers<=answerFailures)throw Error('Temporary signaling failure');
        return null;
      });
      this.setExport('delay',async()=>{if(listen&&++loops>=5)throw Error('STOP_TEST_LISTENER');});this.setExport('gather',async(peer,description)=>description);
    },{context}));
    if(listen)await assert.rejects(module.evaluate(),/STOP_TEST_LISTENER/);else await module.evaluate();
    return module.namespace.transport;
  }
  const transport=await load();
  async function connect(admission,selectedTransport=transport){
    await selectedTransport.answer({id:String(++nextPeer),offer:{type:'offer',sdp:'offer'}});
    const peer=peers.at(-1),channel=new Channel();peer.ondatachannel({channel});channel.open();
    if(admission)channel.receive({type:'admit',...admission});
    return {peer,channel,track:peer.track,get granted(){return channel.sent.find(message=>message.type==='admitted');},get denied(){return channel.sent.find(message=>message.type==='admission-denied');}};
  }
  function tick(ms){const target=now+ms;for(;;){
    const next=[...timers].filter(([,value])=>value.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next)break;now=next[1].at;if(next[1].interval)next[1].at+=next[1].interval;else timers.delete(next[0]);next[1].fn();
  }now=target;}
  function allButtons(element=body){return element.children.flatMap(child=>[...(child.tagName==='button'?[child]:[]),...allButtons(child)]);}
  function click(text){const button=allButtons().find(child=>child.textContent===text);assert.ok(button,'operator button '+text);button.click();}
  return {transport,connect,load,storage,events,published,tracks,peers,tick,click,action,body,allButtons};
}

test('admission gates canvas video, HUD and both input routes',async()=>{
  const h=await harness(),member=await h.connect();
  assert.equal(member.track.enabled,false);
  assert.deepEqual(member.channel.sent.map(message=>message.type),['admission-required']);
  member.channel.receive({key:'w',down:true});member.channel.receive({action:1});
  assert.equal(h.events.length,0);assert.equal(h.action.clicks||0,0);
  for(const malformed of ['{','null','[]','x'.repeat(3000)])member.channel.receive(malformed);
  member.channel.receive({type:'admit',name:'  Soul  '});
  assert.equal(member.granted.name,'Soul');assert.match(member.granted.credential,/^[a-f0-9]{64}$/);assert.equal(member.track.enabled,true);
  const state=member.channel.sent.find(message=>message.actions);
  assert.equal(state.revision,'821');assert.equal(JSON.stringify(state).includes(member.granted.credential),false);
  member.channel.receive({key:'w',down:true});member.channel.receive({action:state.actions[0].id});
  assert.equal(h.events[0].type,'keydown');assert.equal(h.action.clicks,1);
  h.transport.cleanup();
});

test('duplicate names are case and NFC insensitive; empty and excessive names fail',async()=>{
  const h=await harness();
  await h.connect({name:'Café'});
  const duplicate=await h.connect({name:'CAFE\u0301'});assert.equal(duplicate.denied.code,'NAME_TAKEN');assert.equal(duplicate.track.enabled,false);
  for(const name of ['   ','a'.repeat(65),'bad\u0000name'])assert.equal((await h.connect({name})).denied.code,'INVALID_NAME');
  h.transport.cleanup();
});

test('independent key holds survive one viewer disconnecting',async()=>{
  const h=await harness(),a=await h.connect({name:'A'}),b=await h.connect({name:'B'});
  a.channel.receive({key:'w',down:true});b.channel.receive({key:'w',down:true});
  assert.equal(h.events.length,1);
  a.channel.close();assert.equal(h.events.length,1);assert.equal(b.track.enabled,true);
  b.channel.receive({key:'w',down:false});assert.deepEqual(h.events.map(event=>event.type),['keydown','keyup']);
  h.transport.cleanup();
});

test('private reconnect replaces only its own peer, including a full room',async()=>{
  const h=await harness(),players=[];
  for(let i=0;i<8;i++)players.push(await h.connect({name:'Player '+i}));
  const extra=await h.connect({name:'Extra'});assert.equal(extra.denied.code,'FULL');
  const first=players[0],replacement=await h.connect({name:'Player 0',credential:first.granted.credential});
  assert.ok(replacement.granted);assert.equal(first.peer.connectionState,'closed');assert.equal(replacement.track.enabled,true);
  first.channel.close();h.tick(500);
  replacement.channel.receive({key:'w',down:true});assert.equal(h.events.at(-1).type,'keydown');
  assert.ok(players.slice(1).every(member=>member.track.enabled));
  h.transport.cleanup();
});

test('disconnect reserves name for sixty seconds then releases it',async()=>{
  const h=await harness(),a=await h.connect({name:'Soul'});a.channel.close();
  assert.equal((await h.connect({name:'Soul'})).denied.code,'NAME_TAKEN');
  h.tick(60001);
  assert.ok((await h.connect({name:'Soul'})).granted);
  h.transport.cleanup();
});

test('rename retains private identity and a conflicting name leaves both owners connected',async()=>{
  const h=await harness(),a=await h.connect({name:'Soul'}),b=await h.connect({name:'Other'});
  const conflict=await h.connect({name:'Other',credential:a.granted.credential});
  assert.equal(conflict.denied.code,'NAME_TAKEN');assert.equal(a.track.enabled,true);assert.equal(b.track.enabled,true);
  const renamed=await h.connect({name:'New name',credential:a.granted.credential});
  assert.equal(renamed.granted.name,'New name');assert.equal(renamed.granted.credential,a.granted.credential);
  assert.equal(a.peer.connectionState,'closed');assert.equal(b.track.enabled,true);
  assert.ok((await h.connect({name:'Soul'})).granted);
  h.click('Block New name');
  assert.equal((await h.connect({name:'Another name',credential:renamed.granted.credential})).denied.code,'BLOCKED');
  h.transport.cleanup();
});

test('kick revokes live input; block persists and operator can unblock',async()=>{
  const h=await harness(),a=await h.connect({name:'Soul'});
  a.channel.receive({key:'w',down:true});h.click('Kick Soul');
  assert.equal(a.track.enabled,false);assert.equal(a.channel.sent.at(-1).type,'revoked');assert.equal(a.channel.sent.at(-1).code,'KICKED');
  const before=h.events.length;a.channel.receive({key:'j',down:true});assert.equal(h.events.length,before);
  assert.equal((await h.connect({name:'Soul',credential:a.granted.credential})).denied.code,'KICKED');
  h.tick(200);
  const b=await h.connect({name:'Soul'});assert.ok(b.granted);h.click('Block Soul');
  assert.equal((await h.connect({name:'Other',credential:b.granted.credential})).denied.code,'BLOCKED');
  h.transport.cleanup();
  const restarted=await harness({storage:h.storage});
  assert.equal((await restarted.connect({name:'Soul'})).denied.code,'BLOCKED');
  restarted.click('Unblock Soul');assert.ok((await restarted.connect({name:'Soul'})).granted);
  restarted.transport.cleanup();
});

test('versioned module handover retains credentials and blocks',async()=>{
  const h=await harness(),a=await h.connect({name:'Soul'}),b=await h.connect({name:'Blocked'});h.click('Block Blocked');
  const next=await h.load();h.transport.cleanup();
  assert.equal((await h.connect({name:'Soul'},next)).denied.code,'NAME_TAKEN');
  const resumed=await h.connect({name:'Soul',credential:a.granted.credential},next);assert.ok(resumed.granted);
  assert.equal((await h.connect({name:'Blocked'},next)).denied.code,'BLOCKED');
  next.cleanup();
});

test('stale unauthenticated peers are reclaimed; heartbeat keeps a player active',async()=>{
  const h=await harness(),waiting=await h.connect();h.tick(15200);assert.equal(waiting.peer.connectionState,'closed');
  const a=await h.connect({name:'Soul'});
  for(let i=0;i<30;i++){h.tick(5000);a.channel.receive({type:'ping'});}
  assert.equal(a.track.enabled,true);assert.equal(a.channel.sent.at(-1).type,'pong');
  a.peer.change('disconnected');h.tick(21000);assert.equal(a.peer.connectionState,'closed');
  assert.ok((await h.connect({name:'Soul',credential:a.granted.credential})).granted);
  h.transport.cleanup();
});

test('storage failures are visible and public origins have no operator controls',async()=>{
  const h=await harness({storageFailure:true});const a=await h.connect({name:'Soul'});assert.ok(a.granted);
  assert.match(h.body.textContent,/browser storage is unavailable/);h.transport.cleanup();
  const remote=await harness({hostname:'playtest.backupstrats.com'});await remote.connect({name:'Soul'});
  assert.equal(remote.allButtons().some(button=>button.textContent.startsWith('Kick ')),false);remote.transport.cleanup();
});

test('signaling retries a transient failed answer but stops a permanently broken offer',async()=>{
  for(const answerFailures of [2,10]){
    const h=await harness({listen:true,answerFailures});
    assert.equal(h.published.filter(call=>call.name==='answer').length,3);
    assert.equal(h.peers.length,3);
    assert.ok(h.peers.slice(0,2).every(peer=>peer.connectionState==='closed'));
    assert.equal(h.peers[2].connectionState,answerFailures===2?'new':'closed');
    h.transport.cleanup();
  }
});
