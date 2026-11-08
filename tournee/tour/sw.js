/* Probefassung Tour: eigener Speicher (tb-tour-*), sonst wie die Hanoi-App */
/* Tourneeplan Hanoi 2026 (Wiener KammerOrchester): schneller Start, übernommen aus dem Taiwan-Dienst v3 (25.10.2026).
   Die Seite kommt sofort aus dem Gerät, im Hintergrund fragt der Dienst beim Server nach (unverändert = fast keine Daten).
   Wer ausdrücklich frisch lädt (Aktualisieren, ?u=), bekommt Netz zuerst (max. 8 s), sonst die gemerkte Seite. */
/* 02.11.2026 Prüfbericht Nr. 26: beim Aktivieren nur eigene alte Speicher (tb-wko-*) löschen, nie fremde derselben Website */
var C='tb-tour-v1',TC='tb-tour-tiles-v1',SC=self.registration.scope,IDX=SC+'index.html',MAXT=1500;
var LEAF=['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'];
var PRE=['icon-180.png','icon-192.png','manifest.webmanifest'];
var lauf=null;
/* Seite beim Server prüfen und im Gerät merken. Wir schicken den gemerkten ETag selbst mit (If-None-Match):
   unverändert = 304, es wird nichts geladen, auch wenn der Browser die Seite nicht im eigenen Zwischenspeicher hält.
   Gleichzeitige Anfragen teilen sich einen Abruf (höchstens 2 Minuten). */
function holen(){
 if(!lauf){
  lauf=caches.open(C).then(function(c){return c.match(IDX).then(function(mc){return(mc?Promise.resolve(mc):caches.match(IDX)).then(function(m){
   var et=m&&m.headers.get('etag'),ac=self.AbortController?new AbortController():null,tm=setTimeout(function(){try{ac&&ac.abort()}catch(x){}},120000);
   return fetch(IDX,{cache:'no-store',headers:et?{'If-None-Match':et}:{},signal:ac?ac.signal:undefined}).then(function(n){
    clearTimeout(tm);
    if(n.status===304&&m)return mc?m:c.put(IDX,m.clone()).then(function(){return m});
    if(n.ok){var cp=n.clone();return c.put(IDX,cp).then(function(){return n})}
    return n},function(x){clearTimeout(tm);throw x})})})});
  lauf.then(function(){lauf=null},function(){lauf=null})}
 return lauf.then(function(n){return n&&n.clone()})}
self.addEventListener('install',function(e){
 /* kein skipWaiting hier: ein neuer Dienst darf nicht mitten in eine laufende Seitenübertragung des alten Dienstes eingreifen (die Seite bliebe dann halb geladen hängen).
    Er wird aktiv, sobald die App neu gestartet wird, oder wenn die geöffnete Seite ihn nach dem Laden freigibt (Nachricht 'skip'). */
 e.waitUntil(Promise.all([holen().catch(function(){}),caches.open(C).then(function(c){return Promise.all(PRE.map(function(u){return fetch(u,{cache:'no-cache'}).then(function(r){if(r&&r.ok)return c.put(SC+u,r)}).catch(function(){})}).concat(LEAF.map(function(u){return fetch(u,{mode:'cors'}).then(function(r){if(r&&r.ok)return c.put(u,r)}).catch(function(){})})))})]))});
self.addEventListener('message',function(e){if(e.data==='skip')self.skipWaiting();else if(e.data==='hatPush'&&e.ports&&e.ports[0])e.ports[0].postMessage('ja')});
/* 03.11.2026 Push für „Nachricht an alle“ (Christian 12:52): der Server schickt eine leere Meldung, der Dienst holt den Text und zeigt ihn an.
   Jede Meldung muss eine sichtbare Benachrichtigung ergeben (sonst entzieht iOS die Erlaubnis), deshalb gibt es immer einen Ersatztext. */
