const cacheName='axiom-gauge-shell-v1';
const files=['./','./index.html','./model.js','./replica.mjs','./ui.mjs','./authority-key.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(c=>c.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||!files.some(p=>new URL(p,self.registration.scope).href===u.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    try {
      const response=await fetch(event.request,{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('Shell temporarily unavailable');
      await cache.put(event.request,response.clone());
      return response;
    } catch {
      return await cache.match(event.request)||Response.error();
    }
  })());
});
