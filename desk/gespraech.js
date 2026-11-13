// Desk v21 (11.11.2026): Das Gespräch im Desk. Christian diktiert oder tippt, der Desk antwortet, sucht in Mails, Kontakten,
// Vorgängen und Projekten, legt Entwürfe an (senden nur Christian) und hängt jedes Gespräch an ein Projekt.
// Serverfunktion desk-gespraech. Die Antwort entsteht im Hintergrund, die Seite fragt alle 2,5 Sekunden nach.

const SCHRITT = { sql_lesen: 'liest nach', mail_lesen: 'liest eine Mail', entwurf_anlegen: 'legt einen Entwurf an', projekt_zuordnen: 'legt im Projekt ab', thema_benennen: 'benennt das Thema', eintrag_aendern: 'ändert eine Karte', merken: 'merkt sich etwas', an_auftragstisch: 'gibt an den Auftragstisch' };
const STATUS = { WARTET: 'wird gebaut', IN_BAU: 'wird gebaut', GEBAUT: 'steht in Outlook', FEHLER: 'Fehler', VERWORFEN: 'verworfen' };

export function gespraechModul(ctx) {
  const { apiG, api, h, render, wann, fehler } = ctx;
  const G = { faeden: null, faedenFuer: undefined, d: null, fid: null, text: '', laeuft: false, sendet: false, projekte: null, timer: null, mic: null, micBasis: '', offen: new Set() };
  const schmal = () => window.matchMedia('(max-width: 699px)').matches;

  // ---------- Laden ----------
  async function ladeFaeden(pid) {
    try { G.faeden = (await apiG('faeden', pid ? { projekt_id: pid } : {})).faeden; G.faedenFuer = pid || null; } catch (e) { fehler(e.message); }
  }
  async function ladeFaden(fid, still) {
    try { G.d = await apiG('faden', { id: fid }); G.fid = Number(fid); } catch (e) { if (!still) fehler(e.message); }
    G.laeuft = !!G.d?.beitraege?.some((b) => b.status === 'laeuft');
    takt();
  }
  async function ladeProjekte() { if (G.projekte) return; try { G.projekte = (await api('projekte')).projekte; } catch { G.projekte = []; } }
  // Ziel: { fid, pid } aus der Adresse
  async function laden(z) {
    const pid = z.pid || null, fid = z.fid ? Number(z.fid) : null;
    if (G.faedenFuer !== pid) G.faeden = null;
    if (!fid) { G.d = null; G.fid = null; G.laeuft = false; }
    else if (G.fid !== fid) { G.d = null; }
    render();
    await Promise.all([ladeFaeden(pid), fid ? ladeFaden(fid) : null, ladeProjekte()]);
    render(); nachUnten();
  }
  function takt() {
    clearTimeout(G.timer);
    if (!G.laeuft || !G.fid) return;
    G.timer = setTimeout(async () => {
      const vorher = G.d?.beitraege?.length || 0, warLaeuft = G.laeuft;
      await ladeFaden(G.fid, true);
      if (warLaeuft && !G.laeuft) await ladeFaeden(G.faedenFuer);
      render();
      if ((G.d?.beitraege?.length || 0) !== vorher || !G.laeuft) nachUnten();
    }, 2500);
  }
  function nachUnten() { requestAnimationFrame(() => { const v = document.querySelector('.g-verlauf'); if (v) v.scrollTop = v.scrollHeight; if (schmal()) { const l = document.querySelector('.g-beitrag:last-child'); if (l && G.fid) l.scrollIntoView({ block: 'end' }); } }); }

  // ---------- Schreiben ----------
  async function abgeben(pid) {
    const text = G.text.trim();
    if (!text || G.sendet) return;
    micAus();
    G.sendet = true; render();
    try {
      const r = await apiG('sagen', { text, faden_id: G.fid || undefined, projekt_id: G.fid ? undefined : (pid || undefined) });
      G.text = '';
      const ziel = pid ? `projekt/${pid}/gespraech/${r.faden_id}` : `gespraech/${r.faden_id}`;
      G.sendet = false;
      if (location.hash !== '#' + ziel) { G.fid = null; location.hash = ziel; return; }
      await ladeFaden(r.faden_id); await ladeFaeden(G.faedenFuer);
    } catch (e) { fehler(e.message); }
    G.sendet = false; render(); nachUnten();
  }
  async function projektSetzen(pid) {
    if (!G.fid) return;
    try { await apiG('faden_setzen', { id: G.fid, projekt_id: pid ? Number(pid) : null }); await ladeFaden(G.fid); await ladeFaeden(G.faedenFuer); } catch (e) { fehler(e.message); }
    render();
  }
  async function umbenennen() {
    if (!G.fid || !G.d) return;
    const t = window.prompt('Titel des Gesprächs', G.d.faden.titel || '');
    if (t == null || !t.trim()) return;
    try { await apiG('faden_setzen', { id: G.fid, titel: t.trim() }); await ladeFaden(G.fid); await ladeFaeden(G.faedenFuer); } catch (e) { fehler(e.message); }
    render();
  }

  // ---------- Diktat ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function micAn() {
    if (!SR || G.mic) return;
    const r = new SR();
    r.lang = 'de-AT'; r.continuous = true; r.interimResults = true;
    G.micBasis = G.text ? G.text.replace(/\s*$/, ' ') : '';
    r.onresult = (ev) => {
      let fest = '', zwischen = '';
      for (let i = 0; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) fest += t; else zwischen += t; }
      G.text = (G.micBasis + fest + zwischen).replace(/\s+/g, ' ').trimStart();
      const ta = document.getElementById('g-text'); if (ta) { ta.value = G.text; groesse(ta); }
    };
    r.onend = () => { G.mic = null; render(); };
    r.onerror = (e) => { if (e.error === 'not-allowed') fehler('Das Mikrofon ist für diese Seite gesperrt. In den Einstellungen des Browsers erlauben, oder das Mikrofon der Tastatur nehmen.'); };
    try { r.start(); G.mic = r; } catch { G.mic = null; }
    render();
  }
  function micAus() { if (G.mic) { try { G.mic.stop(); } catch { /* aus */ } G.mic = null; } }
  function groesse(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, schmal() ? 220 : 320) + 'px'; }

  // ---------- Darstellung ----------
  function textHtml(t) {
    const zeilen = String(t || '').replace(/\r/g, '').split('\n');
    let out = '', liste = false;
    for (const z of zeilen) {
      if (/^\s*-\s+/.test(z)) { if (!liste) { out += '<ul>'; liste = true; } out += `<li>${h(z.replace(/^\s*-\s+/, ''))}</li>`; continue; }
      if (liste) { out += '</ul>'; liste = false; }
      out += z.trim() ? `<p>${h(z)}</p>` : '';
    }
    return out + (liste ? '</ul>' : '');
  }
  function aktion(a, beitragId, i) {
    if (a.art === 'entwurf') {
      const e = (G.d?.entwuerfe || []).find((x) => Number(x.id) === Number(a.ausgang_id)) || {};
      const st = e.status || 'WARTET', key = `${beitragId}-${i}`, auf = G.offen.has(key);
      const link = e.outlook_id ? `https://outlook.office.com/mail/drafts/id/${encodeURIComponent(e.outlook_id)}` : '';
      return `<div class="g-aktion ${st === 'FEHLER' ? 'fehler-rand' : ''}">
        <div class="reihe" style="justify-content:space-between;gap:6px"><b>Entwurf ${a.typ === 'NEU' ? 'an' : a.typ === 'WEITERLEITEN' ? 'weiter an' : 'Antwort an'} ${h((a.an || []).join(', ') || 'den Absender')}</b><span class="marke ${st === 'GEBAUT' ? 'an-gruen' : st === 'FEHLER' ? 'warn' : ''}">${STATUS[st] || h(st)}</span></div>
        ${a.betreff ? `<div class="klein">${h(a.betreff)}</div>` : ''}
        ${e.fehler ? `<div class="klein fehler">${h(e.fehler)}</div>` : ''}
        ${e.technik_befund && Object.keys(e.technik_befund).length ? `<div class="klein gelb-text">${h(typeof e.technik_befund === 'string' ? e.technik_befund : JSON.stringify(e.technik_befund)).slice(0, 300)}</div>` : ''}
        <div class="reihe" style="margin-top:6px;gap:6px"><button class="knopf klein still" data-g="auf" data-k="${key}">${auf ? 'Text zu' : 'Text zeigen'}</button>${link ? `<a class="knopf klein still" href="${h(link)}" target="_blank" rel="noopener">In Outlook öffnen</a>` : ''}</div>
        ${auf ? `<pre class="g-entwurf">${h(a.text || '')}</pre>` : ''}
      </div>`;
    }
    if (a.art === 'projekt') return `<div class="g-aktion klein">${a.neu ? 'Neues Projekt angelegt' : 'Abgelegt bei'} <a href="#projekt/${a.projekt_id}">${h(a.name)}</a></div>`;
    if (a.art === 'lehre') return `<div class="g-aktion klein">Gemerkt: ${h(a.text)}</div>`;
    if (a.art === 'auftrag') return `<div class="g-aktion klein">An den Auftragstisch: ${h(String(a.text).slice(0, 200))}</div>`;
    if (a.art === 'eintrag') return `<div class="g-aktion klein">Karte „${h(a.name)}“ geändert</div>`;
    return '';
  }
  function beitrag(b) {
    if (b.rolle === 'du') return `<div class="g-beitrag du"><div class="g-blase">${textHtml(b.text)}</div><div class="dim klein g-zeit">${wann(b.am, true)}</div></div>`;
    if (b.status === 'laeuft') {
      const s = (b.schritte || []).slice(-4);
      return `<div class="g-beitrag desk"><div class="g-blase"><span class="laden">Desk arbeitet</span>${s.length ? `<ul class="g-schritte">${s.map((x) => `<li>${h(SCHRITT[x.w] || x.w)}${x.w === 'entwurf_anlegen' ? ': ' + h(x.k) : ''}</li>`).join('')}</ul>` : ''}</div></div>`;
    }
    const kosten = b.kosten_usd != null ? `Kosten ${Number(b.kosten_usd).toFixed(2).replace('.', ',')} USD` : '';
    const zeit = b.dauer_ms ? `${Math.round(b.dauer_ms / 1000)} s` : '';
    return `<div class="g-beitrag desk"><div class="g-blase">${b.status === 'fehler' ? `<p class="fehler">Das ging nicht: ${h(b.fehler || 'unbekannt')}</p><p class="dim klein">Schreib einfach noch einmal, was Du brauchst.</p>` : textHtml(b.text)}
      ${(b.aktionen || []).map((a, i) => aktion(a, b.id, i)).join('')}</div>
      <div class="dim klein g-zeit">${wann(b.am, true)}${kosten ? ' · ' + kosten : ''}${zeit ? ' · ' + zeit : ''}</div></div>`;
  }
  function eingabe(pid) {
    const gesperrt = G.laeuft || G.sendet;
    return `<div class="g-eingabe karte">
      <textarea id="g-text" rows="3" placeholder="${G.fid ? 'Weiter im Gespräch: diktieren oder tippen' : 'Was ist zu tun? Diktieren oder tippen, zum Beispiel: Schreib Daniel Rubin wegen Verace, Vertrag und Gage.'}" ${gesperrt ? 'disabled' : ''}>${h(G.text)}</textarea>
      <div class="reihe g-knoepfe">
        ${SR ? `<button class="knopf ${G.mic ? 'rot-knopf' : 'still'}" data-g="mic" ${gesperrt ? 'disabled' : ''}>${G.mic ? '● Aufnahme beenden' : '🎙 Diktieren'}</button>` : '<span class="dim klein">Diktieren mit dem Mikrofon der Tastatur.</span>'}
        <button class="knopf" data-g="abgeben" data-pid="${pid || ''}" ${gesperrt ? 'disabled' : ''}>${G.sendet ? 'Wird abgegeben' : G.laeuft ? 'Desk arbeitet' : 'Abgeben'}</button>
      </div>
      <div class="dim klein">Entwürfe landen in Deinem Outlook, senden tust nur Du.${schmal() ? '' : ' Abgeben auch mit Strg und Enter.'}</div>
    </div>`;
  }
  function liste(pid) {
    const F = G.faeden;
    const basis = pid ? `projekt/${pid}/gespraech` : 'gespraech';
    return `<div class="g-liste">
      <a class="knopf ${!G.fid ? '' : 'still'} g-neu" href="#${basis}">+ Neues Gespräch</a>
      ${!F ? '<div class="laden">Gespräche werden geladen</div>' : F.length ? F.map((f) => `<a class="g-faden ${Number(f.id) === G.fid ? 'an' : ''}" href="#${basis}/${f.id}">
        <div class="g-ftitel">${f.laeuft ? '<span class="punkt-blau"></span>' : ''}${h(f.titel)}</div>
        <div class="dim klein">${pid ? '' : f.projekt ? h(f.projekt) + ' · ' : 'ohne Projekt · '}${wann(f.geaendert_am, true)}${Number(f.entwuerfe) ? ` · ${f.entwuerfe} ${Number(f.entwuerfe) === 1 ? 'Entwurf' : 'Entwürfe'}` : ''}</div></a>`).join('') : '<p class="dim klein">Noch kein Gespräch.</p>'}
    </div>`;
  }
  function verlaufHtml(pid) {
    if (!G.fid) return `<div class="g-haupt"><div class="kopf"><h2>Neues Gespräch</h2></div>${eingabe(pid)}<p class="dim klein">Sag einfach, was zu tun ist. Der Desk sucht die Korrespondenz, legt Entwürfe an, hängt alles an das richtige Projekt und sagt Dir, was offen ist.</p></div>`;
    if (!G.d) return '<div class="g-haupt"><div class="laden">Gespräch wird geladen</div></div>';
    const f = G.d.faden, P = G.projekte || [];
    return `<div class="g-haupt">
      <div class="g-kopf">
        ${schmal() ? `<a class="klein" href="#${pid ? `projekt/${pid}/gespraech` : 'gespraech'}">← Gespräche</a>` : ''}
        <div class="reihe" style="justify-content:space-between;gap:8px;align-items:flex-start"><h2 style="margin:0">${h(f.titel)}</h2><button class="knopf klein still" data-g="titel">Umbenennen</button></div>
        <label class="reihe klein" style="gap:6px;margin-top:4px">Projekt
          <select data-g="projekt" aria-label="Projekt"><option value="">ohne Projekt</option>${P.map((p) => `<option value="${p.id}" ${Number(p.id) === Number(f.projekt_id) ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select>
          ${f.projekt_id ? `<a href="#projekt/${f.projekt_id}">öffnen</a>` : ''}</label>
      </div>
      <div class="g-verlauf">${G.d.beitraege.map(beitrag).join('')}</div>
      ${eingabe(pid)}
    </div>`;
  }

  // Seite Gespräch (#gespraech, #gespraech/<faden>)
  function seite(arg) {
    const fid = Number(String(arg || '').split('/')[0]) || null;
    if (G.fid !== fid && fid) { /* laden kommt gleich */ }
    const nurVerlauf = schmal() && fid;
    return `<div class="inhalt g-seite"><div class="kopf"><h1>Gespräch</h1></div>${ctx.fehlerLeiste()}
      <div class="g-raster ${nurVerlauf ? 'nur' : ''}">${nurVerlauf ? '' : liste(null)}${verlaufHtml(null)}</div></div>`;
  }
  // Teil im Projekt (#projekt/<id>/gespraech[/<faden>])
  function projektTeil(pid, fid) {
    const nurVerlauf = schmal() && fid;
    return `<div class="g-raster im-projekt ${nurVerlauf ? 'nur' : ''}">${nurVerlauf ? '' : liste(pid)}${verlaufHtml(pid)}</div>`;
  }

  // Beim Neuzeichnen bleibt das Eingabefeld, wie es war: Text, Cursor, Fokus
  function vorRender() {
    const ta = document.getElementById('g-text');
    const v = document.querySelector('.g-verlauf');
    return { fokus: ta && document.activeElement === ta, a: ta?.selectionStart, b: ta?.selectionEnd, scroll: v ? v.scrollTop : null, unten: v ? v.scrollHeight - v.scrollTop - v.clientHeight < 40 : true };
  }
  function nachRender(k) {
    const ta = document.getElementById('g-text');
    if (ta) { groesse(ta); if (k?.fokus) { ta.focus(); try { ta.setSelectionRange(k.a, k.b); } catch { /* egal */ } } }
    const v = document.querySelector('.g-verlauf');
    if (v && k && k.scroll != null) v.scrollTop = k.unten ? v.scrollHeight : k.scroll;
  }

  // ---------- Ereignisse ----------
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-g]'); if (!el || el.tagName === 'SELECT') return;
    const a = el.dataset.g;
    if (a === 'abgeben') await abgeben(Number(el.dataset.pid) || null);
    else if (a === 'mic') { if (G.mic) micAus(); else micAn(); render(); }
    else if (a === 'auf') { const k = el.dataset.k; if (G.offen.has(k)) G.offen.delete(k); else G.offen.add(k); render(); }
    else if (a === 'titel') await umbenennen();
  });
  document.addEventListener('input', (ev) => { if (ev.target.id === 'g-text') { G.text = ev.target.value; groesse(ev.target); } });
  document.addEventListener('change', async (ev) => { if (ev.target.matches?.('select[data-g="projekt"]')) await projektSetzen(ev.target.value); });
  document.addEventListener('keydown', async (ev) => {
    if (ev.target.id === 'g-text' && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); const pid = Number(document.querySelector('[data-g="abgeben"]')?.dataset.pid) || null; await abgeben(pid); }
  });

  return { seite, projektTeil, laden, vorRender, nachRender, aus: () => { clearTimeout(G.timer); micAus(); } };
}