var PAPI='https://gjbvlrztbejymrqctopj.supabase.co/functions/v1/tour-app';
self.addEventListener('push',function(e){
 var titel='Wiener KammerOrchester',text='Neue Nachricht der Tourleitung. Bitte die App öffnen.';
 e.waitUntil(caches.open('tb-push').then(function(c){return c.match(SC+'__push-token')}).then(function(r){return r?r.text():''}).then(function(t){
  if(!t)return null;var ac=self.AbortController?new AbortController():null;setTimeout(function(){try{ac&&ac.abort()}catch(x){}},8000);
  return fetch(PAPI,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'push_text',token:t}),signal:ac?ac.signal:undefined}).then(function(r){return r.json()})})
  .then(function(j){if(j&&j.ok&&j.text){text=String(j.text).slice(0,600);titel='📣 '+(j.von||'Tourleitung')}},function(){})
  .then(function(){try{self.navigator&&self.navigator.setAppBadge&&self.navigator.setAppBadge(1).catch(function(){})}catch(x){}return self.registration.showNotification(titel,{body:text,tag:'wko-nachricht',renotify:true,icon:SC+'icon-192.png',badge:SC+'icon-192.png',data:{url:SC+'#nachrichten'}})}));
});
self.addEventListener('notificationclick',function(e){e.notification.close();
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){for(var i=0;i<l.length;i++){if(l[i].url.indexOf(SC)===0&&l[i].focus){try{l[i].postMessage('nachrichten')}catch(x){}return l[i].focus()}}return self.clients.openWindow(SC+'#nachrichten')}))});
/* Beim Aktivieren die jüngste gemerkte Seite aus allen Tourneebuch-Speichern übernehmen (der alte Dienst kann inzwischen eine neuere geladen haben). */
function besterStand(){return caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return/^tb-tour-/.test(k)}).map(function(k){return caches.open(k).then(function(c){return c.match(IDX)}).then(function(m){return{k:k,m:m,t:m?(Date.parse(m.headers.get('date'))||0):-1}})}))}).then(function(a){
 a.sort(function(x,y){return y.t-x.t});var b=a[0];if(!b||!b.m||b.k===C)return;return caches.open(C).then(function(c){return c.put(IDX,b.m.clone())})})}
self.addEventListener('activate',function(e){
 /* alte Seitenspeicher erst löschen, wenn der neue die Seite hat (sonst gäbe es offline nichts zu öffnen) */
 e.waitUntil(besterStand().catch(function(){}).then(function(){return caches.open(C)}).then(function(c){return c.match(IDX)}).then(function(has){return caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return/^tb-tour-/.test(k)&&k!==C&&has}).map(function(k){return caches.delete(k)}))})}).then(function(){return self.clients.claim()}))});
/* ausdrücklich frisch: Netz zuerst. Navigation (Neuladen): nach 8 s die gemerkte Seite, der Abruf läuft im Hintergrund weiter.
   Abruf aus der Seite (Aktualisieren): wartet auf den Server, die Seite hat ihre eigene Frist. */
function netzZuerst(e,nav){
 var net=holen();e.waitUntil(net.catch(function(){}));
 var alt=function(x){return caches.match(IDX).then(function(m){return m||x||net})};
 if(!nav)return net.then(function(n){return n&&n.ok?n:alt(n)},function(){return alt(null)});
 var tm=new Promise(function(res){setTimeout(function(){res(null)},8000)});
 return Promise.race([net.catch(function(){return null}),tm]).then(function(x){return x&&x.ok?x:alt(x)})}
/* normaler Start: sofort die gemerkte Seite, Prüfung im Hintergrund */
function cacheErst(e){
 var net=holen();e.waitUntil(net.catch(function(){}));
 return caches.match(IDX).then(function(m){return m||net})}
function kachel(url){return caches.open(TC).then(function(c){return c.match(url).then(function(m){if(m)return m;
 return fetch(url,{mode:'cors',credentials:'omit'}).then(function(n){if(n&&n.ok){c.put(url,n.clone()).then(function(){return c.keys()}).then(function(k){if(k.length>MAXT)for(var i=0;i<k.length-MAXT;i++)c.delete(k[i])})}return n}).catch(function(){return Response.error()})})})}
self.addEventListener('fetch',function(e){
 var r=e.request;if(r.method!=='GET')return;
 var u=new URL(r.url);
 if(u.origin!==location.origin){
  if(LEAF.indexOf(u.href)>-1){e.respondWith(caches.match(u.href).then(function(m){return m||fetch(u.href,{mode:'cors'}).then(function(n){var cp=n.clone();caches.open(C).then(function(c){return c.put(u.href,cp)});return n})}));return}
  if(u.hostname==='tile.openstreetmap.org'){e.respondWith(kachel(u.href));return}
  return}
 if(u.href.indexOf(SC)!==0)return;
 /* 08.11.2026: die Probefassung unter tour/ hat ihren eigenen Dienst */
 if(u.href.indexOf(SC+'tour/')===0||u.href===SC+'tour')return;
 if(u.pathname.slice(-16)==='/tb-version.json')return;
 var seite=r.mode==='navigate'||u.pathname.slice(-11)==='/index.html'||u.href.split('?')[0]===SC;
 if(seite){
  if(/[?&]c=\d/.test(u.search))return;
  var frisch=r.cache==='reload'||r.cache==='no-cache'||r.cache==='no-store'||/[?&]u=\d/.test(u.search);
  e.respondWith(frisch?netzZuerst(e,r.mode==='navigate'):cacheErst(e));return}
 e.respondWith(caches.match(SC+u.pathname.split('/').pop(),{ignoreSearch:true}).then(function(m){return m||fetch(r)}))});
