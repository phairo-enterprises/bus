// Isolated browser/WebRTC fixture. No game engine, live save, or public deployment.
// Run: node playtest-stream/tests/rtc-harness.mjs [port; default 0]
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const port = Number(process.argv[2] ?? process.env.HS_RTC_HARNESS_PORT ?? 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Expected a port from 0 to 65535.');
const sessions = new Map();
let hostSeen = 0;
const style = `<style>
body{font:16px system-ui;background:#101720;color:#f5f7fb;max-width:960px;margin:24px auto;padding:0 20px}
button,input{font:inherit;padding:10px;margin:4px}button{cursor:pointer}canvas,video{width:640px;max-width:100%;height:auto;background:#000}
textarea{display:block;width:95%;height:160px;background:#071018;color:#a9efb9;font:14px monospace}
.fixture{background:#493411;padding:12px;border:1px solid #da9b24}section{margin:18px 0}p{line-height:1.4}[hidden]{display:none!important}
</style>`;
function page(title, body) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${style}<body><p class="fixture">Isolated WebRTC fixture — no live save. Counters and animated pixels are test instruments, not Hollow Soul gameplay.</p>${body}</body></html>`;
}
const hostPage = page('Hollow Soul RTC fixture host', `
<h1>WebRTC fixture host</h1><canvas id="nexus-canvas" width="640" height="360" tabindex="0" aria-label="Animated fixture canvas"></canvas>
<section id="holosoul-development"><h2>Shared WebRTC fixture</h2><p id="hollow-next-objective">Verify real media, independent input, name admission, and host blocking.</p>
<p id="holosoul-status">Fixture revision 0</p><button id="fixture-wait">Wait</button><button id="fixture-action">Fixture action</button>
<div id="holosoul-latest-consequence"><p>Isolated fixture instrumentation.</p><p>No game save is connected.</p></div></section>
<section><h2>Observed host input</h2><p id="fixture-counts">Actions: 0 · Keydowns: 0 · Keyups: 0</p><textarea id="fixture-log" readonly aria-label="Observed host input log"></textarea></section>
<script>
const canvas=document.querySelector('#nexus-canvas'), ctx=canvas.getContext('2d');
const output=document.querySelector('#fixture-log'), counts=document.querySelector('#fixture-counts');
let actions=0, downs=0, ups=0, frame=0; const held=new Set(), events=[];
function record(event){events.push(event);if(events.length>100)events.shift();output.value=events.join('\\n');output.textContent=output.value;counts.textContent='Actions: '+actions+' · Keydowns: '+downs+' · Keyups: '+ups+' · Held: '+[...held].join(',');}
for(const type of ['keydown','keyup'])canvas.addEventListener(type,e=>{e.preventDefault();if(type==='keydown'){downs++;held.add(e.key)}else{ups++;held.delete(e.key)}record(type+' '+e.key);});
for(const id of ['fixture-wait','fixture-action'])document.getElementById(id).onclick=()=>{actions++;document.querySelector('#holosoul-status').textContent='Fixture revision '+actions;record('action '+id+' total='+actions);};
function paint(){frame++;ctx.fillStyle='#173047';ctx.fillRect(0,0,640,360);ctx.fillStyle='#ffd06b';ctx.fillRect((frame*3)%580,180,60,60);ctx.fillStyle='white';ctx.font='26px sans-serif';ctx.fillText('REAL WEBRTC / ISOLATED FIXTURE',24,48);ctx.fillText('Actions '+actions+' · Frames '+frame,24,94);ctx.font='20px sans-serif';ctx.fillText('No live game or save',24,320);}
paint();setInterval(paint,50);
</script><script type="module" src="/host.js"></script>`);
const viewerPage = page('Hollow Soul RTC fixture viewer', `
<h1>WebRTC fixture viewer</h1><p id="status">Fixture ready.</p><p id="objective"></p>
<video autoplay muted playsinline tabindex="0" aria-label="Real received fixture video"></video>
<p><button id="start">Connect</button></p><div id="actions"></div><section id="controls" hidden aria-label="Fixture controls">
<button data-key="w">Up</button><button data-key="a">Left</button><button data-key="s">Down</button><button data-key="d">Right</button><button data-key="e">Interact</button></section>
<p id="fixture-media">Received media: none</p><script>
setInterval(()=>{const v=document.querySelector('video'), tracks=v.srcObject?.getVideoTracks()||[];document.querySelector('#fixture-media').textContent='Received media: '+v.videoWidth+'×'+v.videoHeight+' · time '+v.currentTime.toFixed(2)+' · '+tracks.map(t=>'track '+t.readyState+' muted='+t.muted+' enabled='+t.enabled).join(', ');},500);
</script><script type="module" src="/viewer.js"></script>`);
const rtcModule = `
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function api(operation,body){
  const response=await fetch('/signal/'+operation,{method:body===undefined?'GET':'POST',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw Error('Fixture signaling HTTP '+response.status);
  return response.json();
}
export async function gather(peer,description){
  await peer.setLocalDescription(description);
  if(peer.iceGatheringState!=='complete')await new Promise(resolve=>{
    const done=()=>{clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);resolve();};
    const changed=()=>{if(peer.iceGatheringState==='complete')done();};
    const timer=setTimeout(done,8000);peer.addEventListener('icegatheringstatechange',changed);changed();
  });
  return {type:peer.localDescription.type,sdp:peer.localDescription.sdp};
}
`;
async function jsonBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 131072) throw Error('Body too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (status, content, type = 'application/json; charset=utf-8') => {
    const body = typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content);
    res.writeHead(status, {'Content-Type':type, 'Cache-Control':'no-store', 'X-Hollow-Soul-Fixture':'real-webrtc-no-game-save'});
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  try {
    if (url.pathname === '/host') return send(200, hostPage, 'text/html; charset=utf-8');
    if (url.pathname === '/viewer') return send(200, viewerPage, 'text/html; charset=utf-8');
    if (url.pathname === '/rtc.js') return send(200, rtcModule, 'text/javascript; charset=utf-8');
    if (['/host.js','/viewer.js'].includes(url.pathname)) return send(200, await readFile(new URL('..' + url.pathname, import.meta.url)), 'text/javascript; charset=utf-8');
    if (url.pathname === '/holosoul/meta') return send(200, {protocol:'experimental-two-body-transfer-preparation-play.r1',generation:1,nextRequestId:1,closed:false,frozen:false});
    if (url.pathname === '/fixture/status') return send(200, {fixture:true,gameSave:false,hostReady:Date.now()-hostSeen<15000,pending:[...sessions.values()].filter(x=>!x.answer).length,answered:[...sessions.values()].filter(x=>x.answer).length});
    if (!url.pathname.startsWith('/signal/')) return send(404, {error:'Fixture route not found'});
    const op = url.pathname.slice('/signal/'.length);
    for (const [id, entry] of sessions) if (Date.now()-entry.created>180000) sessions.delete(id);
    if (op === 'config') return send(200, {hostReady:Date.now()-hostSeen<15000,iceServers:[]});
    if (op === 'pending') {hostSeen=Date.now();const entry=[...sessions.values()].find(x=>!x.answer);return send(200,entry ? {id:entry.id,offer:entry.offer} : null);}
    if (req.method !== 'POST') return send(405, {error:'POST required'});
    const body = await jsonBody(req);
    if (op === 'join') {
      if (body.offer?.type !== 'offer' || typeof body.offer.sdp !== 'string' || sessions.size >= 64) return send(400, {error:'Invalid or full fixture join'});
      const id=randomUUID();sessions.set(id,{id,offer:body.offer,answer:null,created:Date.now()});return send(200,{id});
    }
    const entry=sessions.get(body.id);
    if (!entry) return send(404,{error:'Unknown fixture session'});
    if (op === 'answer') {entry.answer=body.answer;return send(200,{ok:true});}
    if (op === 'result') return send(200,entry.answer);
    return send(404,{error:'Unknown fixture signal'});
  } catch (error) {send(400,{error:error.message});}
});
server.listen(port,'127.0.0.1',()=>{
  const origin='http://127.0.0.1:'+server.address().port;
  console.log(JSON.stringify({fixture:true,gameSave:false,origin,host:origin+'/host',viewer:origin+'/viewer',status:origin+'/fixture/status'}));
});
process.once('SIGINT',()=>server.close());
process.once('SIGTERM',()=>server.close());
