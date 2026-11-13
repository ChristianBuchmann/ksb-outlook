// Desk v21 (11.11.2026; v14 Zuschnitt, v15 Symbol, v16 Manifest: Homescreen-Symbol öffnet Safari, v17 Wecker an jedem Knopf und Seite Presse für Knopf 40, v18 Projekte mit Typen, Kanban, Liste, Tabelle, Termine, Rechner und Szenarien in projekte.js, v19 Weingüter als aufklappbare Karten mit Konditionen, v20 Zahlen oben sind zugleich die Filter, v21 Gespräch im Desk in gespraech.js). Die Hülle des neuen Desk: Anmeldung per Mail-Link. Startseite ist die Arbeitsfläche (jetzt: Postfach ablegen).
// Heute, Knöpfe und Steuerung liegen hinter „Technik“ (Christian 09.11.2026: sauber und einfach, ein Knopf, nichts im Weg).
// Bauplan Desk Fassung 4, Abschnitte 2.1 bis 2.7. Reine Dateien, kein Build. Datenbank nur über die Serverfunktion desk.
// Erster Knopf: 7 Postfach ablegen (Christian 09.11.2026).

import { projekteModul } from './projekte.js';
import { gespraechModul } from './gespraech.js';
const VERSION = 21;
const API = 'https://gjbvlrztbejymrqctopj.supabase.co/functions/v1/desk';
const API_G = 'https://gjbvlrztbejymrqctopj.supabase.co/functions/v1/desk-gespraech';
// Kein Schlüssel in der Seite: die Serverfunktion desk ist wie die Seitenleiste ohne JWT-Prüfung erreichbar, jeder Aufruf braucht die Sitzung.
const SITZUNG_KEY = 'desk.sitzung';
const BEREICHE = { MAILS: 'Mails und Entwürfe', MELDUNGEN: 'Meldungen an Dich', FINANZ: 'Finanz und Rechnungen', RECHT: 'Verträge und Rechtliches', MATERIAL: 'Künstlermaterial', KAMPAGNEN: 'Kampagnen und Akquise', SOCIAL: 'Social Media', YOOL: 'YOOL und Tourneen', PRIVAT: 'Privat', STEUERUNG: 'Steuerung und Technik' };
const BEREICH_REIHE = ['MAILS', 'MELDUNGEN', 'KAMPAGNEN', 'FINANZ', 'RECHT', 'MATERIAL', 'SOCIAL', 'YOOL', 'PRIVAT', 'STEUERUNG'];
const STAND_TEXT = { GEPLANT: 'geplant', GEBAUT: 'gebaut', GETESTET: 'getestet', ZURUECKGELESEN: 'zurückgelesen', PRODUKTIV: 'produktiv', GESTRICHEN: 'gestrichen' };

const S = {
  sitzung: localStorage.getItem(SITZUNG_KEY) || '',
  wer: null,
  lage: null,
  lageAm: 0,
  heute: null,
  knopf: {},        // schluessel → Detail
  ablage: { vorschau: null, protokoll: null, laeuft: null, meldung: null },
  presse: { filter: 'neu', daten: null, vorschau: null, laeuft: null, meldung: null, zuletzt: null },
  wecker: {},       // schluessel → Entwurf des Weckers, bis er gespeichert wird
  laden: {},
  fehler: null,
};
let pollTimer = null;

