/* Dienst für den Tourneeplan Hanoi 2026: die Oberfläche liegt im Gerät, damit der Plan ohne Netz aufgeht.
   Seite: zuerst aus dem Netz (damit Änderungen sofort ankommen), ohne Netz aus dem Gerät.
   Logos, Symbole, Schriften: aus dem Gerät, im Hintergrund erneuert.
   Aufrufe an den Server (Anmeldung, Daten, Anmerkungen) gehen nie durch den Speicher. Tourdaten liegen nur im Browserspeicher der Seite. */
var SPEICHER = 'hanoi-app-v1';
var GRUND = ['./', 'index.html', 'manifest.webmanifest', 'wko-sunburst-blau.png', 'wko-sunburst-weiss.png', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(SPEICHER).then(function(c){ return c.addAll(GRUND); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf('hanoi-app-') === 0 && k !== SPEICHER; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var r = e.request;
  if (r.method !== 'GET') return;
  var u = new URL(r.url);
  if (u.hostname.indexOf('supabase.co') >= 0) return;
  if (r.mode === 'navigate'){
    e.respondWith(fetch(r).then(function(a){
      if (a && a.ok){ var k = a.clone(); caches.open(SPEICHER).then(function(c){ c.put('index.html', k); }); }
      return a;
    }).catch(function(){
      return caches.match('index.html').then(function(a){ return a || caches.match('./'); });
    }));
    return;
  }
  var schrift = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (u.origin !== location.origin && !schrift) return;
  e.respondWith(caches.match(r).then(function(alt){
    var neu = fetch(r).then(function(a){
      if (a && (a.ok || a.type === 'opaque')){ var k = a.clone(); caches.open(SPEICHER).then(function(c){ c.put(r, k); }); }
      return a;
    }).catch(function(){ return alt; });
    return alt || neu;
  }));
});
