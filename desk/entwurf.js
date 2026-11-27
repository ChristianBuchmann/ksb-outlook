export function entwurfModul({ api, app, h }) {
  let geraet;

  function ansicht(id) {
    if (geraet?.id === id && geraet.element.isConnected) return;
    app.innerHTML = '<main class="inhalt entwurf-revision"><h1>Outlook-Entwurf</h1><div class="karte"><section aria-label="Entwurf bearbeiten"></section></div></main>';
    const element = app.querySelector('section');
    const s = { id, element, meldung: '', entwurf: null };
    geraet = s;
    if (!Number.isSafeInteger(id) || id < 1) {
      element.textContent = 'Entwurfsnummer fehlt.';
      return;
    }
    zeichnen(s, 'Outlook-Entwurf wird geladen …');
    laden(s, id).catch(e => zeichnen(s, e.message));
  }

  function outlookLink(d) {
    if (!d?.outlook_id) return '';
    const url = 'https://outlook.office.com/mail/drafts/id/' + encodeURIComponent(d.outlook_id);
    return '<a class="knopf still" href="' + h(url) + '" target="_blank" rel="noopener noreferrer">In Outlook öffnen</a>';
  }

  function adressen(f, name) {
    return [...f.querySelectorAll('input[data-liste="' + name + '"]')].map(e => e.value.trim()).filter(Boolean);
  }

  function adressFeld(name, wert = '') {
    return '<div class="reihe entwurf-adresse"><input type="email" aria-label="' + name + '" data-liste="' +
      name + '" value="' + h(wert) + '" maxlength="254" autocomplete="off" autocapitalize="none">' +
      '<button type="button" class="knopf still" data-adresse-weg aria-label="' + name + ' entfernen">Entfernen</button></div>';
  }

  function zeichnen(s, text = '') {
    if (!s.element.isConnected) return;
    const d = s.entwurf;
    const stand = {
      WARTET: 'Die Änderung wartet auf Outlook.', IN_BAU: 'Outlook erstellt die neue Fassung …',
      GEBAUT: 'Die aktuelle Outlook-Fassung wird abgeglichen.',
      GESENDET: 'Diese Nachricht wurde bereits gesendet.',
      BUCHHALTUNG: 'Dieser Entwurf gehört zum Buchhaltungspaket.',
      OUTLOOK_AKTUELLER: 'Outlook enthält eine neuere Fassung oder zusätzliche Dateien.',
      ERSATZ_IN_OUTLOOK_OFFEN: 'Die neue Fassung wird mit dem bisherigen Outlook-Entwurf abgeglichen.',
    };
    const hinweise = s.hinweise || [];
    const status = '<div class="hinweis" role="status">' + h(text || s.meldung || (d && (d.grund || d.fehler || (d.bearbeitbar ? 'Outlook-Entwurf geöffnet.' : stand[d.stand]))) ||
      (!d ? 'Outlook-Entwurf wird geladen …' : 'Der Entwurf kann hier nicht bearbeitet werden.')) + '</div>';
    const link = outlookLink(d);
    const neu = '<button type="button" class="knopf still" data-neu-laden>Aus Outlook neu laden</button>';
    if (!d?.bearbeitbar) {
      s.element.innerHTML = status + '<div class="reihe">' + neu + link + '</div>';
    } else {
      const liste = (name, titel, daten) => '<fieldset><legend>' + titel + '</legend><div data-adressen="' + name + '">' +
        (daten || []).map(wert => adressFeld(name, wert)).join('') +
        '</div><button type="button" class="knopf still" data-adresse-dazu="' + name + '">Adresse hinzufügen</button></fieldset>';
      s.element.innerHTML = status +
        (hinweise.length ? '<ul class="hinweis">' + hinweise.map(t => '<li>' + h(t) + '</li>').join('') + '</ul>' : '') +
        '<form>' + liste('an', 'An', d.an) + liste('cc', 'CC', d.cc) +
        '<div><label for="entwurf-betreff">Betreff</label><input id="entwurf-betreff" name="betreff" type="text" maxlength="260" required value="' + h(d.betreff) + '"></div>' +
        '<div><label for="entwurf-nachricht">Nachricht</label><textarea id="entwurf-nachricht" name="text" rows="14" maxlength="60000" ' + (d.text_fest ? 'readonly' : '') + '>' +
        h(d.text) + '</textarea></div>' +
        (d.text_fest ? '<p class="dim">Dieser Text enthält feste Formatierungen. Den Nachrichtentext bitte in Outlook bearbeiten.</p>' : '') +
        (d.anhaenge?.length ? '<fieldset><legend>Anlagen</legend><ul>' +
          d.anhaenge.map(a => '<li>' + h(a) + '</li>').join('') + '</ul></fieldset>' : '') +
        '<div class="reihe"><button class="knopf" type="submit">Änderung speichern</button>' + link + neu + '</div></form>';
    }
    s.element.querySelector('[data-neu-laden]').onclick = () => laden(s, s.id).catch(e => meldung(s, e.message));
    const form = s.element.querySelector('form');
    if (!form) return;
    form.addEventListener('click', ev => {
      const add = ev.target.closest('[data-adresse-dazu]');
      if (add) {
        const gruppe = form.querySelector('[data-adressen="' + add.dataset.adresseDazu + '"]');
        gruppe.insertAdjacentHTML('beforeend', adressFeld(add.dataset.adresseDazu));
        gruppe.lastElementChild.querySelector('input').focus();
      }
      ev.target.closest('[data-adresse-weg]')?.closest('.entwurf-adresse').remove();
    });
    form.addEventListener('submit', ev => { ev.preventDefault(); speichern(s, form); });
  }

  function meldung(s, text) {
    const feld = s.element.querySelector('[role=status]');
    if (feld) feld.textContent = text;
  }

  async function laden(s, id) {
    const gesehen = new Set();
    let d;
    do {
      if (gesehen.has(id) || gesehen.size >= 25) throw new Error('Die Entwurfsfassungen werden noch abgeglichen. Bitte neu laden.');
      gesehen.add(id);
      d = await api('entwurf_revision_lesen', { id });
      id = d.stand === 'GEBAUT' ? Number(d.ersatz_id) : 0;
    } while (id && s.element.isConnected);
    s.entwurf = d;
    s.meldung = '';
    zeichnen(s, d.ersatz_fehler ? 'Vorige Änderung nicht gespeichert: ' + d.ersatz_fehler : '');
  }

  async function speichern(s, form) {
    if (s.speichert) return;
    const d = s.entwurf;
    const an = adressen(form, 'an');
    if (!an.length) { meldung(s, 'Mindestens eine Adresse unter An eingeben.'); return; }
    const eintrag = {
      id: d.id, fassung: d.fassung, outlook_fassung: d.outlook_fassung,
      betreff: form.elements.betreff.value, text: form.elements.text.value, an, cc: adressen(form, 'cc'),
    };
    s.speichert = true;
    const felder = [...form.elements].filter(e => !e.disabled);
    felder.forEach(e => { e.disabled = true; });
    meldung(s, 'Änderung wird in Outlook gespeichert …');
    try {
      const r = await api('entwurf_revision_speichern', eintrag);
      s.hinweise = r.hinweise || [];
      if (r.unveraendert) {
        s.meldung = 'Der Outlook-Entwurf ist bereits auf diesem Stand.';
        zeichnen(s);
        return;
      }
      for (let i = 0; i < 20 && s.element.isConnected; i++) {
        if (i) await new Promise(resolve => setTimeout(resolve, 3000));
        let neu;
        try { neu = await api('entwurf_revision_lesen', { id: Number(r.id) }); }
        catch (e) { if (i === 19) throw e; continue; }
        if (neu.bearbeitbar && neu.stand === 'GEBAUT' && neu.outlook_fassung) {
          s.entwurf = neu;
          s.meldung = 'In Outlook gespeichert am ' + neu.gebaut_um + ' Uhr.';
          zeichnen(s);
          return;
        }
        if (neu.fehler || neu.stand === 'FEHLER' || neu.stand === 'VERWORFEN') {
          throw new Error(neu.fehler || 'Outlook konnte die neue Fassung nicht speichern.');
        }
      }
      meldung(s, 'Outlook verarbeitet die Änderung noch. Mit „Aus Outlook neu laden“ kannst Du den Stand prüfen.');
    } catch (e) {
      meldung(s, e.message);
    } finally {
      felder.forEach(e => { e.disabled = false; });
      s.speichert = false;
    }
  }

  return { ansicht };
}