// ---------- Hilfen ----------
const app = document.getElementById('app');
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtWien = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtWienKurz = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtTag = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric' });
function wann(ts, kurz) { if (!ts) return ''; const d = new Date(ts); return (kurz ? fmtWienKurz : fmtWien).format(d); }
function tag(ts) { return ts ? fmtTag.format(new Date(ts)) : ''; }
function her(ts) {
  if (!ts) return 'nie';
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return `vor ${Math.round(s / 86400)} Tagen`;
}
function dauer(a, b) { if (!a || !b) return ''; const s = Math.round((new Date(b) - new Date(a)) / 1000); return s < 60 ? `${s} s` : `${Math.round(s / 60)} Min.`; }
function usd(n) { const x = Number(n || 0); return x ? x.toFixed(2) + ' USD' : '0 USD'; }
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
function tageText(tage) {
  if (!tage || tage.length === 7) return 'täglich';
  const t = [...tage].sort((a, b) => a - b).join(',');
  if (t === '1,2,3,4,5') return 'werktags';
  return tage.slice().sort((a, b) => a - b).map((n) => TAGE[n - 1]).join(', ');
}
function taktText(t) {
  if (!t) return 'nur von Hand';
  if (t.art === 'MINUTEN') return `alle ${t.alle} Min.${t.von ? ` (${t.von} bis ${t.bis})` : ''}`;
  if (t.art === 'UHRZEIT') return `${(t.zeiten || []).join(', ')} Uhr, ${tageText(t.tage)}`;
  if (t.art === 'NACH') return `nach „${knopfName(t.knopf)}“`;
  return JSON.stringify(t);
}
function knopfName(s) { const k = (S.lage?.knoepfe || []).find((x) => x.schluessel === s); return k ? k.name : s; }
function ampel(k) {
  if (k.offen) return 'blau';
  if (!k.an || k.stand === 'GESTRICHEN') return '';
  if (k.letzter_ok === false) return 'rot';
  if (k.letzter_ok === true) return 'gruen';
  return 'gelb';
}
function nav(hash) { location.hash = hash; }
function route() { const t = (location.hash || '#ablage').replace(/^#/, '').split('/'); return { seite: t[0] || 'ablage', arg: t.slice(1).join('/') }; }
const TECHNIK = new Set(['technik', 'heute', 'knoepfe', 'knopf', 'steuerung']);
// Safari meldet abgebrochene Abfragen als „Load failed“, Chrome als „Failed to fetch“: beides heißt keine Verbindung
function fehlerText(e) { const t = String(e?.message || e || ''); return /load failed|failed to fetch|networkerror|network request failed|timed out|aborted/i.test(t) ? 'Keine Verbindung zum Server. Bitte noch einmal versuchen.' : t; }
const breit = () => window.matchMedia('(min-width: 1100px)').matches;

// ---------- Schnittstelle ----------
async function api(aufruf, args = {}, opt = {}) {
  let r;
  try {
    r = await fetch(opt.url || API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-desk-sitzung': S.sitzung },
    body: JSON.stringify({ aufruf, args }),
    signal: AbortSignal.timeout(opt.timeout || 30_000),
    });
  } catch (e) { throw new Error(fehlerText(e)); }
  let j = {};
  try { j = await r.json(); } catch { j = { ok: false, fehler: `Antwort ${r.status} ohne Inhalt` }; }
  if (r.status === 401 && j.anmelden) { abmeldenLokal(); render(); throw new Error('Nicht angemeldet'); }
  if (!r.ok || j.ok === false) throw new Error(j.fehler || `Fehler ${r.status}`);
  return j;
}
const apiG = (aufruf, args = {}) => api(aufruf, args, { url: API_G });
function abmeldenLokal() { S.sitzung = ''; S.wer = null; S.lage = null; S.heute = null; localStorage.removeItem(SITZUNG_KEY); }

async function ladeLage(still) {
  if (!still) S.laden.lage = true;
  try { S.lage = await api('lage'); S.lageAm = Date.now(); if (!still) S.fehler = null; }
  catch (e) { if (!still) S.fehler = e.message; }
  S.laden.lage = false;
}
async function ladeHeute(still) { S.laden.heute = true; try { S.heute = await api('heute'); } catch (e) { if (!still) S.fehler = e.message; } S.laden.heute = false; }
async function ladeKnopf(s, still) { S.laden['knopf:' + s] = true; try { S.knopf[s] = await api('knopf', { schluessel: s }); } catch (e) { if (!still) S.fehler = e.message; } S.laden['knopf:' + s] = false; }

// ---------- Wecker ----------
function kanon(x) { return JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)); }
function weckerEntwurf(k) {
  const alt = S.wecker[k.schluessel];
  if (alt && alt.version === k.version) return alt;
  const t = k.takt || null;
  const w = { version: k.version, modus: 'aus', zeiten: ['08:00'], tage: [1, 2, 3, 4, 5, 6, 7], alle: 60, von: '', bis: '', nach: '' };
  if (t?.art === 'UHRZEIT') { w.modus = 'zeit'; w.zeiten = [...(t.zeiten || [])]; w.tage = t.tage ? [...t.tage] : [1, 2, 3, 4, 5, 6, 7]; }
  else if (t?.art === 'MINUTEN') { w.modus = 'minuten'; w.alle = t.alle; w.von = t.von || ''; w.bis = t.bis || ''; }
  else if (t?.art === 'NACH') { w.modus = 'nach'; w.nach = t.knopf; }
  S.wecker[k.schluessel] = w;
  return w;
}
function weckerTakt(w) {
  if (w.modus === 'aus') return { takt: null };
  if (w.modus === 'zeit') {
    const z = [...new Set(w.zeiten.filter(Boolean))].sort();
    if (!z.length) return { fehler: 'Mindestens eine Uhrzeit.' };
    if (!w.tage.length) return { fehler: 'Mindestens ein Wochentag.' };
    const t = { art: 'UHRZEIT', zeiten: z };
    if (w.tage.length < 7) t.tage = [...w.tage].sort((a, b) => a - b);
    return { takt: t };
  }
  if (w.modus === 'minuten') {
    const n = Number(w.alle);
    if (!(n >= 5 && n <= 1440)) return { fehler: 'Abstand zwischen 5 und 1440 Minuten.' };
    const t = { art: 'MINUTEN', alle: n };
    if (w.von && w.bis) { t.von = w.von; t.bis = w.bis; } else if (w.von || w.bis) return { fehler: 'Von und bis zusammen angeben, oder beide leer lassen.' };
    return { takt: t };
  }
  if (!w.nach) return { fehler: 'Knopf wählen.' };
  return { takt: { art: 'NACH', knopf: w.nach } };
}
function weckerHtml(k, l) {
  if (k.stand === 'GESTRICHEN') return '';
  const w = weckerEntwurf(k), s = k.schluessel;
  const r = weckerTakt(w);
  const geaendert = !r.fehler && kanon(r.takt) !== kanon(k.takt || null);
  const andere = (S.lage?.knoepfe || []).filter((x) => x.schluessel !== s && x.stand !== 'GESTRICHEN');
  const hinweise = [];
  if (!k.ausfuehrung) hinweise.push('Der Knopf hat noch keine Ausführung im Desk. Der Wecker wird gemerkt und wirkt, sobald er sie hat.');
  else if (k.stand !== 'PRODUKTIV') hinweise.push(`Der Wecker löst erst aus, wenn der Knopf auf „produktiv“ steht (jetzt: ${STAND_TEXT[k.stand] || k.stand}). Von Hand geht „Jetzt“ immer.`);
  if (!k.an) hinweise.push('Der Knopf ist ausgeschaltet, der Wecker ruht.');
  if (l?.alte_zeitplaene_aktiv) hinweise.push('Alte Zeitpläne laufen noch und bleiben maßgeblich, bis sie mit der Stufe abgeschaltet werden.');
  return `<div class="abschnitt wecker"><h3>Wecker</h3>
    <p class="dim klein" style="margin-bottom:8px">Jetzt von Hand geht immer. Hier stellst Du ein, wann der Knopf zusätzlich von selbst läuft: mehrmals am Tag, alle paar Minuten, nach einem anderen Knopf oder gar nicht. Zeiten in Wiener Zeit.</p>
    <div class="reihe"><select data-w="modus" aria-label="Art des Weckers">
      <option value="aus" ${w.modus === 'aus' ? 'selected' : ''}>Aus (nur von Hand)</option>
      <option value="zeit" ${w.modus === 'zeit' ? 'selected' : ''}>Zu festen Uhrzeiten</option>
      <option value="minuten" ${w.modus === 'minuten' ? 'selected' : ''}>Alle … Minuten</option>
      <option value="nach" ${w.modus === 'nach' ? 'selected' : ''}>Nach einem anderen Knopf</option>
    </select></div>
    ${w.modus === 'zeit' ? `<div class="wecker-zeiten">
      ${w.zeiten.map((z, i) => `<span class="zeit"><input type="time" value="${h(z)}" data-w="zeit" data-i="${i}" aria-label="Uhrzeit ${i + 1}"><button class="knopf klein still" data-tu="w-minus" data-i="${i}" title="Uhrzeit entfernen" aria-label="Uhrzeit entfernen">×</button></span>`).join('')}
      <button class="knopf klein still" data-tu="w-plus" ${w.zeiten.length >= 24 ? 'disabled' : ''}>+ Uhrzeit</button></div>
      <div class="reihe tage" role="group" aria-label="Wochentage">${TAGE.map((t, i) => `<button type="button" class="chip ${w.tage.includes(i + 1) ? 'an' : ''}" data-tu="w-tag" data-t="${i + 1}" aria-pressed="${w.tage.includes(i + 1)}">${t}</button>`).join('')}
        <button type="button" class="knopf klein still" data-tu="w-werktags">Mo bis Fr</button><button type="button" class="knopf klein still" data-tu="w-taeglich">täglich</button></div>` : ''}
    ${w.modus === 'minuten' ? `<div class="reihe" style="margin-top:8px"><label>alle <input type="number" min="5" max="1440" step="1" value="${h(w.alle)}" data-w="alle" style="width:5.5rem"> Min.</label>
      <label>von <input type="time" value="${h(w.von)}" data-w="von"></label><label>bis <input type="time" value="${h(w.bis)}" data-w="bis"></label></div>
      <p class="dim klein">Von und bis sind freiwillig. Leer heißt: rund um die Uhr. Kürzester Abstand 5 Minuten.</p>` : ''}
    ${w.modus === 'nach' ? `<div class="reihe" style="margin-top:8px"><select data-w="nach" aria-label="nach Knopf"><option value="">Knopf wählen</option>${andere.map((x) => `<option value="${h(x.schluessel)}" ${w.nach === x.schluessel ? 'selected' : ''}>${x.nummer}. ${h(x.name)}</option>`).join('')}</select></div>` : ''}
    <div class="reihe" style="margin-top:10px">
      <button class="knopf" data-tu="w-speichern" data-s="${h(s)}" ${!geaendert ? 'disabled' : ''}>Wecker speichern</button>
      ${geaendert ? `<button class="knopf still" data-tu="w-verwerfen" data-s="${h(s)}">Zurücksetzen</button>` : ''}
      <span class="dim klein">${r.fehler ? `<span class="fehler">${h(r.fehler)}</span>` : `Gilt: ${h(taktText(r.takt))}${geaendert ? ' (noch nicht gespeichert)' : ''}`}</span>
    </div>
    ${hinweise.map((t) => `<div class="hinweis" style="margin-top:8px">${h(t)}</div>`).join('')}
  </div>`;
}
async function weckerSpeichern(s) {
  const k = S.knopf[s]?.knopf; if (!k) return;
  const r = weckerTakt(weckerEntwurf(k));
  if (r.fehler) { S.fehler = r.fehler; render(); return; }
  const grund = await grundFragen(`Wecker von „${k.name}“ ändern`, `Neu: ${taktText(r.takt)}. Der Grund steht in der Version des Knopfs.`);
  if (!grund) return;
  try { S.knopf[s] = await api('takt_setzen', { schluessel: s, takt: r.takt, grund }); delete S.wecker[s]; await ladeLage(true); S.fehler = null; }
  catch (e) { S.fehler = e.message; }
  render();
}

// ---------- Grund-Dialog ----------
const dlg = document.getElementById('dlg');
function grundFragen(titel, text, vorgabe = '') {
  return new Promise((res) => {
    document.getElementById('dlg-titel').textContent = titel;
    document.getElementById('dlg-text').textContent = text || '';
    const ta = document.getElementById('dlg-grund'); ta.value = vorgabe;
    const form = document.getElementById('dlg-form');
    const nein = document.getElementById('dlg-nein');
    const fertig = (v) => { form.onsubmit = null; nein.onclick = null; dlg.close(); res(v); };
    form.onsubmit = (ev) => { ev.preventDefault(); if (ta.value.trim()) fertig(ta.value.trim()); };
    nein.onclick = () => fertig(null);
    dlg.onclose = () => res(null);
    dlg.showModal(); ta.focus();
  });
}

// ---------- Projekte (v18) ----------
const GS = gespraechModul({ apiG, api, h, render, wann, fehler: (m) => { S.fehler = m; }, fehlerLeiste });
const PR = projekteModul({ api, h, app, render, grundFragen, fehler: (m) => { S.fehler = m; }, fehlerLeiste, gespraech: (pid, fid) => GS.projektTeil(pid, fid) });

