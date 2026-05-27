const CACHE='dawn-brief-v1';
const OFFLINE_URLS=['/','index.html','/data-backup.json'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(OFFLINE_URLS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.url.includes('supabase.co')||e.request.url.includes('railway.app')){
    e.respondWith(fetch(e.request).catch(()=>new Response(JSON.stringify({stories:[],error:'offline'}),{headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    var fetched=fetch(e.request).then(res=>{
      if(res&&res.status===200){var clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}
      return res;
    }).catch(()=>null);
    return cached||fetched||new Response('Offline — check back when connected ☀️',{status:503});
  }));
});
self.addEventListener('push',e=>{
  var data=e.data?e.data.json():{title:'The Dawn Brief',body:'Tera brief ready hai. Dekh le. ☀️'};
  e.waitUntil(self.registration.showNotification(data.title||'The Dawn Brief',{body:data.body||'Your morning brief is ready.',icon:'/favicon.ico',badge:'/favicon.ico',tag:'dawn-brief-daily'}));
});
