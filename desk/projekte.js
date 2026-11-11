// Desk v19 (11.11.2026): Weingüter als aufklappbare Karten mit Anfrage, Antwort, Angeboten, Marge und Konditionen, Lage oben, leere Spalten weg, Liste nach Stand gruppiert.
// Desk v18 (10.11.2026): Projekte. Drei Ebenen: Projekt, Bereich (Unterprojekt), Posten (Karte). Der Projekttyp legt Ansichten, Stände und Kartenfelder fest.
// Ansichten je Bereich: Liste, Kanban, Tabelle, Termine. Am Handy ist die Liste die Vorgabe. Die gewählte Ansicht merkt sich das Gerät.
// Typ „Ausschreibung“: Rechner mit Angeboten, Szenarien, Zuschlag, Fragen bündeln. Gerechnet wird in der Datenbank (desk.szenario_rechnen), nicht hier.
// Jede Änderung braucht einen Grund und bekommt eine Version. Mails entstehen nur als Entwurf, gesendet wird nur von Christian.
const FEHLT = '–';
const eur = (n) => (n == null ? FEHLT : Number(n).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const ganz = (n) => (n == null ? FEHLT : Math.round(Number(n)).toLocaleString('de-AT'));
const datum = (d) => { if (!d) return ''; const [y, m, t] = String(d).slice(0, 10).split('-'); return `${t}.${m}.${y}`; };
const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const ANSICHTEN = { liste: 'Liste', kanban: 'Kanban', tabelle: 'Tabelle', kalender: 'Termine' };
const PA = { anbieter: 'weingut', fragen: 'frage', verkostungen: 'verkostung', bereich: 'posten' }; // Art der Posten je Art des Bereichs; Kopf und Strang erben die Art
const STAND_STANDARD = [{ k: 'offen', n: 'offen' }, { k: 'erledigt', n: 'erledigt' }];
const TYPEN = [['ausschreibung', 'Ausschreibung mit Angeboten'], ['standard', 'Standard']];
const MODI = [['flasche', 'Marge pro Flasche'], ['weingut', 'Pro Weingut'], ['gesamt', 'Gesamtvolumen']];

export function projekteModul(ctx) {
  const { api, h, app, render, grundFragen, fehler } = ctx;
  const P = { liste: null, d: null, id: null, haken: [], rech: null, modus: 'flasche', szRech: {}, szName: null, meldung: null, laden: false, offen: new Set() };

  // ---------- Hilfen ----------
  const schmal = () => window.matchMedia('(max-width: 699px)').matches;
  const merk = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* egal */ } return null; };
  const E = () => P.d?.eintraege || [];
  const bereiche = () => E().filter((e) => e.ebene === 2 && e.aktiv);
  const posten = (bid) => E().filter((e) => e.ebene === 3 && e.aktiv && e.parent_id === bid);
  const eintrag = (id) => E().find((e) => e.id === Number(id));
  const artInfo = (b) => P.d?.typ?.arten?.[b?.art] || {};
  const staende = (b) => artInfo(b).staende || STAND_STANDARD;
  const standName = (b, k) => (k ? (staende(b).find((s) => s.k === k)?.n || k) : 'ohne Stand');
  const ballListe = () => P.d?.typ?.baelle || ['wir'];
  const hat = (f) => (P.d?.typ?.funktionen || []).includes(f);
  const angeboteVon = (pid) => (P.d?.angebote || []).filter((a) => a.posten_id === pid && a.aktiv);
  const kategorien = () => P.d?.projekt?.daten?.kategorien || [];
  const richtwert = (code) => kategorien().find((k) => k.code === code);
  const istAnbieter = (b) => b?.art === 'anbieter';
  const margeVon = (a) => (a.verkauf != null && a.einkauf != null ? Number(a.verkauf) - Number(a.einkauf) : null);
  const offenKey = () => `desk.offen.${P.id}`;
  function offenLaden() { try { P.offen = new Set(JSON.parse(merk(offenKey()) || '[]')); } catch { P.offen = new Set(); } }
  function offenMerken() { merk(offenKey(), JSON.stringify([...P.offen])); }
  function gesperrt(p, a) {
    const sp = P.d?.projekt?.daten?.sperrliste || [];
    const w = String(a.wein || '').toLowerCase(), n = String(p.name || '').toLowerCase();
    return sp.some((x) => n.includes(String(x.weingut).toLowerCase()) && w.includes(String(x.wein).toLowerCase()));
  }
  function ansicht(b) {
    const ok = artInfo(b).ansichten || ['liste'];
    const gemerkt = merk(`desk.ansicht.${P.id}.${b.id}`);
    if (gemerkt && ok.includes(gemerkt)) return gemerkt;
    const vorgabe = schmal() ? (artInfo(b).handy || 'liste') : (artInfo(b).standard || 'liste');
    return ok.includes(vorgabe) ? vorgabe : ok[0];
  }
  const ballMarke = (b) => (b ? `<span class="marke ${b === 'wir' ? 'ball-wir' : ''}">Ball: ${h(b)}</span>` : '');

  // ---------- Laden ----------
  async function ladeListe() { P.laden = true; try { P.liste = (await api('projekte')).projekte; } catch (e) { fehler(e.message); } P.laden = false; }
  async function ladeProjekt(id) {
    P.laden = true;
    try { const neuId = P.id !== Number(id); P.d = await api('projekt', { id }); P.id = Number(id); if (neuId) offenLaden(); } catch (e) { fehler(e.message); P.d = null; }
    P.laden = false;
  }
  async function rechnen() {
    if (!P.haken.length) { P.rech = null; return; }
    try { P.rech = (await api('szenario_rechnen', { wurzel: P.id, haken: P.haken })).rechnung; } catch (e) { fehler(e.message); }
  }
  async function szenarienRechnen() {
    const sz = P.d?.szenarien || [];
    const r = await Promise.all(sz.map(async (s) => { try { return [s.id, (await api('szenario_rechnen', { wurzel: P.id, haken: s.haken })).rechnung]; } catch { return [s.id, null]; } }));
    P.szRech = Object.fromEntries(r);
  }
  async function laden(arg) {
    const t = String(arg || '').split('/');
    if (!t[0]) { await ladeListe(); render(); return; }
    if (P.id !== Number(t[0]) || !P.d) { P.d = null; P.haken = []; P.rech = null; P.szRech = {}; render(); await ladeProjekt(t[0]); }
    else { render(); await ladeProjekt(t[0]); }
    if (t[1] === 'rechner') { await szenarienRechnen(); await rechnen(); }
    render();
  }

  // ---------- Dialoge ----------
  function feld(f) {
    const v = f.v ?? '';
    const l = `<span class="fl">${h(f.l)}</span>`;
    if (f.typ === 'select') return `<label class="ff">${l}<select name="${f.n}">${f.opt.map(([a, b]) => `<option value="${h(a)}" ${String(a) === String(v) ? 'selected' : ''}>${h(b)}</option>`).join('')}</select></label>`;
    if (f.typ === 'area') return `<label class="ff">${l}<textarea name="${f.n}" rows="3">${h(v)}</textarea></label>`;
    if (f.typ === 'check') return `<label class="ff check"><input type="checkbox" name="${f.n}"> ${h(f.l)}</label>`;
    return `<label class="ff">${l}<input type="${f.typ || 'text'}" name="${f.n}" value="${h(v)}" ${f.typ === 'number' ? 'step="any" inputmode="decimal"' : ''}></label>`;
  }
  function formular(titel, text, felder, grundVorgabe) {
    return new Promise((res) => {
      const d = document.createElement('dialog'); d.className = 'formdlg';
      d.innerHTML = `<form method="dialog"><h3>${h(titel)}</h3>${text ? `<p class="dim klein">${h(text)}</p>` : ''}${felder.map(feld).join('')}
        <label class="ff"><span class="fl">Grund, steht in der Version</span><textarea name="__grund" rows="2" required>${h(grundVorgabe || '')}</textarea></label>
        <div class="dlg-knoepfe"><button type="button" class="knopf still" data-x="nein">Abbrechen</button><button class="knopf">Übernehmen</button></div></form>`;
      document.body.appendChild(d);
      const f = d.querySelector('form');
      const zu = (v) => { try { d.close(); } catch { /* zu */ } d.remove(); res(v); };
      d.querySelector('[data-x=nein]').onclick = () => zu(null);
      d.addEventListener('cancel', () => zu(null));
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const fd = new FormData(f), w = {};
        for (const fe of felder) w[fe.n] = fe.typ === 'check' ? fd.get(fe.n) === 'on' : String(fd.get(fe.n) ?? '').trim();
        const grund = String(fd.get('__grund') || '').trim();
        if (grund) zu({ werte: w, grund });
      };
      d.showModal();
    });
  }
  function fenster(html) {
    const d = document.createElement('dialog'); d.className = 'formdlg breit';
    d.innerHTML = html + `<div class="dlg-knoepfe"><button type="button" class="knopf still" data-x="zu">Schließen</button></div>`;
    document.body.appendChild(d);
    d.querySelector('[data-x=zu]').onclick = () => { d.close(); d.remove(); };
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return d;
  }
  const zuFenster = () => { document.querySelectorAll('dialog.formdlg').forEach((d) => { try { d.close(); } catch { /* zu */ } d.remove(); }); };

  // ---------- Karten ----------
  function angebotZeilen(p) {
    return angeboteVon(p.id).map((a) => {
      const m = a.verkauf != null && a.einkauf != null ? Number(a.verkauf) - Number(a.einkauf) : null;
      return `<div class="klein">${h(a.wein)}${a.jahrgang ? ' ' + h(a.jahrgang) : ''} · EK ${eur(a.einkauf)}${m != null ? ` · <span class="${m < 0 ? 'fehler' : ''}">Marge ${eur(m)}</span>` : ''}</div>`;
    }).join('');
  }
  // ---------- Weingut-Karte (v19): zu zeigt sie das Wichtigste, aufgeklappt alles bis zu den Konditionen ----------
  function kurzLage(p) {
    const dt = p.daten || {}, an = angeboteVon(p.id);
    if (an.length) {
      const m = an.map(margeVon).filter((x) => x != null);
      const best = m.length ? Math.max(...m) : null;
      return `${an.length} ${an.length === 1 ? 'Angebot' : 'Angebote'}${best != null ? ` · Marge bis <b class="${best < 0 ? 'fehler' : 'gut'}">${eur(best)} €</b>` : ''}`;
    }
    if (dt.antwort_am) return `Antwort vom ${datum(dt.antwort_am)}`;
    if (dt.angeschrieben_am) return `angeschrieben ${datum(dt.angeschrieben_am)}, noch keine Antwort`;
    return '';
  }
  function angebotZeile(p, a) {
    const k = richtwert(a.kategorie), m = margeVon(a);
    const ueberRw = k && a.einkauf != null && Number(a.einkauf) > Number(k.richtwert);
    const ueberZiel = k && !ueberRw && a.einkauf != null && Number(a.einkauf) > Number(k.ziel);
    return `<div class="wk-ang">
      <div><b>${h(a.wein)}</b>${a.jahrgang ? ' ' + h(a.jahrgang) : ''}</div>
      <div class="reihe klein" style="gap:6px;margin:2px 0">${k ? `<span class="marke">${h(k.klasse)} · ${h(k.name)}</span>` : a.kategorie ? `<span class="marke">${h(a.kategorie)}</span>` : '<span class="marke">ohne Los</span>'}${a.stufe === 'indikativ' ? '<span class="marke">nur Preisangabe</span>' : ''}${gesperrt(p, a) ? '<span class="marke warn">gesperrt</span>' : ''}${ueberRw ? '<span class="marke warn">über Richtwert</span>' : ''}${ueberZiel ? '<span class="marke gelb">über Zielpreis</span>' : ''}</div>
      <div class="wk-zahlen klein"><span>Einkauf <b>${eur(a.einkauf)}</b></span><span>an ANA ${eur(a.verkauf)}</span><span>Marge <b class="${m != null && m < 0 ? 'fehler' : 'gut'}">${eur(m)}</b></span>${a.menge ? `<span>${ganz(a.menge)} Fl.</span>` : ''}${a.verschluss ? `<span>${h(a.verschluss)}</span>` : ''}</div>
      ${a.notiz ? `<div class="dim klein">${h(a.notiz)}</div>` : ''}
      <button class="knopf klein still" data-pr="w-a-aendern" data-id="${p.id}" data-aid="${a.id}">Angebot ändern</button>
    </div>`;
  }
  function weingutKarte(p, b) {
    const dt = p.daten || {}, an = angeboteVon(p.id), auf = P.offen.has(p.id);
    const liste = (l) => (Array.isArray(l) && l.length ? `<ul class="wk-liste">${l.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : '');
    const teil = (t, inhalt) => (inhalt ? `<div class="wk-teil"><div class="wk-t">${t}</div>${inhalt}</div>` : '');
    return `<div class="pkarte wk ${auf ? 'offen' : ''} ${dt.warnung ? 'mit-warnung' : ''}" data-karte="${p.id}">
      <div class="wk-kopf" data-pr="auf" data-id="${p.id}" role="button" tabindex="0" aria-expanded="${auf}">
        <div class="pk-kopf"><b>${h(p.name)}</b><span class="reihe" style="gap:4px">${dt.anrede ? `<span class="dim klein">${dt.anrede === 'du' ? 'Du' : 'Sie'}</span>` : ''}${ballMarke(p.ball)}</span></div>
        ${dt.ansprechperson ? `<div class="dim klein">${h(dt.ansprechperson)}</div>` : ''}
        <div class="klein wk-lage">${kurzLage(p)}</div>
        ${dt.warnung ? `<div class="klein fehler">${h(dt.warnung)}</div>` : ''}
        ${p.naechster_schritt && p.naechster_schritt !== 'keiner' ? `<div class="klein wk-schritt">${h(p.naechster_schritt)}</div>` : ''}
        <div class="wk-pfeil dim klein">${auf ? 'Zuklappen ▴' : 'Konditionen ▾'}</div>
      </div>
      <div class="wk-auf">
        ${teil(`Angefragt${dt.angeschrieben_am ? ' am ' + datum(dt.angeschrieben_am) : ''}`, liste(dt.angefragt))}
        ${teil(`Antwort${dt.antwort_am ? ' vom ' + datum(dt.antwort_am) : ''}`, dt.antwort ? `<p class="klein">${h(dt.antwort)}</p>` : '<p class="klein dim">Noch keine Antwort.</p>')}
        ${an.length ? teil('Angebote', an.map((a) => angebotZeile(p, a)).join('')) : ''}
        ${teil('Konditionen', liste(dt.konditionen))}
        ${dt.hinweis ? teil('Hinweis', `<p class="klein">${h(dt.hinweis)}</p>`) : ''}
        ${teil('Kontakt', [dt.ansprechperson, dt.email].filter(Boolean).map((x) => `<div class="klein">${h(x)}</div>`).join(''))}
        <div class="reihe wk-knoepfe">
          ${p.link ? `<a class="knopf klein still" href="${h(p.link)}" target="_blank" rel="noopener">Mail öffnen</a>` : ''}
          <button class="knopf klein still" data-pr="w-angebot" data-id="${p.id}">+ Angebot</button>
          <button class="knopf klein still" data-pr="w-aendern" data-id="${p.id}">Ändern</button>
        </div>
        <select class="stand-wahl" data-pr="stand" data-id="${p.id}" aria-label="Stand">${[{ k: '', n: 'ohne Stand' }, ...staende(b)].map((s) => `<option value="${h(s.k)}" ${(p.stand || '') === s.k ? 'selected' : ''}>${h(s.n)}</option>`).join('')}</select>
      </div>
    </div>`;
  }
  function lageAnbieter(b) {
    const ps = posten(b.id);
    const ang = ps.filter((p) => p.stand && p.stand !== 'nicht_angeschrieben');
    const warten = ps.filter((p) => p.stand === 'angeschrieben');
    const absage = ps.filter((p) => p.stand === 'abgesagt');
    const mitAng = ps.filter((p) => angeboteVon(p.id).length);
    const antw = ang.length - warten.length;
    const wir = ps.filter((p) => p.ball === 'wir');
    const fr = warten.map((p) => p.frist).filter(Boolean).sort()[0];
    const z = (n, t) => `<div class="zahl"><b>${n}</b><span>${t}</span></div>`;
    return `<div class="karte wk-lagekarte"><div class="zahlen">${z(ang.length, 'angeschrieben')}${z(antw, 'geantwortet')}${z(warten.length, 'ohne Antwort')}${z(mitAng.length, 'mit Angebot')}${z(absage.length, 'abgesagt')}${z(wir.length, 'Ball bei uns')}</div>
      ${fr ? `<p class="dim klein" style="margin:8px 0 0">Wer bis ${datum(fr)} nicht antwortet, fällt raus. Kein Nachfass.</p>` : ''}
      <div class="reihe" style="margin-top:8px"><button class="chip" data-pr="alle-auf" data-id="${b.id}">Alle aufklappen</button><button class="chip" data-pr="alle-zu" data-id="${b.id}">Alle zuklappen</button></div></div>`;
  }
  function karteHtml(p, b) {
    if (p.art === 'weingut') return weingutKarte(p, b);
    const dt = p.daten || {};
    return `<div class="pkarte" data-pr="karte" data-id="${p.id}">
      <div class="pk-kopf"><b>${h(p.name)}</b>${dt.anrede ? `<span class="dim klein">${h(dt.anrede === 'du' ? 'Du' : 'Sie')}</span>` : ''}</div>
      ${dt.ansprechperson ? `<div class="dim klein">${h(dt.ansprechperson)}</div>` : ''}
      <div class="reihe" style="margin:4px 0">${ballMarke(p.ball)}${p.frist ? `<span class="marke">${datum(p.frist)}</span>` : ''}</div>
      ${angebotZeilen(p)}
      ${p.naechster_schritt ? `<div class="klein" style="margin-top:4px">${h(p.naechster_schritt)}</div>` : ''}
      ${dt.hinweis ? `<div class="dim klein">${h(dt.hinweis)}</div>` : ''}
      ${p.link ? `<div class="klein"><a href="${h(p.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Mail</a></div>` : ''}
      <select class="stand-wahl" data-pr="stand" data-id="${p.id}" onclick="event.stopPropagation()" aria-label="Stand">${[{ k: '', n: 'ohne Stand' }, ...staende(b)].map((s) => `<option value="${h(s.k)}" ${(p.stand || '') === s.k ? 'selected' : ''}>${h(s.n)}</option>`).join('')}</select>
    </div>`;
  }
  function ansichtKanban(b) {
    const ps = posten(b.id), st = staende(b);
    const ohne = ps.filter((p) => !p.stand || !st.some((s) => s.k === p.stand));
    const spalten = [...st.map((s) => ({ k: s.k, n: s.n, ps: ps.filter((p) => p.stand === s.k) })), ...(ohne.length ? [{ k: '', n: 'ohne Stand', ps: ohne }] : [])];
    const zeigen = istAnbieter(b) ? spalten.filter((c) => c.ps.length) : spalten;
    return `<div class="kanban">${zeigen.map((c) => `<div class="spalte-k"><div class="sk-kopf"><b>${h(c.n)}</b> <span class="dim klein">${c.ps.length}</span></div>${c.ps.map((p) => karteHtml(p, b)).join('') || '<div class="dim klein">leer</div>'}</div>`).join('')}</div>`;
  }
  function ansichtListe(b) {
    if (istAnbieter(b)) {
      const ps = posten(b.id), st = staende(b);
      // Am Handy zuerst, wo wir dran sind: Angebote, Verkostung, Antworten; Wartende und Absagen unten.
      const REIHE = ['angebot', 'verkostung', 'geantwortet', 'frage_ana', 'ausgewaehlt', 'angeschrieben', 'abgesagt', 'nicht_angeschrieben'];
      const rang = (k) => { const i = REIHE.indexOf(k); return i < 0 ? 99 : i; };
      const gr = [...st.slice().sort((x, y) => rang(x.k) - rang(y.k)).map((s) => ({ n: s.n, ps: ps.filter((p) => p.stand === s.k) })), { n: 'ohne Stand', ps: ps.filter((p) => !p.stand || !st.some((s) => s.k === p.stand)) }].filter((g) => g.ps.length);
      return gr.map((g) => `<div class="gruppe"><div class="sk-kopf"><b>${h(g.n)}</b> <span class="dim klein">${g.ps.length}</span></div><div class="pliste">${g.ps.slice().sort((x, y) => (x.ball === 'wir' ? 0 : 1) - (y.ball === 'wir' ? 0 : 1) || x.sort - y.sort).map((p) => karteHtml(p, b)).join('')}</div></div>`).join('') || '<p class="dim">Noch nichts eingetragen.</p>';
    }
    const ps = posten(b.id).slice().sort((x, y) => (x.ball === 'wir' ? 0 : 1) - (y.ball === 'wir' ? 0 : 1) || String(x.frist || '9999').localeCompare(String(y.frist || '9999')) || x.sort - y.sort);
    return ps.length ? `<div class="pliste">${ps.map((p) => `<div class="pzeile">${karteHtml(p, b)}<div class="dim klein standtext">${h(standName(b, p.stand))}</div></div>`).join('')}</div>` : '<p class="dim">Noch nichts eingetragen.</p>';
  }
  function ansichtTabelle(b) {
    const ps = posten(b.id);
    if (!ps.length) return '<p class="dim">Noch nichts eingetragen.</p>';
    return `<table class="tabelle"><tr><th>Name</th><th>Stand</th><th>Ball</th><th class="optional">Nächster Schritt</th><th>Frist</th><th class="optional">Angebot</th></tr>${ps.map((p) => `<tr class="klick" data-pr="karte" data-id="${p.id}"><td>${h(p.name)}</td><td>${h(standName(b, p.stand))}</td><td>${h(p.ball || '')}</td><td class="optional klein">${h(p.naechster_schritt || '')}</td><td class="nowrap">${datum(p.frist)}</td><td class="optional klein">${angebotZeilen(p)}</td></tr>`).join('')}</table>`;
  }
  function ansichtKalender(b) {
    const ps = posten(b.id).filter((p) => p.frist).sort((x, y) => String(x.frist).localeCompare(String(y.frist)));
    if (!ps.length) return '<p class="dim">Keine Termine mit Datum.</p>';
    const gruppen = {};
    for (const p of ps) { const [y, m] = p.frist.slice(0, 10).split('-'); (gruppen[`${y}-${m}`] ||= []).push(p); }
    return Object.entries(gruppen).map(([k, l]) => { const [y, m] = k.split('-'); return `<div class="monat"><h3>${MONATE[Number(m) - 1]} ${y}</h3>${l.map((p) => `<div class="termin" data-pr="karte" data-id="${p.id}"><span class="nowrap"><b>${datum(p.frist)}</b></span><span>${h(p.name)}${p.daten?.genau ? ` <span class="dim klein">${h(p.daten.genau)}</span>` : ''}${p.naechster_schritt ? `<div class="dim klein">${h(p.naechster_schritt)}</div>` : ''}</span>${ballMarke(p.ball)}</div>`).join('')}</div>`; }).join('');
  }
  function ansichtKopfExtra(b) {
    if (b.art !== 'kopf') return '';
    const dt = P.d.projekt.daten || {}, sp = dt.sperrliste || [], rg = dt.regeln || [];
    const nachWg = {};
    for (const s of sp) (nachWg[s.weingut] ||= []).push(s.wein);
    return `<div class="karte"><h2>Sperrliste</h2><p class="dim klein">Abgelehnte Weine dürfen nie wieder angeboten werden. Der Rechner warnt, wenn einer angehakt ist.</p>
      ${Object.entries(nachWg).map(([w, l]) => `<div><b>${h(w)}</b>: ${l.map(h).join(', ')}</div>`).join('') || '<p class="dim">Leer.</p>'}</div>
      ${rg.length ? `<div class="karte"><h2>Regeln dieses Projekts</h2><ul>${rg.map((r) => `<li>${h(r)}</li>`).join('')}</ul></div>` : ''}`;
  }
  function seiteBereich(b) {
    const a = ansicht(b), ok = artInfo(b).ansichten || ['liste'];
    const offeneFragen = b.art === 'fragen' ? posten(b.id).filter((p) => p.stand === 'offen').length : 0;
    const body = a === 'kanban' ? ansichtKanban(b) : a === 'tabelle' ? ansichtTabelle(b) : a === 'kalender' ? ansichtKalender(b) : ansichtListe(b);
    return `<div class="kopf"><h2>${h(b.name)}</h2><div class="reihe">
        ${ok.length > 1 ? ok.map((x) => `<button class="chip ${x === a ? 'an' : ''}" data-pr="ansicht" data-id="${b.id}" data-a="${x}">${ANSICHTEN[x]}</button>`).join('') : ''}
        <button class="knopf klein" data-pr="neu" data-id="${b.id}">+ Neu</button>
        ${b.art === 'fragen' ? `<button class="knopf klein still" data-pr="fragen" ${offeneFragen ? '' : 'disabled'}>Fragen bündeln (${offeneFragen})</button>` : ''}
      </div></div>${P.meldung ? `<div class="hinweis gruen">${P.meldung}</div>` : ''}${istAnbieter(b) ? lageAnbieter(b) : ''}${body}${ansichtKopfExtra(b)}`;
  }

  // ---------- Rechner ----------
  function seiteRechner() {
    const as = (P.d.angebote || []).filter((a) => a.aktiv);
    const R = P.rech, zl = Object.fromEntries((R?.zeilen || []).map((z) => [z.angebot_id, z]));
    const pn = Object.fromEntries(E().filter((e) => e.ebene === 3).map((e) => [e.id, e]));
    const zeilen = as.slice().sort((x, y) => String(pn[x.posten_id]?.name).localeCompare(String(pn[y.posten_id]?.name)) || x.id - y.id);
    const kopfSpalten = P.modus === 'flasche' ? '<th class="rechts">Marge/Fl.</th><th class="rechts optional">Marge %</th>' : '<th class="rechts optional">Menge</th><th class="rechts">Marge gesamt</th>';
    const tab = `<table class="tabelle rechner"><tr><th></th><th>Weingut</th><th>Wein</th><th class="optional">Los</th><th class="rechts">EK</th><th class="rechts optional">VK</th>${kopfSpalten}</tr>${zeilen.map((a) => {
      const m = a.verkauf != null && a.einkauf != null ? Number(a.verkauf) - Number(a.einkauf) : null;
      const an = P.haken.includes(a.id), z = zl[a.id];
      const zelle = P.modus === 'flasche'
        ? `<td class="rechts ${m != null && m < 0 ? 'fehler' : ''}">${eur(m)}</td><td class="rechts optional">${m != null && a.verkauf > 0 ? (m / a.verkauf * 100).toFixed(1).replace('.', ',') + ' %' : FEHLT}</td>`
        : `<td class="rechts optional">${ganz(a.menge)}</td><td class="rechts ${m != null && m < 0 ? 'fehler' : ''}">${m != null && a.menge ? eur(m * a.menge) : FEHLT}</td>`;
      return `<tr class="${an ? 'gewaehlt' : ''}"><td><input type="checkbox" data-pr="haken" data-id="${a.id}" ${an ? 'checked' : ''} aria-label="Zuschlag"></td><td>${h(pn[a.posten_id]?.name || '')}</td><td>${h(a.wein)}${a.jahrgang ? ' ' + h(a.jahrgang) : ''}${a.stufe === 'indikativ' ? ' <span class="marke">nur Preisangabe</span>' : ''}${an && z && !z.zaehlt ? `<div class="fehler klein">zählt nicht: ${h(z.grund || '')}</div>` : ''}</td><td class="optional klein">${h(a.kategorie || '')}</td><td class="rechts">${eur(a.einkauf)}</td><td class="rechts optional">${eur(a.verkauf)}</td>${zelle}</tr>`;
    }).join('') || '<tr><td colspan="8" class="dim">Noch keine Angebote.</td></tr>'}</table>`;
    const g = R?.gesamt, k = R?.kosten;
    const hatKosten = k && (Number(k.fix) || Number(k.variabel_pro_flasche));
    const leiste = `<div class="summe karte"><div class="zahlen">
      <div class="zahl"><b>${R ? eur(g.umsatz) : FEHLT}</b><span>Volumen an ANA (€)</span></div>
      <div class="zahl"><b>${R ? eur(g.marge) : FEHLT}</b><span>Marge (€)</span></div>
      <div class="zahl"><b>${R && g.marge_proz != null ? String(g.marge_proz).replace('.', ',') + ' %' : FEHLT}</b><span>Marge (%)</span></div>
      <div class="zahl"><b>${R ? ganz(g.flaschen) : FEHLT}</b><span>Flaschen</span></div>
      ${hatKosten ? `<div class="zahl"><b>${eur(k.gewinn_gesamt)}</b><span>Gewinn nach Kosten (€)</span></div>` : ''}</div>
      ${R?.warnungen?.length ? `<div class="hinweis" style="margin-top:10px">${R.warnungen.map((w) => `<div>${h(w)}</div>`).join('')}</div>` : ''}</div>`;
    let ergebnis = '';
    if (!R) ergebnis = '<p class="dim">Haken setzen, dann steht hier die Rechnung. Das Szenario ist nur eine Rechnung, an den Karten ändert sich nichts.</p>';
    else if (P.modus === 'weingut') ergebnis = `<table class="tabelle"><tr><th>Weingut</th><th class="rechts">Flaschen</th><th class="rechts">Volumen (€)</th><th class="rechts">Marge (€)</th><th class="rechts">Marge %</th></tr>${R.weingueter.map((w) => `<tr><td>${h(w.weingut)}</td><td class="rechts">${ganz(w.flaschen)}</td><td class="rechts">${eur(w.umsatz)}</td><td class="rechts">${eur(w.marge)}</td><td class="rechts">${w.marge_proz != null ? String(w.marge_proz).replace('.', ',') : FEHLT}</td></tr>`).join('')}</table>`;
    else if (P.modus === 'gesamt') ergebnis = `<table class="tabelle"><tr><th></th><th class="rechts">Flaschen</th><th class="rechts">Volumen (€)</th><th class="rechts">Einkauf (€)</th><th class="rechts">Marge (€)</th><th class="rechts">Marge %</th></tr>${[['Fix (' + Math.round((1 - R.optionsanteil) * 100) + ' %)', R.fix], ['Option (' + Math.round(R.optionsanteil * 100) + ' %)', R.option], ['Zusammen', R.gesamt]].map(([n, x]) => `<tr><td>${n}</td><td class="rechts">${ganz(x.flaschen)}</td><td class="rechts">${eur(x.umsatz)}</td><td class="rechts">${eur(x.einkauf)}</td><td class="rechts">${eur(x.marge)}</td><td class="rechts">${x.marge_proz != null ? String(x.marge_proz).replace('.', ',') : FEHLT}</td></tr>`).join('')}</table><p class="dim klein">Menge je Angebot ist die Untergrenze der Ausschreibung (Annahme), bis die Winzer ihre freie Menge nennen. Fix und Option getrennt gerechnet.</p>`;
    else ergebnis = `<p>Ø Marge pro Flasche: <b>${g.marge_flasche != null ? eur(g.marge_flasche) + ' €' : FEHLT}</b></p>`;
    return `<div class="kopf"><h2>Rechner</h2><div class="reihe">${MODI.map(([k2, n]) => `<button class="chip ${P.modus === k2 ? 'an' : ''}" data-pr="modus" data-m="${k2}">${n}</button>`).join('')}</div></div>
      <div class="karte"><p class="dim klein">Je Los zählt nur ein Angebot, das zuerst angehakte. Alternativen im gleichen Los werden nie als mehrere volle Lose addiert.</p><div style="overflow-x:auto">${tab}</div></div>
      ${leiste}<div class="karte">${ergebnis}</div>
      <div class="reihe"><button class="knopf" data-pr="sz-speichern" ${P.haken.length ? '' : 'disabled'}>Szenario speichern</button><button class="knopf still" data-pr="sz-leeren" ${P.haken.length ? '' : 'disabled'}>Haken entfernen</button>
        <button class="knopf gefahr" data-pr="zuschlag" ${R && R.weingueter.length ? '' : 'disabled'}>Zuschlag erteilen</button></div>
      ${szenarienHtml()}`;
  }
  function szenarienHtml() {
    const sz = P.d.szenarien || [];
    if (!sz.length) return '';
    const sp = sz.map((s) => ({ s, r: P.szRech[s.id] }));
    const zeile = (n, f) => `<tr><th>${n}</th>${sp.map(({ r }) => `<td class="rechts">${r ? f(r) : FEHLT}</td>`).join('')}</tr>`;
    return `<div class="karte" style="margin-top:14px"><h2>Gespeicherte Szenarien</h2><div style="overflow-x:auto"><table class="tabelle vergleich">
      <tr><th></th>${sp.map(({ s }) => `<th class="rechts">${h(s.name)}</th>`).join('')}</tr>
      ${zeile('Weingüter', (r) => ganz(r.weingueter.length))}${zeile('Flaschen', (r) => ganz(r.gesamt.flaschen))}${zeile('Volumen (€)', (r) => eur(r.gesamt.umsatz))}${zeile('Marge (€)', (r) => eur(r.gesamt.marge))}${zeile('Marge %', (r) => (r.gesamt.marge_proz != null ? String(r.gesamt.marge_proz).replace('.', ',') : FEHLT))}${zeile('Warnungen', (r) => ganz(r.warnungen.length))}
      <tr><th></th>${sp.map(({ s }) => `<td class="rechts nowrap"><button class="knopf klein still" data-pr="sz-laden" data-id="${s.id}">Laden</button> <button class="knopf klein still" data-pr="sz-weg" data-id="${s.id}">Entfernen</button></td>`).join('')}</tr></table></div></div>`;
  }

  // ---------- Verlauf ----------
  function seiteVerlauf() {
    const v = P.d.versionen || [];
    return `<div class="kopf"><h2>Verlauf</h2><span class="dim klein">Jede Änderung mit Version und Grund, die letzten ${v.length}</span></div>
      <div class="karte">${v.length ? `<table class="tabelle"><tr><th>Wann</th><th>Was</th><th class="optional">Von</th><th>Grund</th></tr>${v.map((x) => `<tr><td class="nowrap klein">${new Date(x.am).toLocaleString('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td class="klein">${h(x.objekt)} ${x.objekt_id} · v${x.version}<div class="dim">${h(JSON.stringify(x.nachher || {}).slice(0, 120))}</div></td><td class="optional klein">${h(x.von || '')}</td><td class="klein">${h(x.grund)}</td></tr>`).join('')}</table>` : '<p class="dim">Noch nichts.</p>'}</div>`;
  }

  // ---------- Seiten ----------
  function seite(arg) {
    const t = String(arg || '').split('/');
    if (!t[0]) {
      const L = P.liste;
      return `<div class="inhalt"><div class="kopf"><h1>Projekte</h1><button class="knopf" data-pr="p-neu">+ Projekt</button></div>
        ${ctx.fehlerLeiste()}
        ${!L ? '<div class="laden">Projekte werden geladen</div>' : L.length ? L.map((p) => `<a class="karte plink" href="#projekt/${p.id}"><div class="kopf"><h2>${h(p.name)}</h2><span class="marke">${h(p.typ_name)}</span></div>
          <div class="reihe klein dim"><span>${p.posten} Posten</span><span>Ball bei uns: ${p.ball_wir}</span>${p.naechste_frist ? `<span>nächste Frist ${datum(p.naechste_frist)}</span>` : ''}</div>
          <div class="reihe" style="margin-top:6px">${Object.entries(p.stand || {}).map(([k, n]) => `<span class="marke">${h(k)} ${n}</span>`).join('')}</div></a>`).join('') : '<p class="dim">Noch kein Projekt.</p>'}</div>`;
    }
    if (!P.d) return `<div class="inhalt"><a href="#projekte">← Projekte</a>${ctx.fehlerLeiste()}<div class="laden">Projekt wird geladen</div></div>`;
    const bs = bereiche();
    const aktuell = t[1] === 'rechner' ? 'rechner' : t[1] === 'verlauf' ? 'verlauf' : (bs.find((b) => String(b.id) === t[1])?.id ?? bs[0]?.id);
    const tabs = [...bs.map((b) => [b.id, b.name]), ...(hat('angebote') ? [['rechner', 'Rechner']] : []), ['verlauf', 'Verlauf']];
    const b = typeof aktuell === 'number' ? bs.find((x) => x.id === aktuell) : null;
    return `<div class="inhalt"><div class="kopf"><div><a href="#projekte" class="klein">← Projekte</a><h1>${h(P.d.projekt.name)}</h1><span class="dim klein">${h(P.d.typ.name)} · Version ${P.d.projekt.version}</span></div></div>
      ${ctx.fehlerLeiste()}
      <div class="tabs">${tabs.map(([id, n]) => `<a class="chip tab ${String(id) === String(aktuell) ? 'an' : ''}" href="#projekt/${P.id}/${id}">${h(n)}</a>`).join('')}<button class="chip tab" data-pr="b-neu">+ Bereich</button></div>
      ${aktuell === 'rechner' ? seiteRechner() : aktuell === 'verlauf' ? seiteVerlauf() : b ? seiteBereich(b) : '<p class="dim">Noch kein Bereich.</p>'}</div>`;
  }

  // ---------- Aktionen ----------
  const nimm = (r) => { P.d = r; };
  async function speichern(fn) { P.meldung = null; try { await fn(); } catch (e) { fehler(e.message); } render(); }

  function kartenFelder(p, b) {
    const dk = new Set((artInfo(b).felder || []).filter((f) => f.startsWith('daten.')).map((f) => f.slice(6)));
    for (const [k, v] of Object.entries(p.daten || {})) if (typeof v !== 'object') dk.add(k);
    const NAMEN = { ansprechperson: 'Ansprechperson', email: 'E-Mail', anrede: 'Du oder Sie', kategorien: 'Kategorien', richtwert: 'Richtwert', hinweis: 'Hinweis', text: 'Text', bezug: 'Bezug', ort: 'Ort', genau: 'Datum genau', anrede_text: 'Anrede im Brief' };
    const f = [
      { n: 'name', l: 'Name', v: p.name },
      { n: 'stand', l: 'Stand', typ: 'select', v: p.stand || '', opt: [['', 'ohne Stand'], ...staende(b).map((s) => [s.k, s.n])] },
      { n: 'ball', l: 'Ball', typ: 'select', v: p.ball || '', opt: [['', 'niemand'], ...ballListe().map((x) => [x, x])] },
      { n: 'naechster_schritt', l: 'Nächster Schritt', typ: 'area', v: p.naechster_schritt || '' },
      { n: 'frist', l: 'Frist', typ: 'date', v: p.frist || '' },
      { n: 'link', l: 'Link auf die Mail', v: p.link || '' },
    ];
    for (const k of dk) f.push({ n: 'd_' + k, l: NAMEN[k] || k, typ: k === 'anrede' ? 'select' : k === 'text' || k === 'hinweis' ? 'area' : 'text', v: p.daten?.[k] ?? '', opt: k === 'anrede' ? [['', ''], ['du', 'Du'], ['sie', 'Sie']] : undefined });
    return f;
  }
  async function karteAendern(p) {
    const b = eintrag(p.parent_id), f = kartenFelder(p, b);
    f.push({ n: 'weg', l: 'Ausblenden (nichts wird gelöscht)', typ: 'check' });
    const r = await formular(p.name, 'Jede Änderung bekommt eine Version.', f, '');
    if (!r) return;
    const patch = {}, daten = {};
    for (const x of f) {
      if (x.n === 'weg') { if (r.werte.weg) patch.aktiv = false; continue; }
      const neu = r.werte[x.n], alt = String(x.v ?? '');
      if (neu === alt) continue;
      if (x.n.startsWith('d_')) daten[x.n.slice(2)] = neu; else patch[x.n] = neu;
    }
    if (Object.keys(daten).length) patch.daten = daten;
    if (!Object.keys(patch).length) return;
    await speichern(async () => nimm(await api('eintrag_aendern', { id: p.id, patch, grund: r.grund })));
  }
  function angebotFelder(a) {
    const codes = kategorien();
    return [
      { n: 'wein', l: 'Wein', v: a?.wein || '' }, { n: 'jahrgang', l: 'Jahrgang', v: a?.jahrgang || '' },
      { n: 'kategorie', l: 'Los (Kategorie)', typ: 'select', v: a?.kategorie || '', opt: [['', 'ohne'], ...codes.map((c) => [c.code, `${c.code} · ${c.name} (Richtwert ${eur(c.richtwert)})`])] },
      { n: 'menge', l: 'Menge in Flaschen', typ: 'number', v: a?.menge ?? '' }, { n: 'einkauf', l: 'Einkaufspreis ab Hof (€)', typ: 'number', v: a?.einkauf ?? '' }, { n: 'verkauf', l: 'Verkaufspreis an ANA (€)', typ: 'number', v: a?.verkauf ?? '' },
      { n: 'verschluss', l: 'Verschluss', v: a?.verschluss || '' }, { n: 'stufe', l: 'Stufe', typ: 'select', v: a?.stufe || 'angebot', opt: [['angebot', 'Angebot'], ['indikativ', 'nur Preisangabe']] },
      { n: 'notiz', l: 'Notiz', typ: 'area', v: a?.notiz || '' },
    ];
  }
  async function angebotBearbeiten(p, a) {
    const felder = angebotFelder(a);
    const r = await formular(a ? `Angebot ${a.wein}` : `Neues Angebot, ${p.name}`, 'Das Verkaufspreis-Feld ist der Richtwert von ANA für das Los, wenn kein anderer Preis gilt.', felder, a ? '' : 'Angebot eingetragen');
    if (!r) return;
    const patch = {};
    for (const x of felder) { const neu = r.werte[x.n]; if (!a || neu !== String(x.v ?? '')) patch[x.n] = neu; }
    if (!a) patch.posten_id = p.id;
    if (!Object.keys(patch).length) return;
    await speichern(async () => nimm(await api('angebot_setzen', { id: a?.id || null, patch, grund: r.grund })));
  }
  function detail(p) {
    const b = eintrag(p.parent_id), dt = p.daten || {}, an = angeboteVon(p.id);
    const rows = Object.entries(dt).filter(([, v]) => typeof v !== 'object' && v !== '').map(([k, v]) => `<dt>${h(k)}</dt><dd>${h(v)}</dd>`).join('');
    const d = fenster(`<h3>${h(p.name)}</h3><div class="reihe" style="margin-bottom:8px"><span class="marke">${h(standName(b, p.stand))}</span>${ballMarke(p.ball)}${p.frist ? `<span class="marke">${datum(p.frist)}</span>` : ''}</div>
      ${p.naechster_schritt ? `<p>${h(p.naechster_schritt)}</p>` : ''}${rows ? `<dl class="fakten klein">${rows}</dl>` : ''}${p.link ? `<p><a href="${h(p.link)}" target="_blank" rel="noopener">Mail öffnen</a></p>` : ''}
      ${p.art === 'weingut' ? `<h3 style="margin-top:12px">Angebote</h3>${an.map((a) => `<div class="pzeile2"><span>${h(a.wein)}${a.jahrgang ? ' ' + h(a.jahrgang) : ''} · ${h(a.kategorie || 'ohne Los')} · ${ganz(a.menge)} Fl. · EK ${eur(a.einkauf)} · VK ${eur(a.verkauf)}${a.notiz ? `<div class="dim klein">${h(a.notiz)}</div>` : ''}</span><button class="knopf klein still" data-w="a-aendern" data-id="${a.id}">Ändern</button></div>`).join('') || '<p class="dim klein">Noch kein Angebot.</p>'}<button class="knopf klein still" data-w="a-neu">+ Angebot</button>` : ''}
      <div class="reihe" style="margin-top:12px"><button class="knopf" data-w="aendern">Ändern</button></div>`);
    d.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-w]'); if (!el) return;
      const w = el.dataset.w; zuFenster();
      if (w === 'aendern') await karteAendern(p);
      else if (w === 'a-neu') await angebotBearbeiten(p, null);
      else if (w === 'a-aendern') await angebotBearbeiten(p, (P.d.angebote || []).find((x) => x.id === Number(el.dataset.id)));
    });
  }
  async function standAendern(p, neu) {
    const b = eintrag(p.parent_id);
    const grund = await grundFragen(`${p.name}: Stand ändern`, `${standName(b, p.stand)} → ${standName(b, neu)}`, 'Stand geändert');
    if (!grund) { render(); return; }
    await speichern(async () => nimm(await api('eintrag_aendern', { id: p.id, patch: { stand: neu }, grund })));
  }
  async function neuerPosten(b) {
    const art = PA[b.art] || null;
    const f = [{ n: 'name', l: 'Name' }, { n: 'stand', l: 'Stand', typ: 'select', v: staende(b)[0]?.k || '', opt: staende(b).map((s) => [s.k, s.n]) },
      { n: 'ball', l: 'Ball', typ: 'select', v: 'wir', opt: [['', 'niemand'], ...ballListe().map((x) => [x, x])] }, { n: 'naechster_schritt', l: 'Nächster Schritt', typ: 'area' }, { n: 'frist', l: 'Frist', typ: 'date' }];
    const r = await formular(`Neu in ${b.name}`, '', f, 'Neu angelegt');
    if (!r || !r.werte.name) return;
    const patch = { stand: r.werte.stand, ball: r.werte.ball, naechster_schritt: r.werte.naechster_schritt, frist: r.werte.frist };
    await speichern(async () => nimm(await api('eintrag_neu', { parent: b.id, name: r.werte.name, art, patch, grund: r.grund })));
  }
  async function neuerBereich() {
    const arten = Object.entries(P.d.typ.arten).filter(([, v]) => v.ebene === 2);
    const r = await formular('Neuer Bereich', 'Ein Bereich gliedert das Projekt. Die Art bestimmt Ansichten und Stände.', [{ n: 'name', l: 'Name' }, { n: 'art', l: 'Art', typ: 'select', opt: arten.map(([k, v]) => [k, v.name]) }], 'Bereich angelegt');
    if (!r || !r.werte.name) return;
    await speichern(async () => nimm(await api('eintrag_neu', { parent: P.id, name: r.werte.name, art: r.werte.art, patch: {}, grund: r.grund })));
  }
  async function neuesProjekt() {
    const r = await formular('Neues Projekt', 'Der Typ legt Bereiche, Ansichten und Stände fest. Alles lässt sich im Projekt ändern.', [{ n: 'name', l: 'Name' }, { n: 'typ', l: 'Typ', typ: 'select', opt: TYPEN }], 'Projekt angelegt');
    if (!r || !r.werte.name) return;
    try { const d = await api('projekt_neu', { typ: r.werte.typ, name: r.werte.name, daten: {}, grund: r.grund }); P.d = d; P.id = d.projekt.id; nav(`projekt/${d.projekt.id}`); } catch (e) { fehler(e.message); }
    render();
  }
  const nav = (x) => { location.hash = x; };

  async function szenarioSpeichern() {
    const r = await formular('Szenario speichern', `${P.haken.length} Angebote angehakt. Nur die Rechnung wird gespeichert, an den Karten ändert sich nichts.`, [{ n: 'name', l: 'Name des Szenarios' }, { n: 'notiz', l: 'Notiz', typ: 'area' }], 'Szenario gespeichert');
    if (!r || !r.werte.name) return;
    await speichern(async () => { nimm(await api('szenario_speichern', { id: null, wurzel: P.id, name: r.werte.name, haken: P.haken, notiz: r.werte.notiz, grund: r.grund })); P.szName = r.werte.name; await szenarienRechnen(); });
  }
  async function zuschlag() {
    const wg = P.rech?.weingueter?.map((w) => w.weingut).join(', ');
    const grund = await grundFragen('Zuschlag erteilen', `Diese Weingüter gehen auf „ausgewählt“: ${wg}. Je Weingut entsteht ein Entwurf, dazu einer an ANA. Gesendet wird nichts, das tust Du selbst.`, `Zuschlag nach Szenario ${P.szName || 'aktuelle Auswahl'}`);
    if (!grund) return;
    await speichern(async () => {
      const r = await api('zuschlag_erteilen', { wurzel: P.id, haken: P.haken, name: P.szName || 'aktuelle Auswahl', grund });
      nimm(r);
      P.meldung = `${r.entwuerfe} Entwürfe angelegt.${r.ohne_mail?.length ? ` Ohne E-Mail-Adresse, bitte nachtragen: ${r.ohne_mail.map(h).join(', ')}.` : ''}${r.ohne_auftraggeber_mail ? ' Keine Adresse bei ANA hinterlegt.' : ''}`;
      nav(`projekt/${P.id}`);
      await rechnen();
    });
  }
  async function fragenBuendeln() {
    const grund = await grundFragen('Fragen bündeln', 'Alle offenen Fragen gehen als ein Entwurf an ANA und stehen danach auf „gestellt“. Gesendet wird nichts, das tust Du selbst.', 'Fragen gebündelt');
    if (!grund) return;
    await speichern(async () => { const r = await api('fragen_buendeln', { wurzel: P.id, grund }); nimm(r); P.meldung = r.ohne_auftraggeber_mail ? 'Keine Adresse bei ANA hinterlegt, es entstand kein Entwurf.' : `${r.fragen} Fragen in einem Entwurf, Stand „gestellt“.`; });
  }

  // ---------- Ereignisse ----------
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-pr]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const a = el.dataset.pr, id = Number(el.dataset.id);
    if (a === 'karte') { const p = eintrag(id); if (p) detail(p); }
    else if (a === 'auf') {
      // Nur diese Karte auf- oder zuklappen, ohne die Seite neu zu zeichnen: der Kopf bleibt stehen, die Karte wächst nach unten.
      const k = el.closest('.wk'); if (!k) return;
      const auf = !k.classList.contains('offen');
      k.classList.toggle('offen', auf); el.setAttribute('aria-expanded', String(auf));
      const pf = k.querySelector('.wk-pfeil'); if (pf) pf.textContent = auf ? 'Zuklappen ▴' : 'Konditionen ▾';
      if (auf) P.offen.add(id); else P.offen.delete(id);
      offenMerken();
    }
    else if (a === 'alle-auf' || a === 'alle-zu') {
      for (const p of posten(id)) { if (a === 'alle-auf') P.offen.add(p.id); else P.offen.delete(p.id); }
      offenMerken(); render();
    }
    else if (a === 'w-aendern') { const p = eintrag(id); if (p) await karteAendern(p); }
    else if (a === 'w-angebot') { const p = eintrag(id); if (p) await angebotBearbeiten(p, null); }
    else if (a === 'w-a-aendern') { const p = eintrag(id), an = (P.d.angebote || []).find((x) => x.id === Number(el.dataset.aid)); if (p && an) await angebotBearbeiten(p, an); }
    else if (a === 'ansicht') { merk(`desk.ansicht.${P.id}.${id}`, el.dataset.a); render(); }
    else if (a === 'neu') { const b = eintrag(id); if (b) await neuerPosten(b); }
    else if (a === 'b-neu') await neuerBereich();
    else if (a === 'p-neu') await neuesProjekt();
    else if (a === 'modus') { P.modus = el.dataset.m; render(); }
    else if (a === 'sz-speichern') await szenarioSpeichern();
    else if (a === 'sz-leeren') { P.haken = []; P.rech = null; P.szName = null; render(); }
    else if (a === 'sz-laden') { const s = (P.d.szenarien || []).find((x) => x.id === id); if (s) { P.haken = [...s.haken]; P.szName = s.name; await rechnen(); render(); } }
    else if (a === 'sz-weg') {
      const s = (P.d.szenarien || []).find((x) => x.id === id); if (!s) return;
      const grund = await grundFragen(`„${s.name}“ entfernen`, 'Das Szenario wird ausgeblendet, nichts wird gelöscht.', 'Szenario nicht mehr gebraucht');
      if (grund) await speichern(async () => { nimm(await api('szenario_speichern', { id, wurzel: P.id, name: s.name, aktiv: false, grund })); await szenarienRechnen(); });
    }
    else if (a === 'zuschlag') await zuschlag();
    else if (a === 'fragen') await fragenBuendeln();
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('.wk-kopf')) { ev.preventDefault(); ev.target.click(); }
  });
  document.addEventListener('change', async (ev) => {
    const el = ev.target.closest('[data-pr]'); if (!el) return;
    if (el.dataset.pr === 'stand') { const p = eintrag(el.dataset.id); if (p && (p.stand || '') !== el.value) await standAendern(p, el.value); }
    else if (el.dataset.pr === 'haken') {
      const id = Number(el.dataset.id);
      P.haken = el.checked ? [...P.haken, id] : P.haken.filter((x) => x !== id);
      P.szName = null; await rechnen(); render();
    }
  });

  return { seite, laden };
}