// ---------- Aktionen ----------
async function schalten(k) {
  const grund = await grundFragen(k.an ? `„${k.name}“ ausschalten` : `„${k.name}“ einschalten`, 'Der Grund steht in der Version des Knopfs.');
  if (!grund) return;
  try { S.knopf[k.schluessel] = await api('knopf_schalten', { schluessel: k.schluessel, an: !k.an, grund }); await ladeLage(true); }
  catch (e) { S.fehler = e.message; }
  render();
}
async function jetzt(k, args) {
  if (!k.ausfuehrung) { S.fehler = `„${k.name}“ hat noch keine Ausführung im Desk, er läuft über die alten Zeitpläne.`; render(); return; }
  try {
    const r = await api('knopf_jetzt', { schluessel: k.schluessel, args: args || null });
    if (r.wartet) S.fehler = `„${k.name}“ läuft gerade, der Klick wartet auf das Ende.`;
    await ladeLage(true);
    if (k.schluessel === 'postfach_ablegen') { S.ablage.laeuft = r.lauf?.id || null; S.ablage.vorschau = null; S.ablage.meldung = `Ablage gestartet (Lauf ${r.lauf?.id}). Ergebnis kommt gleich.`; }
    if (k.schluessel === 'alerts_kritiken') { S.presse.laeuft = r.lauf?.id || null; S.presse.vorschau = null; S.presse.meldung = `Auswertung gestartet (Lauf ${r.lauf?.id}). Das Ergebnis kommt gleich.`; }
    pollen();
  } catch (e) { S.fehler = e.message; }
  render();
}
async function einstellungAendern(s, e) {
  const neu = prompt(`${e.name}\n${e.erklaerung}\n\nNeuer Wert (als JSON, Text in Anführungszeichen):`, JSON.stringify(e.wert));
  if (neu === null) return;
  let wert;
  try { wert = JSON.parse(neu); } catch { S.fehler = 'Der Wert ist kein gültiges JSON. Text braucht Anführungszeichen, zum Beispiel "KI abgelegt".'; render(); return; }
  const grund = await grundFragen(`${e.name} ändern`, 'Jede Änderung bekommt eine Version und einen Grund.');
  if (!grund) return;
  try { S.knopf[s] = await api('einstellung_setzen', { schluessel: s, name: e.name, wert, grund }); await ladeLage(true); }
  catch (er) { S.fehler = er.message; }
  render();
}
async function ablageVorschau() {
  S.ablage.vorschau = null; S.ablage.meldung = null; S.laden.vorschau = true; render();
  try { S.ablage.vorschau = await api('ablage_vorschau', {}, { timeout: 150_000 }); }
  catch (e) { S.fehler = e.message; }
  S.laden.vorschau = false; render();
}
async function ablageProtokoll(laufId, still) {
  try { S.ablage.protokoll = await api('ablage_protokoll', laufId ? { lauf_id: laufId } : {}); }
  catch (e) { if (!still) S.fehler = e.message; }
}
async function ablageZurueck(z) {
  if (!confirm(`„${z.betreff}“ zurück nach ${z.ordner || 'Posteingang'}?\nKennzeichen weg, Gelesen und Fahne wie vorher.`)) return;
  S.laden['zurueck:' + z.id] = true; render();
  try { const r = await api('ablage_zurueck', { id: z.id }, { timeout: 60_000 }); if (!r.ok) S.fehler = r.ergebnis || r.grund; await ablageProtokoll(z.lauf_id); }
  catch (e) { S.fehler = e.message; }
  S.laden['zurueck:' + z.id] = false; render();
}
const PRESSE_FILTER = [['neu', 'Neu', 'neu'], ['kritik', 'Kritiken', 'kritiken'], ['werbung', 'Werbebasis', 'werbebasis'], ['ohne_bezug', 'Ohne Bezug', 'ohne_bezug'], ['alle', 'Alle', 'gesamt']];
async function presseLaden(still) {
  try { S.presse.daten = await api('presse', { filter: S.presse.filter, n: 150 }); }
  catch (e) { if (!still) S.fehler = e.message; }
}
async function presseVorschau() {
  S.presse.vorschau = null; S.presse.meldung = null; S.laden.pvorschau = true; render();
  try { S.presse.vorschau = await api('alerts_vorschau', {}, { timeout: 150_000 }); }
  catch (e) { S.fehler = e.message; }
  S.laden.pvorschau = false; render();
}
async function presseSetzen(id, patch, zurueck) {
  const z = (S.presse.daten?.zeilen || []).find((x) => x.id === id);
  try {
    await api('presse_setzen', { id, ...patch });
    S.presse.zuletzt = zurueck && z ? { id, patch: zurueck, titel: z.titel } : null;
    await presseLaden(true);
  } catch (e) { S.fehler = e.message; }
  render();
}
async function anmelden(email) {
  S.laden.anmelden = true; render();
  try { const r = await api('anmelden', { email }); S.anmeldeHinweis = r.grund ? `${r.hinweis} (${r.grund})` : r.hinweis; }
  catch (e) { S.fehler = e.message; }
  S.laden.anmelden = false; render();
}
async function einloesen(token) {
  try {
    const r = await api('anmeldung_einloesen', { token });
    S.sitzung = r.sitzung; localStorage.setItem(SITZUNG_KEY, r.sitzung); S.wer = { email: r.email, name: r.name };
    history.replaceState(null, '', location.pathname + '#ablage');
  } catch (e) { S.fehler = 'Anmeldung: ' + e.message; history.replaceState(null, '', location.pathname + '#anmelden'); }
}
async function abmelden() { try { await api('abmelden'); } catch { /* egal */ } abmeldenLokal(); nav('anmelden'); render(); }

// ---------- Polling ----------
function pollen() {
  clearTimeout(pollTimer);
  const offen = (S.lage?.knoepfe || []).some((k) => k.offen) || S.ablage.laeuft || S.presse.laeuft;
  pollTimer = setTimeout(async () => {
    if (!S.sitzung) return;
    await ladeLage(true);
    const { seite, arg } = route();
    if (seite === 'heute') await ladeHeute(true);
    if (seite === 'knopf' && arg) await ladeKnopf(arg, true);
    if (S.ablage.laeuft) {
      const k7 = (S.lage?.knoepfe || []).find((k) => k.schluessel === 'postfach_ablegen');
      if (k7 && !k7.offen) { await ablageProtokoll(S.ablage.laeuft, true); S.ablage.laeuft = null; S.ablage.meldung = S.ablage.protokoll?.lauf?.ergebnis ? `Ablage fertig: ${S.ablage.protokoll.lauf.ergebnis}` : 'Ablage fertig.'; }
    }
    if (S.presse.laeuft) {
      const k40 = (S.lage?.knoepfe || []).find((k) => k.schluessel === 'alerts_kritiken');
      if (k40 && !k40.offen) {
        await ladeKnopf('alerts_kritiken', true); S.presse.laeuft = null;
        const lauf = S.knopf.alerts_kritiken?.laeufe?.[0];
        S.presse.meldung = lauf?.ergebnis ? `${lauf.ok === false ? 'Mit Fehlern fertig' : 'Fertig'}: ${lauf.ergebnis}${lauf.fehler ? ' · ' + lauf.fehler : ''}` : 'Fertig.';
        await presseLaden(true);
      }
    }
    if (seite === 'presse' && !S.presse.laeuft) await presseLaden(true);
    render(); pollen();
  }, offen ? 8_000 : 60_000);
}

// ---------- Ansichten ----------
function menue(seite) {
  // Nur, was fertig ist. Heute kommt ins Menü, wenn der Postmeister steht; jeder weitere Knopf, wenn er arbeitet.
  const e = [['gespraech', '✎', 'Gespräch'], ['projekte', '▦', 'Projekte'], ['ablage', '▤', 'Ablage'], ['presse', '❝', 'Presse'], ['technik', '⚙', 'Technik']];
  return `<nav class="menue">
    <div class="marke"><b>Desk</b><span>v${VERSION}</span></div>
    ${e.map(([k, i, t]) => `<a href="#${k}" class="${seite === k || (k === 'projekte' && seite === 'projekt') || (k === 'technik' && TECHNIK.has(seite)) ? 'aktiv' : ''}"><span class="ico">${i}</span><span class="text">${t}</span></a>`).join('')}
    <div class="fuss"><span class="lang">${S.wer ? h(S.wer.name) + '<br>' : ''}Stand ${S.lageAm ? wann(S.lageAm, true) : '…'} Wien<br></span>v${VERSION}</div>
  </nav>`;
}
function fehlerLeiste() { return S.fehler ? `<div class="hinweis rot reihe" style="justify-content:space-between"><span>${h(S.fehler)}</span><button class="knopf klein still" data-tu="fehler-weg">×</button></div>` : ''; }

function seiteAnmelden() {
  return `<div class="inhalt"><div class="anmeldung karte">
    <div class="marke"><b>Desk</b> <span class="dim">v${VERSION}</span></div>
    <p>Anmeldung per Mail-Link. Der Link kommt von backoffice@buchmann.at und gilt 15 Minuten.</p>
    ${fehlerLeiste()}
    ${S.anmeldeHinweis ? `<div class="hinweis gruen">${h(S.anmeldeHinweis)}</div>` : ''}
    <form data-form="anmelden">
      <input type="email" name="email" value="christian@buchmann.at" required placeholder="E-Mail-Adresse">
      <div class="reihe" style="margin-top:10px"><button class="knopf" ${S.laden.anmelden ? 'disabled' : ''}>Link schicken</button>${S.laden.anmelden ? '<span class="laden">Mail wird gesendet</span>' : ''}</div>
    </form>
  </div></div>`;
}

function seiteHeute() {
  const H = S.heute, L = S.lage;
  if (!H || !L) return `<div class="inhalt"><div class="laden">Heute wird geladen</div></div>`;
  const k7 = L.knoepfe.find((k) => k.schluessel === 'postfach_ablegen');
  const fehlerKn = H.knopf_fehler || [];
  return `<div class="inhalt">
    <div class="kopf"><h1>Heute</h1><span class="dim klein">${tag(H.stand)}, Wiener Zeit</span></div>
    ${fehlerLeiste()}
    <div class="zahlen" style="margin-bottom:14px">
      <div class="zahl"><b>${H.entscheidungen_offen}</b><span>Entscheidungen offen</span></div>
      <div class="zahl"><b>${H.antwortschuld_offen}</b><span>Antworten schuldig</span></div>
      <div class="zahl"><b class="${fehlerKn.length ? 'fehler' : 'ok'}">${fehlerKn.length}</b><span>Knöpfe mit Fehler (24 h)</span></div>
      <div class="zahl"><b>${usd(L.kosten?.heute)}</b><span>Kosten heute · ${usd(L.kosten?.monat)} im Monat</span></div>
    </div>
    <div class="karte"><div class="kopf"><h2>Entscheidungen</h2><span class="dim klein">höchstens fünf</span></div>
      ${H.entscheidungen.length ? H.entscheidungen.map((q) => `<div class="abschnitt"><div><b>${h(q.frage)}</b></div>${q.kontext ? `<div class="dim klein">${h(q.kontext)}</div>` : ''}${q.empfehlung ? `<div class="klein">Empfehlung: ${h(q.empfehlung)}</div>` : ''}<div class="dim klein">${h(q.objekt)} · ${h(q.gestellt_von)} · ${wann(q.gestellt_am, true)}</div></div>`).join('') : '<p class="dim">Nichts offen.</p>'}
    </div>
    <div class="karte"><div class="kopf"><h2>Ablage</h2><a href="#ablage" class="klein">zum Knopf</a></div>
      ${H.ablage_letzte ? `<p>Letzter Lauf ${wann(H.ablage_letzte.beginn, true)}: <span class="${H.ablage_letzte.ok === false ? 'fehler' : ''}">${h(H.ablage_letzte.ergebnis || (H.ablage_letzte.ende ? '' : 'läuft'))}</span>${H.ablage_letzte.fehler ? `<br><span class="fehler klein">${h(H.ablage_letzte.fehler)}</span>` : ''}</p>` : '<p class="dim">Noch kein Lauf. Vorschau und Ablegen auf der Seite Ablage.</p>'}
      <div class="reihe"><button class="knopf" data-tu="nav" data-ziel="ablage">Postfach ablegen öffnen</button>${k7 ? `<span class="marke ${k7.an ? 'an' : 'aus'}">${k7.an ? 'an' : 'aus'}</span><span class="marke stand-${k7.stand}">${STAND_TEXT[k7.stand] || k7.stand}</span>` : ''}</div>
    </div>
    <div class="karte"><h2>Antworten schuldig</h2>
      ${H.antwortschuld.length ? `<table class="tabelle"><tr><th>Von</th><th>Betreff</th><th class="optional">Was</th><th>Seit</th></tr>${H.antwortschuld.map((a) => `<tr><td>${h(a.absender)}</td><td>${h(a.betreff)}</td><td class="optional">${h(a.schuld || '')}</td><td class="nowrap">${wann(a.eingang_am, true)}</td></tr>`).join('')}</table>${H.antwortschuld_offen > H.antwortschuld.length ? `<p class="dim klein">und ${H.antwortschuld_offen - H.antwortschuld.length} weitere</p>` : ''}` : '<p class="dim">Keine.</p>'}
    </div>
    <div class="karte"><h2>Fehler der Knöpfe</h2>
      ${fehlerKn.length ? fehlerKn.map((f) => `<div class="abschnitt"><a href="#knopf/${f.schluessel}"><b>${h(f.name)}</b></a> <span class="dim klein">${wann(f.am, true)}</span><div class="fehler klein">${h(f.fehler)}</div></div>`).join('') : '<p class="dim">Keine Fehler in den letzten 24 Stunden.</p>'}
    </div>
  </div>`;
}

function knopfListe(gewaehlt) {
  const L = S.lage;
  if (!L) return `<div class="laden">Knöpfe werden geladen</div>`;
  const gruppen = {};
  for (const k of L.knoepfe) (gruppen[k.bereich] ||= []).push(k);
  return `<div class="karte">
    <div class="kopf"><h2>Knöpfe</h2><span class="dim klein">${L.knoepfe.filter((k) => k.stand !== 'GESTRICHEN').length} im Verzeichnis</span></div>
    ${BEREICH_REIHE.filter((b) => gruppen[b]).map((b) => `<div class="bereich-titel">${BEREICHE[b]}</div>${gruppen[b].map((k) => `
      <div class="knopfzeile ${gewaehlt === k.schluessel ? 'gewaehlt' : ''}" data-tu="knopf" data-s="${k.schluessel}">
        <span class="ampel ${ampel(k)}" title="${k.offen ? 'läuft' : k.letzter_ok === false ? 'letzter Lauf mit Fehler' : k.letzter_ok ? 'letzter Lauf gut' : 'noch kein Lauf'}"></span>
        <span class="nr">${k.nummer}</span>
        <span class="titel">${h(k.name)} ${k.stand === 'GESTRICHEN' ? '<span class="marke stand-GESTRICHEN">gestrichen</span>' : ''}<small>${k.offen ? 'läuft gerade' : k.letzter_lauf ? `${her(k.letzter_lauf)}${k.letzter_ok === false ? ' · Fehler' : ''}` : 'noch kein Lauf'}${k.alte_zeitplaene_aktiv ? ` · ${k.alte_zeitplaene_aktiv} alte Zeitpl.` : ''}</small></span>
        <span class="aktion">${k.stand !== 'GESTRICHEN' ? `<button class="schalter ${k.an ? 'an' : ''}" data-tu="schalten" data-s="${k.schluessel}" title="${k.an ? 'an' : 'aus'}: ${h(k.an_grund || '')}"></button>` : ''}${k.ausfuehrung && k.an && k.stand !== 'GESTRICHEN' ? `<button class="knopf klein" data-tu="jetzt" data-s="${k.schluessel}" ${k.offen ? 'disabled' : ''}>Jetzt</button>` : ''}</span>
      </div>`).join('')}`).join('')}
  </div>`;
}

function knopfDetail(s) {
  const D = S.knopf[s];
  if (!D) return `<div class="karte"><div class="laden">Knopf wird geladen</div></div>`;
  const k = D.knopf, l = D.lage || {};
  const kl = (S.lage?.knoepfe || []).find((x) => x.schluessel === s) || {};
  return `<div class="karte">
    <div class="kopf"><div><a href="#knoepfe" class="klein">← Knöpfe</a> <span class="dim klein">· <a href="#technik">Technik</a></span><h1>${k.nummer}. ${h(k.name)}</h1></div>
      <div class="reihe"><span class="marke stand-${k.stand}">${STAND_TEXT[k.stand] || k.stand}</span><span class="marke">Stufe ${k.stufe}</span><span class="marke">${h(BEREICHE[k.bereich] || k.bereich)}</span><span class="marke">Version ${k.version}</span></div></div>
    <p>${h(k.was)}</p>
    <div class="reihe" style="margin:8px 0 14px">
      ${k.stand !== 'GESTRICHEN' ? `<button class="schalter ${k.an ? 'an' : ''}" data-tu="schalten" data-s="${s}"></button><span>${k.an ? 'an' : 'aus'}${k.an_grund ? `: <span class="dim">${h(k.an_grund)}</span>` : ''}</span>` : '<span class="dim">gestrichen</span>'}
    </div>
    <div class="reihe" style="margin-bottom:14px">
      ${k.ausfuehrung ? `<button class="knopf" data-tu="jetzt" data-s="${s}" ${kl.offen || !k.an ? 'disabled' : ''}>Jetzt${kl.offen ? ' (läuft)' : ''}</button>` : '<span class="hinweis" style="margin:0">Noch keine Ausführung im Desk, der Knopf läuft über die alten Zeitpläne. Kommt mit seiner Stufe.</span>'}
      ${s === 'postfach_ablegen' ? '<button class="knopf still" data-tu="nav" data-ziel="ablage">Vorschau und Ablage</button>' : ''}
      ${s === 'alerts_kritiken' ? '<button class="knopf still" data-tu="nav" data-ziel="presse">Zur Presse</button>' : ''}
    </div>
    <div class="abschnitt"><h3>Ablauf</h3><ol class="ablauf">${(k.ablauf || []).map((a) => `<li>${h(a)}</li>`).join('')}</ol></div>
    <div class="abschnitt"><h3>Letzter Lauf</h3>
      ${l.letzter_lauf ? `<dl class="fakten"><dt>Wann</dt><dd>${wann(l.letzter_lauf)} (${her(l.letzter_lauf)})</dd><dt>Ergebnis</dt><dd class="${l.letzter_ok === false ? 'fehler' : l.letzter_ok ? 'ok' : ''}">${l.letzter_ok === false ? 'Fehler' : l.letzter_ok ? 'gut' : 'läuft'}</dd>${l.letzter_fehler ? `<dt>Fehler</dt><dd class="fehler">${h(l.letzter_fehler)}</dd>` : ''}<dt>24 Stunden</dt><dd>${l.laeufe_24h} Läufe, ${l.fehler_24h} Fehler</dd></dl>` : '<p class="dim">Noch kein Lauf.</p>'}
    </div>
    <div class="abschnitt"><h3>Auslöser</h3><dl class="fakten"><dt>Takt</dt><dd>${h(taktText(k.takt))}</dd><dt>Jetzt</dt><dd>${k.ausfuehrung ? `über das Laufwerk, Ausführung ${h(k.ausfuehrung.art)} ${h(k.ausfuehrung.funktion)}` : 'noch nicht'}</dd><dt>Höchstdauer</dt><dd>${k.hoechstdauer_s} s</dd>${(k.abhaengig_von || []).length ? `<dt>Vorher</dt><dd>${k.abhaengig_von.map(knopfName).map(h).join(', ')}</dd>` : ''}${l.alte_zeitplaene_aktiv ? `<dt>Alte Zeitpläne</dt><dd>${l.alte_zeitplaene_aktiv} noch aktiv (werden mit der Stufe abgeschaltet)</dd>` : ''}</dl></div>
    ${weckerHtml(k, l)}
    <div class="abschnitt"><h3>Kosten</h3><dl class="fakten"><dt>Heute</dt><dd>${usd(kl.kosten?.heute)}</dd><dt>Woche</dt><dd>${usd(kl.kosten?.woche)}</dd><dt>Monat</dt><dd>${usd(kl.kosten?.monat)}</dd></dl></div>
    <div class="abschnitt"><h3>Einstellungen</h3>
      ${D.einstellungen.length ? D.einstellungen.map((e) => `<div class="einstellung"><div><div class="name">${h(e.name)}</div><div class="wert">${h(JSON.stringify(e.wert))}</div><div class="dim klein">${h(e.erklaerung)} · Version ${e.version}</div></div><button class="knopf klein still" data-tu="einstellung" data-s="${s}" data-name="${h(e.name)}">Ändern</button></div>`).join('') : '<p class="dim">Keine Einstellungen.</p>'}
    </div>
    <div class="abschnitt"><h3>Läufe</h3>
      ${D.laeufe.length ? `<table class="tabelle"><tr><th>Beginn</th><th>Dauer</th><th>Auslöser</th><th>Ergebnis</th></tr>${D.laeufe.map((x) => `<tr><td class="nowrap">${wann(x.beginn, true)}</td><td class="nowrap">${x.ende ? dauer(x.beginn, x.ende) : '<span class="ampel blau"></span>läuft'}</td><td class="nowrap">${h(x.ausgeloest)}${x.ausgeloest_von ? `<br><span class="dim klein">${h(x.ausgeloest_von)}</span>` : ''}</td><td class="${x.ok === false ? 'fehler' : ''}">${h(x.ergebnis || '')}${x.fehler ? `<br><span class="klein">${h(x.fehler)}</span>` : ''}</td></tr>`).join('')}</table>` : '<p class="dim">Noch keine Läufe.</p>'}
    </div>
    <div class="abschnitt"><h3>Versionen</h3>
      ${D.versionen.map((v) => `<div class="klein"><b>${v.version}</b> · ${wann(v.am, true)} · ${h(v.von)}<br><span class="dim">${h(v.grund)}</span></div>`).join('')}
    </div>
    ${(k.teile_alt || []).length ? `<div class="abschnitt"><h3>Heutige Teile</h3><p class="dim klein mono">${k.teile_alt.map(h).join(', ')}</p></div>` : ''}
  </div>`;
}

function seiteKnoepfe(arg) {
  if (breit()) return `<div class="inhalt zwei"><div class="spalte">${fehlerLeiste()}${knopfListe(arg)}</div><div class="spalte">${arg ? knopfDetail(arg) : `<div class="karte"><p class="dim">Knopf links auswählen.</p></div>`}</div></div>`;
  if (arg) return `<div class="inhalt">${fehlerLeiste()}${knopfDetail(arg)}</div>`;
  return `<div class="inhalt">${fehlerLeiste()}${knopfListe(null)}</div>`;
}

function seiteAblage() {
  const L = S.lage;
  const k7 = L?.knoepfe.find((k) => k.schluessel === 'postfach_ablegen');
  const V = S.ablage.vorschau, P = S.ablage.protokoll;
  const einst = Object.fromEntries((k7?.einstellungen || []).map((e) => [e.name, e.wert]));
  const laeuft = k7?.offen || S.ablage.laeuft;
  const kand = V?.kandidaten || [];
  return `<div class="inhalt">
    <div class="kopf"><div><h1>Postfach ablegen</h1><span class="dim klein">Knopf 7 · ${k7 ? `${STAND_TEXT[k7.stand]} · Version ${k7.version} · ${k7.an ? 'an' : 'aus'}` : ''}</span></div>
      <div class="reihe">${k7 ? `<button class="knopf still klein" data-tu="knopf" data-s="postfach_ablegen">Einstellungen und Läufe</button>` : ''}</div></div>
    ${fehlerLeiste()}
    ${S.ablage.meldung ? `<div class="hinweis gruen">${h(S.ablage.meldung)}</div>` : ''}
    <div class="karte">
      <p>Verschiebt obsolete Mails aus Deinem Postfach nach Archiv/Jahr: abgehakte, automatische Antworten und was laut Datenbank erledigt ist. Jede Mail wird gelesen, die Fahne auf erledigt gesetzt und bekommt das Kennzeichen <b>${h(einst.ABLAGE_KATEGORIE || 'KI abgelegt')}</b>. Nie bei offenem Haltegrund. Nichts wird gelöscht, jede Mail lässt sich einzeln zurückholen.</p>
      <p class="dim klein">Ordner: ${h((einst.ABLAGE_ORDNER || []).join(', '))} · höchstens ${h(String(einst.ABLAGE_HOECHSTMENGE || 150))} je Lauf</p>
      <div class="reihe">
        <button class="knopf still" data-tu="vorschau" ${S.laden.vorschau || laeuft ? 'disabled' : ''}>1. Vorschau</button>
        <button class="knopf" data-tu="ablegen" ${!V || !kand.length || laeuft || !k7?.an ? 'disabled' : ''}>2. Ablegen${kand.length ? ` (${Math.min(kand.length, Number(einst.ABLAGE_HOECHSTMENGE || 150))})` : ''}</button>
        ${S.laden.vorschau ? '<span class="laden">Postfach wird gelesen, bis zu zwei Minuten</span>' : ''}
        ${laeuft ? '<span class="laden">Ablage läuft</span>' : ''}
        ${!k7?.an ? '<span class="dim klein">Der Knopf ist aus.</span>' : ''}
      </div>
    </div>
    ${V ? `<div class="karte"><div class="kopf"><h2>Vorschau</h2><span class="dim klein">${V.anzahl} Kandidaten${V.zu_viel ? `, ${V.zu_viel} über der Höchstmenge` : ''} · ${V.gehalten.length} gehalten · ${Math.round(V.dauer_ms / 1000)} s${V.unvollstaendig ? ' · <span class="fehler">Suche unvollständig (Zeit), Rest beim nächsten Mal</span>' : ''}</span></div>
      ${kand.length ? `<table class="tabelle"><tr><th>Betreff</th><th class="optional">Von</th><th>Datum</th><th class="optional">Ordner</th><th>Grund</th></tr>${kand.map((m) => `<tr><td>${h(m.betreff)}<div class="dim klein optional-inv">${h(m.von)}</div></td><td class="optional">${h(m.von)}</td><td class="nowrap">${tag(m.datum)}</td><td class="optional">${h(m.ordner)} → ${h(m.jahr)}</td><td class="klein">${h(m.grund)}</td></tr>`).join('')}</table>` : '<p class="dim">Nichts abzulegen.</p>'}
      ${V.ohne_ziel?.length ? `<p class="hinweis">${V.ohne_ziel.length} Mails ohne Zielordner (Archiv/${[...new Set(V.ohne_ziel.map((x) => x.jahr))].join(', ')} fehlt in Outlook).</p>` : ''}
    </div>
    <div class="karte"><div class="kopf"><h2>Gehalten</h2><span class="dim klein">bleibt liegen, weil noch etwas daran hängt</span></div>
      ${V.gehalten.length ? `<table class="tabelle"><tr><th>Betreff</th><th>Datum</th><th class="optional">Wäre</th><th>Haltegrund</th></tr>${V.gehalten.map((m) => `<tr><td>${h(m.betreff)}<div class="dim klein">${h(m.von)}</div></td><td class="nowrap">${tag(m.datum)}</td><td class="optional klein">${h(m.grund)}</td><td class="klein">${h(m.halt)}</td></tr>`).join('')}</table>` : '<p class="dim">Keine.</p>'}
      <details style="margin-top:8px"><summary class="dim klein">Bericht je Ordner</summary><pre class="mono klein">${h(JSON.stringify(V.bericht, null, 1))}</pre></details>
    </div>` : ''}
    <div class="karte"><div class="kopf"><h2>Protokoll</h2><div class="reihe">${P?.lauf ? `<span class="dim klein">Lauf ${P.lauf.id} · ${wann(P.lauf.beginn, true)} · ${h(P.lauf.ergebnis || '')}</span>` : ''}<button class="knopf still klein" data-tu="protokoll">Neu laden</button></div></div>
      ${P?.zeilen?.length ? `<table class="tabelle"><tr><th>Betreff</th><th>Datum</th><th class="optional">Von → nach</th><th>Grund</th><th></th></tr>${P.zeilen.map((z) => `<tr><td>${h(z.betreff)}<div class="dim klein">${h(z.von)}</div></td><td class="nowrap">${tag(z.datum)}</td><td class="optional klein">${h(z.ordner || '')} → Archiv/${h(z.jahr || '')}</td><td class="klein">${h(z.grund)}${z.ergebnis !== 'OK' ? `<div class="fehler">${h(z.ergebnis || '')}</div>` : ''}</td><td class="rechts nowrap">${z.zurueck_am ? `<span class="dim klein">zurück ${wann(z.zurueck_am, true)}${z.zurueck_ergebnis !== 'OK' ? ` <span class="fehler">${h(z.zurueck_ergebnis)}</span>` : ''}</span>` : z.ergebnis === 'OK' ? `<button class="knopf klein still" data-tu="zurueck" data-id="${z.id}" ${S.laden['zurueck:' + z.id] ? 'disabled' : ''}>Zurück</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="dim">Noch nichts abgelegt.</p>'}
    </div>
  </div>`;
}

function seitePresse() {
  const k40 = S.lage?.knoepfe.find((k) => k.schluessel === 'alerts_kritiken');
  const P = S.presse, V = P.vorschau, D = P.daten;
  const laeuft = k40?.offen || P.laeuft;
  const z = D?.zahlen || {};
  const sicher = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
  const meldungenFrei = V ? V.alert_mails : 0;
  return `<div class="inhalt">
    <div class="kopf"><div><h1>Presse</h1><span class="dim klein">Knopf 40 · Google Alerts und Kritiken${k40 ? ` · ${STAND_TEXT[k40.stand]} · Version ${k40.version} · ${k40.an ? 'an' : 'aus'} · Wecker: ${h(taktText(k40.takt))}` : ''}</span></div>
      <div class="reihe">${k40 ? '<button class="knopf still klein" data-tu="knopf" data-s="alerts_kritiken">Wecker, Einstellungen, Läufe</button>' : ''}</div></div>
    ${fehlerLeiste()}
    ${P.meldung ? `<div class="hinweis gruen">${h(P.meldung)}</div>` : ''}
    ${P.zuletzt ? `<div class="hinweis reihe" style="justify-content:space-between"><span>„${h(String(P.zuletzt.titel).slice(0, 80))}“ geändert.</span><button class="knopf klein still" data-tu="p-zurueck">Rückgängig</button></div>` : ''}
    <div class="karte">
      <p>Liest die Google Alerts im Posteingang (Wiener KammerOrchester, Künstlersekretariat, YOOL), zieht jede Meldung heraus, erkennt Kritiken und lobende Stimmen als Werbebasis und legt die ausgewerteten Alert-Mails nach Archiv/Jahr ab, mit Kennzeichen und einzeln zurückholbar (Knopf 7, Protokoll). Doppelte Meldungen zählen einmal. Nichts wird gelöscht. Die Erkennung läuft nach Regeln, ohne Modellkosten.</p>
      <div class="reihe">
        <button class="knopf still" data-tu="p-vorschau" ${S.laden.pvorschau || laeuft ? 'disabled' : ''}>1. Vorschau</button>
        <button class="knopf" data-tu="p-auswerten" ${!V || !meldungenFrei || laeuft || !k40?.an ? 'disabled' : ''}>2. Auswerten und ablegen${meldungenFrei ? ` (${meldungenFrei})` : ''}</button>
        <button class="knopf still" data-tu="p-alt" ${laeuft || !k40?.an ? 'disabled' : ''}>Altbestand einlesen</button>
        ${S.laden.pvorschau ? '<span class="laden">Postfach wird gelesen, bis zu zwei Minuten</span>' : ''}${laeuft ? '<span class="laden">Auswertung läuft</span>' : ''}${!k40?.an ? '<span class="dim klein">Der Knopf ist aus.</span>' : ''}
      </div>
      <p class="dim klein" style="margin-top:8px">Altbestand: liest alte Alert-Mails aus der Datenbank (bis zu 500 je Klick), fasst das Postfach nicht an.</p>
    </div>
    ${V ? `<div class="karte"><div class="kopf"><h2>Vorschau</h2><span class="dim klein">${V.alert_mails} Alert-Mails · ${V.meldungen} Meldungen, davon ${V.davon_neu} neu · ${Math.round(V.dauer_ms / 1000)} s${V.unvollstaendig ? ' · <span class="fehler">unvollständig, Rest beim nächsten Mal</span>' : ''}</span></div>
      <div class="zahlen"><div class="zahl"><b>${V.kritiken_neu}</b><span>neue Kritiken</span></div><div class="zahl"><b>${V.werbebasis_neu}</b><span>neu für die Werbebasis</span></div><div class="zahl"><b>${V.ohne_bezug_neu}</b><span>ohne Bezug (nur Seitentext)</span></div><div class="zahl"><b>${V.davon_bekannt}</b><span>schon bekannt</span></div></div>
      ${V.beispiele?.length ? `<table class="tabelle" style="margin-top:10px"><tr><th>Alert</th><th>Datum</th><th>Meldungen</th></tr>${V.beispiele.map((m) => `<tr><td>${h(m.alert)}<div class="dim klein">${m.titel.map((t) => h(t.titel)).slice(0, 2).join(' · ')}</div></td><td class="nowrap">${tag(m.datum)}</td><td>${m.meldungen}</td></tr>`).join('')}</table>` : '<p class="dim">Keine Alert-Mails im Posteingang.</p>'}
      ${V.nicht_zerlegt?.length ? `<p class="hinweis" style="margin-top:8px">${V.nicht_zerlegt.length} Alert-Mails ließen sich nicht zerlegen und bleiben liegen: ${h(V.nicht_zerlegt.slice(0, 3).map((x) => x.betreff).join(' | '))}</p>` : ''}
      ${V.ohne_ziel?.length ? `<p class="hinweis">${V.ohne_ziel.length} Mails ohne Zielordner (Archiv/${[...new Set(V.ohne_ziel.map((x) => x.jahr))].join(', ')} fehlt in Outlook).</p>` : ''}
    </div>` : ''}
    <div class="karte"><div class="kopf"><h2>Sammlung</h2><span class="dim klein">${z.gesamt ?? 0} Meldungen insgesamt</span></div>
      <div class="reihe" role="group" aria-label="Filter">${PRESSE_FILTER.map(([f, t, zk]) => `<button class="chip ${P.filter === f ? 'an' : ''}" data-tu="p-filter" data-f="${f}">${t}${D ? ` (${z[zk] ?? 0})` : ''}</button>`).join('')}</div>
      ${!D ? '<div class="laden" style="margin-top:10px">Sammlung wird geladen</div>' : D.zeilen.length ? D.zeilen.map((t) => `<div class="treffer">
        <div><a href="${h(sicher(t.url))}" target="_blank" rel="noopener noreferrer">${h(t.titel)}</a></div>
        <div class="dim klein">${h(t.quelle || '')} · ${tag(t.erstmals_am)}${t.anzahl > 1 ? ` · ${t.anzahl}× gemeldet` : ''}${t.alert_name ? ` · Alert „${h(t.alert_name)}“` : ''}</div>
        ${t.auszug ? `<div class="auszug">${h(t.auszug)}</div>` : ''}
        <div class="reihe" style="margin-top:6px">
          <span class="marke ${t.art === 'KRITIK' ? 'an' : ''}">${t.art === 'KRITIK' ? 'Kritik' : t.art === 'PRESSE' ? 'Presse' : 'Web'}</span>${t.werbe ? '<span class="marke an">Werbebasis</span>' : ''}${!t.hat_bezug ? '<span class="marke">kein Bezug im Titel</span>' : ''}${t.status === 'GESEHEN' ? '<span class="marke">gesehen</span>' : ''}
          ${t.status === 'NEU' ? `<button class="knopf klein still" data-tu="p-set" data-id="${t.id}" data-status="GESEHEN">Gesehen</button>` : ''}
          <button class="knopf klein still" data-tu="p-set" data-id="${t.id}" data-werbe="${t.werbe ? 'nein' : 'ja'}">${t.werbe ? 'Aus Werbebasis' : 'In Werbebasis'}</button>
          <button class="knopf klein still" data-tu="p-set" data-id="${t.id}" data-status="VERWORFEN">Verwerfen</button>
        </div>
        ${(t.werbe_hinweis || []).length ? `<div class="dim klein">Lob erkannt an: ${h(t.werbe_hinweis.join(', '))}</div>` : ''}
      </div>`).join('') : '<p class="dim" style="margin-top:10px">Hier ist nichts.</p>'}
    </div>
  </div>`;
}

function seiteSteuerung() {
  const L = S.lage;
  if (!L) return `<div class="inhalt"><div class="laden">Steuerung wird geladen</div></div>`;
  const lw = L.laufwerk;
  return `<div class="inhalt">
    <div class="kopf"><h1>Steuerung</h1><span class="dim klein">Desk v${VERSION}</span></div>
    ${fehlerLeiste()}
    <div class="karte"><h2>Laufwerk</h2>
      ${lw ? `<dl class="fakten"><dt>Zeitplan</dt><dd>${h(lw.zeitplan)} (jede Minute), ${lw.aktiv ? '<span class="ok">aktiv</span>' : '<span class="fehler">aus</span>'}</dd><dt>Letzter Lauf</dt><dd>${lw.letzter_lauf ? `${wann(lw.letzter_lauf)} (${her(lw.letzter_lauf)}), ${h(lw.ergebnis)}` : 'noch keiner'}</dd>${lw.meldung ? `<dt>Meldung</dt><dd class="mono">${h(lw.meldung)}</dd>` : ''}</dl>` : '<p class="fehler">Kein Zeitplan desk_laufwerk gefunden.</p>'}
      <p class="dim klein">Das Laufwerk startet die Jetzt-Taste und fällige produktive Knöpfe, schließt Hänger ab und spiegelt die alten Zeitpläne, solange ein Bereich noch darüber läuft.</p>
    </div>
    <div class="karte"><h2>Kosten</h2>
      <div class="zahlen"><div class="zahl"><b>${usd(L.kosten.heute)}</b><span>heute</span></div><div class="zahl"><b>${usd(L.kosten.woche)}</b><span>7 Tage</span></div><div class="zahl"><b>${usd(L.kosten.monat)}</b><span>Monat</span></div></div>
      <table class="tabelle" style="margin-top:10px"><tr><th>Grenze</th><th>USD je Stunde</th><th>Wirkung</th><th>Pause bis</th></tr>${L.kosten.grenzen.map((g) => `<tr><td>${h(g.zweck)}</td><td>${h(g.usd_je_stunde ?? '')}</td><td>${h(g.wirkung || '')}</td><td>${g.pausiert_bis ? wann(g.pausiert_bis, true) : ''}</td></tr>`).join('')}</table>
    </div>
    <div class="karte"><h2>Schalter</h2><p class="dim klein">Die heutigen Schalter des Backoffice. Werden mit ihren Bereichen zu Einstellungen der Knöpfe.</p>
      <table class="tabelle"><tr><th></th><th>Name</th><th class="optional">Erklärung</th></tr>${L.schalter.map((s) => `<tr><td><span class="marke ${s.an ? 'an' : 'aus'}">${s.an ? 'an' : 'aus'}</span></td><td class="mono">${h(s.name)}</td><td class="optional klein dim">${h(s.erklaerung || '')}</td></tr>`).join('')}</table>
    </div>
    <div class="karte"><h2>Anmeldung</h2><p>${S.wer ? `${h(S.wer.name)}, ${h(S.wer.email)}` : ''}. Sitzung 30 Tage auf diesem Gerät.</p><button class="knopf still" data-tu="abmelden">Abmelden</button></div>
    <div class="karte"><h2>Version</h2><p>Desk v${VERSION}, Quelle ksb-leitstand desk/app, veröffentlicht über GitHub Pages. Register desk/versionen.json. Jede Änderung an Knöpfen und Einstellungen hat ihre eigene Version mit Grund.</p></div>
  </div>`;
}

function seiteTechnik() {
  const L = S.lage;
  const fehler = (L?.knoepfe || []).filter((k) => k.letzter_ok === false && k.stand !== 'GESTRICHEN').length;
  return `<div class="inhalt">
    <div class="kopf"><h1>Technik</h1><span class="dim klein">Desk v${VERSION}</span></div>
    ${fehlerLeiste()}
    <p class="dim">Hier liegt die Schaltzentrale: alle Knöpfe des Systems, das Laufwerk, Kosten, Schalter. Zur Kontrolle, nicht zum Arbeiten. Auf die Arbeitsfläche kommt ein Knopf erst, wenn er fertig ist.</p>
    <div class="karte"><a href="#heute"><h2>Heute</h2></a><p class="dim klein">Entscheidungen, Antwortschuld, Fehler der Knöpfe. Vorschau, bis der Postmeister steht.</p></div>
    <div class="karte"><a href="#knoepfe"><h2>Knöpfe</h2></a><p class="dim klein">${L ? `${L.knoepfe.filter((k) => k.stand !== 'GESTRICHEN').length} im Verzeichnis${fehler ? `, <span class="fehler">${fehler} mit Fehler</span>` : ''}` : 'wird geladen'}. Stand, letzter Lauf, an/aus mit Grund, Jetzt, Einstellungen, Versionen.</p></div>
    <div class="karte"><a href="#steuerung"><h2>Steuerung</h2></a><p class="dim klein">Laufwerk, Kosten, Schalter, Anmeldung.</p></div>
  </div>`;
}

// ---------- Rendern ----------
function render() {
  const { seite, arg } = route();
  if (!S.sitzung) { app.innerHTML = seiteAnmelden(); return; }
  let inhalt;
  if (seite === 'heute') inhalt = seiteHeute();
  else if (seite === 'knoepfe') inhalt = seiteKnoepfe(null);
  else if (seite === 'knopf') inhalt = seiteKnoepfe(arg);
  else if (seite === 'presse') inhalt = seitePresse();
  else if (seite === 'gespraech') inhalt = GS.seite(arg);
  else if (seite === 'projekte') inhalt = PR.seite('');
  else if (seite === 'projekt') inhalt = PR.seite(arg);
  else if (seite === 'technik') inhalt = seiteTechnik();
  else if (seite === 'steuerung') inhalt = seiteSteuerung();
  else inhalt = seiteAblage();
  const halt = GS.vorRender();
  app.innerHTML = menue(seite) + inhalt;
  GS.nachRender(halt);
}

async function seiteLaden() {
  if (!S.sitzung) { render(); return; }
  const { seite, arg } = route();
  if (!S.lage) await ladeLage();
  if (seite === 'heute') await ladeHeute();
  if (seite === 'knopf' && arg) { if (!S.knopf[arg]) render(); await ladeKnopf(arg); }
  if (seite === 'ablage' && !S.ablage.protokoll) { render(); await ablageProtokoll(null); }
  if (seite === 'presse') { render(); await presseLaden(); }
  if (seite === 'gespraech') { await GS.laden({ fid: arg.split('/')[0] }); return; }
  const pg = seite === 'projekt' && arg.match(/^(\d+)\/gespraech(?:\/(\d+))?/);
  if (pg) { await Promise.all([PR.laden(arg), GS.laden({ pid: Number(pg[1]), fid: pg[2] })]); return; }
  if (seite === 'projekte' || seite === 'projekt') { await PR.laden(seite === 'projekt' ? arg : ''); return; }
  render();
}

// ---------- Ereignisse ----------
app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-tu]');
  if (!el) return;
  const tu = el.dataset.tu, s = el.dataset.s;
  const k = (S.lage?.knoepfe || []).find((x) => x.schluessel === s) || (S.knopf[s]?.knopf ? { ...S.knopf[s].knopf, ausfuehrung: !!S.knopf[s].knopf.ausfuehrung } : null);
  if (tu === 'fehler-weg') { S.fehler = null; render(); }
  else if (tu === 'nav') nav(el.dataset.ziel);
  else if (tu === 'knopf') { ev.stopPropagation(); nav('knopf/' + s); }
  else if (tu === 'schalten') { ev.stopPropagation(); if (k) await schalten(k); }
  else if (tu === 'jetzt') { ev.stopPropagation(); if (k) await jetzt(k); }
  else if (tu === 'einstellung') { const e = S.knopf[s]?.einstellungen.find((x) => x.name === el.dataset.name); if (e) await einstellungAendern(s, e); }
  else if (tu === 'vorschau') await ablageVorschau();
  else if (tu === 'ablegen') {
    const V = S.ablage.vorschau; if (!V) return;
    const n = Math.min(V.kandidaten.length, V.hoechstmenge);
    if (!confirm(`${n} Mails jetzt ablegen?\nGelesen, Fahne erledigt, Kennzeichen „${V.kategorie}“, nach Archiv/Jahr. Jede Mail lässt sich zurückholen.`)) return;
    const k7 = (S.lage?.knoepfe || []).find((x) => x.schluessel === 'postfach_ablegen');
    if (k7) await jetzt(k7, { limit: V.hoechstmenge });
  }
  else if (tu === 'protokoll') { await ablageProtokoll(null); render(); }
  else if (tu === 'zurueck') { const z = S.ablage.protokoll?.zeilen.find((x) => String(x.id) === el.dataset.id); if (z) await ablageZurueck(z); }
  else if (tu === 'p-vorschau') await presseVorschau();
  else if (tu === 'p-auswerten') {
    const V = S.presse.vorschau; if (!V) return;
    if (!confirm(`${V.alert_mails} Alert-Mails jetzt auswerten und ablegen?\nDie Meldungen kommen in die Sammlung. Die Mails werden gelesen, mit „${V.kategorie}“ gekennzeichnet und nach Archiv/Jahr gelegt. Jede lässt sich zurückholen.`)) return;
    const k40 = (S.lage?.knoepfe || []).find((x) => x.schluessel === 'alerts_kritiken');
    if (k40) await jetzt(k40, { limit: V.hoechstmenge });
  }
  else if (tu === 'p-alt') {
    if (!confirm('Alte Alert-Mails aus der Datenbank einlesen (bis zu 500 je Klick)?\nDas Postfach wird nicht angefasst, es entstehen keine Kosten.')) return;
    const k40 = (S.lage?.knoepfe || []).find((x) => x.schluessel === 'alerts_kritiken');
    if (k40) await jetzt(k40, { modus: 'altbestand', limit: 500 });
  }
  else if (tu === 'p-filter') { S.presse.filter = el.dataset.f; S.presse.daten = null; render(); await presseLaden(); render(); }
  else if (tu === 'p-set') {
    const id = Number(el.dataset.id), t = (S.presse.daten?.zeilen || []).find((x) => x.id === id); if (!t) return;
    if (el.dataset.status) await presseSetzen(id, { status: el.dataset.status }, { status: t.status });
    else await presseSetzen(id, { werbe: el.dataset.werbe === 'ja' }, { werbe: t.werbe });
  }
  else if (tu === 'p-zurueck') { const u = S.presse.zuletzt; if (u) { try { await api('presse_setzen', { id: u.id, ...u.patch }); S.presse.zuletzt = null; await presseLaden(true); } catch (e) { S.fehler = e.message; } render(); } }
  else if (tu === 'w-plus' || tu === 'w-minus' || tu === 'w-tag' || tu === 'w-werktags' || tu === 'w-taeglich') {
    const r = route(); const k0 = S.knopf[r.arg]?.knopf; if (!k0) return;
    const w = weckerEntwurf(k0);
    if (tu === 'w-plus') w.zeiten.push(w.zeiten.length ? w.zeiten[w.zeiten.length - 1] : '08:00');
    else if (tu === 'w-minus') w.zeiten.splice(Number(el.dataset.i), 1);
    else if (tu === 'w-tag') { const n = Number(el.dataset.t); w.tage = w.tage.includes(n) ? w.tage.filter((x) => x !== n) : [...w.tage, n]; }
    else if (tu === 'w-werktags') w.tage = [1, 2, 3, 4, 5];
    else w.tage = [1, 2, 3, 4, 5, 6, 7];
    render();
  }
  else if (tu === 'w-speichern') await weckerSpeichern(s);
  else if (tu === 'w-verwerfen') { delete S.wecker[s]; render(); }
  else if (tu === 'abmelden') await abmelden();
});
app.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-w]'); if (!el) return;
  const r = route(); const k0 = S.knopf[r.arg]?.knopf; if (!k0) return;
  const w = weckerEntwurf(k0), a = el.dataset.w;
  if (a === 'zeit') w.zeiten[Number(el.dataset.i)] = el.value;
  else if (a === 'modus') w.modus = el.value;
  else w[a] = el.value;
  render();
});
app.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();
  if (f.dataset.form === 'anmelden') await anmelden(new FormData(f).get('email'));
});
window.addEventListener('hashchange', () => { if (/^#t=/.test(location.hash)) { location.reload(); return; } seiteLaden(); });
window.addEventListener('resize', () => { clearTimeout(window.__rs); window.__rs = setTimeout(render, 150); });

// ---------- Start ----------
(async () => {
  const m = location.hash.match(/#t=([A-Za-z0-9_-]{20,})/);
  if (m) { await einloesen(m[1]); }
  if (S.sitzung && !S.wer) { try { const w = await api('wer'); S.wer = { email: w.email, name: w.name }; } catch { /* abgemeldet, zeigt Anmeldung */ } }
  if (!location.hash || location.hash.startsWith('#t=')) history.replaceState(null, '', location.pathname + '#ablage');
  await seiteLaden();
  pollen();
})();
