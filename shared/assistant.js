/* assistant.js : panneau « Argos », assistant de renseignement (premium) pour /carte/ et /veille/ (04/11/2026).
 *
 * Module IIFE autonome et ADDITIF : n'édite aucun autre script. Il pose un jeton « Assistant » dans la barre
 * de jetons de /carte/ (#chipbar), sinon un bouton flottant, et ouvre un panneau latéral qui interroge la
 * fonction Edge assistant-renseignement en flux (text/event-stream).
 *
 * Accès : le contrôle réel est fait par le serveur (jeton + is_premium()). Côté page, le panneau n'affiche
 * qu'un état verrouillé, sans aperçu de contenu, tant que l'accès premium n'est pas confirmé
 * (événement algorAuthReady de site-auth.js) ou si le serveur répond 403.
 * Citations : [n] cliquables ; sur /carte/ elles centrent la carte (HumintMap.getMap()) et posent un repère,
 * ailleurs elles ouvrent /carte/ sur le pays de l'extrait.
 * Langue : l'interface passe par shared/i18n.js (dictionnaire en.json) ; les réponses et extraits sont
 * marqués data-i18n-skip (texte du corpus, en français).
 * Retirer : commenter la ligne <script src="…/shared/assistant.js"> dans la page.
 */
(function () {
  'use strict';
  var URL_FN = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co/functions/v1/assistant-renseignement';
  var THEATRES = [['', 'Tous les théâtres'], ['sahel', 'Sahel'], ['rdc', 'RDC, Grands Lacs'], ['moyen-orient', 'Moyen-Orient'],
    ['asie-sud', 'Asie du Sud'], ['madagascar', 'Madagascar'], ['afrique', 'Afrique'], ['cyber', 'Cyber']];
  var PERIODES = [['', 'Toute la période'], ['30', '30 derniers jours'], ['90', '90 derniers jours'], ['365', '12 derniers mois']];
  var STATUTS = { corrobore: 'HUMINT corroboré', non_corrobore: 'HUMINT non corroboré', osint: 'OSINT', reference: 'Référence', analyse: 'Note d\'analyse' };
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  // Logo Argos (04/11/2026) : l'œil du gardien et, au dessus, l'éventail des yeux posés sur la queue du paon
  // (même mythe que la gravure de /argos/, shared/argos-oeil.js). Trait 1,5 px des icônes v5, couleur héritée.
  var ICON = '<svg class="ico ico-argos" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M3 15c2.4-3.6 5.4-5.4 9-5.4s6.6 1.8 9 5.4c-2.4 3.6-5.4 5.4-9 5.4S5.4 18.6 3 15z"/><circle cx="12" cy="15" r="2.6"/><circle cx="12" cy="15" r=".9" fill="currentColor"/>' +
    '<g fill="currentColor" stroke="none"><circle cx="12" cy="4.6" r="1.1"/><circle cx="6.1" cy="6.6" r="1.1"/><circle cx="17.9" cy="6.6" r="1.1"/><circle cx="2.6" cy="10.8" r="1.1"/><circle cx="21.4" cy="10.8" r="1.1"/></g></svg>';

  var chip = null, panneau = null, fil = null, champ = null, envoyer = null, selTheatre = null, selPeriode = null, pied = null;
  var echanges = [], enCours = null, repere = null, zoneDuPays = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function t(s) { return window.AlgorI18n && window.AlgorI18n.t ? window.AlgorI18n.t(s) : s; }
  function premium() { return !!window.__algorAuthGranted; }
  function surCarte() { return !!(window.HumintMap && window.HumintMap.getMap && window.HumintMap.getMap()); }
  function dateFr(e) {
    if (e.date) { var d = new Date(e.date + 'T00:00:00Z'); if (!isNaN(d)) return d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
    return e.periode || 'date non précisée';
  }
  function isoIlYa(jours) { var d = new Date(Date.now() - jours * 864e5); return d.toISOString().slice(0, 10); }

  /* ─────────── Styles (DA v5 : filets, Host Grotesk partout) ─────────── */
  function styles() {
    var s = document.createElement('style');
    s.textContent =
      '#assistant-ri{position:fixed;z-index:60;top:64px;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 36px);display:flex;flex-direction:column;' +
      'background:rgba(24,25,30,.95);border:1px solid var(--line-night,rgba(255,255,255,.12));border-radius:6px;color:var(--on-night,#F2F2F4);font-family:var(--sans,"Host Grotesk",Arial,sans-serif);' +
      '-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3)}' +
      '#assistant-ri[hidden]{display:none}' +
      '.ar-tete{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line-night,rgba(255,255,255,.12))}' +
      '.ar-titre{display:flex;align-items:center;gap:8px;font:400 15px/1.2 var(--sans,"Host Grotesk",Arial,sans-serif)}.ar-titre .ico{width:20px;height:20px;flex:none}.ar-sous{margin-top:5px;font:400 11px/1.4 var(--mono,"Host Grotesk",Arial,sans-serif);letter-spacing:.04em;color:var(--on-night-2,#A8A9AD)}' +
      '.ar-x{border:0;background:none;color:var(--on-night-2,#A8A9AD);font:400 20px/1 var(--sans,"Host Grotesk",Arial,sans-serif);cursor:pointer;padding:0 4px}.ar-x:hover{color:var(--on-night,#F2F2F4)}' +
      '.ar-filtres{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 16px;border-bottom:1px solid var(--line-night,rgba(255,255,255,.12))}' +
      '.ar-filtres label{display:block;font:400 10.5px/1 var(--mono,monospace);letter-spacing:.06em;text-transform:uppercase;color:var(--on-night-2,#A8A9AD);margin-bottom:5px}' +
      '.ar-filtres select{width:100%;height:30px;padding:0 8px;border:1px solid var(--line-night,rgba(255,255,255,.12));border-radius:2px;background:rgba(255,255,255,.04);color:inherit;font:400 13px var(--sans,"Host Grotesk",Arial,sans-serif)}' +
      '.ar-filtres select option{color:#1C1D21}' +
      '.ar-fil{flex:1;overflow:auto;padding:4px 16px 12px}' +
      '.ar-vide{margin:14px 0 0;font:400 13px/1.5 var(--sans,"Host Grotesk",Arial,sans-serif);color:var(--on-night-2,#A8A9AD)}' +
      '.ar-vide ul{margin:10px 0 0;padding:0;list-style:none}.ar-vide li+li{margin-top:6px}' +
      '.ar-exemple{width:100%;text-align:left;padding:7px 10px;border:1px solid var(--line-night,rgba(255,255,255,.12));border-radius:2px;background:none;color:var(--on-night,#F2F2F4);font:400 13px/1.35 var(--sans,"Host Grotesk",Arial,sans-serif);cursor:pointer}.ar-exemple:hover{background:rgba(255,255,255,.07)}' +
      '.ar-q{margin:16px 0 8px;padding-left:10px;border-left:2px solid var(--on-night,#F2F2F4);font:400 14px/1.4 var(--sans,"Host Grotesk",Arial,sans-serif)}' +
      '.ar-r{font:400 14px/1.55 var(--sans,"Host Grotesk",Arial,sans-serif)}.ar-r p{margin:0 0 8px}' +
      '.ar-cite{display:inline;padding:0 3px;margin:0 1px;border:1px solid var(--line-night,rgba(255,255,255,.2));border-radius:2px;background:none;color:var(--on-night,#F2F2F4);font:400 11.5px var(--mono,monospace);cursor:pointer;vertical-align:1px}' +
      '.ar-cite:hover,.ar-cite.sel{background:var(--on-night,#F2F2F4);color:#1C1D21}' +
      '.ar-attente{font:400 12.5px var(--mono,monospace);color:var(--on-night-2,#A8A9AD)}' +
      '.ar-avis{margin:6px 0 0;padding:9px 11px;border:1px solid var(--line-night,rgba(255,255,255,.12));border-radius:2px;font:400 13px/1.45 var(--sans,"Host Grotesk",Arial,sans-serif);color:var(--on-night-2,#A8A9AD)}' +
      '.ar-avis button{margin-top:8px;height:30px;padding:0 12px;border:1px solid var(--line-night,rgba(255,255,255,.2));border-radius:2px;background:none;color:var(--on-night,#F2F2F4);font:400 13px var(--sans,"Host Grotesk",Arial,sans-serif);cursor:pointer}' +
      '.ar-sources{margin:10px 0 4px;border-top:1px solid var(--line-night,rgba(255,255,255,.12))}' +
      '.ar-sources h4{margin:10px 0 6px;font:400 10.5px/1 var(--mono,monospace);letter-spacing:.06em;text-transform:uppercase;color:var(--on-night-2,#A8A9AD)}' +
      '.ar-src{width:100%;display:grid;grid-template-columns:26px 1fr;gap:8px;padding:6px 4px;border:0;border-radius:2px;background:none;color:inherit;text-align:left;cursor:pointer;font:inherit}' +
      '.ar-src:hover,.ar-src.sel{background:rgba(255,255,255,.07)}' +
      '.ar-src .n{font:400 11.5px/1.6 var(--mono,monospace);color:var(--on-night-2,#A8A9AD)}' +
      '.ar-src b{display:block;font:400 13px/1.35 var(--sans,"Host Grotesk",Arial,sans-serif)}.ar-src small{display:block;margin-top:2px;font:400 11px/1.4 var(--mono,monospace);color:var(--on-night-2,#A8A9AD);word-break:break-all}' +
      '.ar-src .nc{color:#E8A23A}' +
      '.ar-pied{padding:10px 16px 12px;border-top:1px solid var(--line-night,rgba(255,255,255,.12))}' +
      '.ar-saisie{display:grid;grid-template-columns:1fr auto;gap:8px}' +
      '.ar-saisie textarea{min-height:40px;max-height:120px;resize:vertical;padding:9px 10px;border:1px solid var(--line-night,rgba(255,255,255,.2));border-radius:2px;background:rgba(255,255,255,.04);color:inherit;font:400 14px/1.4 var(--sans,"Host Grotesk",Arial,sans-serif)}' +
      '.ar-saisie textarea::placeholder{color:var(--on-night-2,#A8A9AD)}' +
      '.ar-saisie button{height:40px;padding:0 14px;border:0;border-radius:2px;background:var(--on-night,#F2F2F4);color:#1C1D21;font:500 13px var(--sans,"Host Grotesk",Arial,sans-serif);cursor:pointer}.ar-saisie button:disabled{opacity:.45;cursor:default}' +
      '.ar-info{display:flex;justify-content:space-between;gap:10px;margin-top:8px;font:400 10.5px/1.4 var(--mono,monospace);color:var(--on-night-2,#A8A9AD)}' +
      '.ar-verrou{margin:auto 0;padding:24px 16px;text-align:left}.ar-verrou p{margin:0 0 12px;font:400 14px/1.5 var(--sans,"Host Grotesk",Arial,sans-serif);color:var(--on-night-2,#A8A9AD)}' +
      '.ar-verrou a,.ar-verrou button{display:inline-flex;align-items:center;height:34px;padding:0 14px;border:1px solid var(--line-night,rgba(255,255,255,.2));border-radius:2px;background:none;color:var(--on-night,#F2F2F4);font:400 13px var(--sans,"Host Grotesk",Arial,sans-serif);text-decoration:none;cursor:pointer}' +
      '#assistant-ri-bouton{position:fixed;z-index:59;right:18px;bottom:18px;display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border:1px solid rgba(255,255,255,.14);border-radius:2px;background:#1C1D21;color:#F2F2F4;font:400 13.5px var(--sans,"Host Grotesk",Arial,sans-serif);cursor:pointer}' +
      '#assistant-ri-bouton .ico,#chip-assistant .ico{width:16px;height:16px}' +
      '.ar-repere{width:18px;height:18px;border-radius:50%;border:2px solid #fff;background:#1C1D21;box-shadow:0 0 0 4px rgba(28,29,33,.35)}' +
      '@media (max-width:720px){#assistant-ri{top:auto;left:12px;right:12px;bottom:12px;width:auto;max-width:none;height:72vh}#assistant-ri-bouton{right:12px;bottom:12px}}';
    document.head.appendChild(s);
  }

  /* ─────────── Construction ─────────── */
  function construirePanneau() {
    panneau = document.createElement('aside');
    panneau.id = 'assistant-ri'; panneau.hidden = true; panneau.setAttribute('aria-label', 'Argos, assistant de renseignement');
    panneau.innerHTML =
      '<div class="ar-tete"><div><div class="ar-titre">' + ICON + 'Argos</div><div class="ar-sous">Assistant de renseignement · réponses sourcées</div></div>' +
      '<button type="button" class="ar-x" aria-label="Fermer Argos">×</button></div>' +
      '<div class="ar-corps" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>';
    panneau.addEventListener('click', surClic);
    document.body.appendChild(panneau);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panneau.hidden) fermer(); });
  }

  function rendreCorps() {
    var corps = panneau.querySelector('.ar-corps');
    if (!premium()) {
      corps.innerHTML = '<div class="ar-verrou"><p>Argos interroge le corpus HUMINT et OSINT d\'Algor Acces et cite chaque fait. Il est réservé aux abonnés premium.</p>' +
        '<a href="/offres/">Voir les offres</a></div>';
      return;
    }
    corps.innerHTML =
      '<div class="ar-filtres"><div><label for="ar-theatre">Théâtre</label><select id="ar-theatre">' +
      THEATRES.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="ar-periode">Période</label><select id="ar-periode">' +
      PERIODES.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="ar-fil" aria-live="polite"></div>' +
      '<div class="ar-pied"><form class="ar-saisie"><textarea id="ar-question" rows="2" maxlength="500" placeholder="Posez une question sur le corpus"></textarea>' +
      '<button type="submit">Envoyer</button></form>' +
      '<div class="ar-info"><span>Réponses rédigées par IA (Mistral) à partir du seul corpus. Vérifiez chaque citation.</span><span class="ar-quota"></span></div></div>';
    fil = corps.querySelector('.ar-fil');
    champ = corps.querySelector('#ar-question');
    envoyer = corps.querySelector('.ar-saisie button');
    selTheatre = corps.querySelector('#ar-theatre');
    selPeriode = corps.querySelector('#ar-periode');
    pied = corps.querySelector('.ar-quota');
    champ.placeholder = t(champ.placeholder);   // attribut créé après le passage de i18n.js
    corps.querySelector('.ar-saisie').addEventListener('submit', function (e) { e.preventDefault(); poser(champ.value); });
    champ.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); poser(champ.value); } });
    theatreParDefaut();
    rendreFil();
  }

  // Sur /carte/, le théâtre du pays affiché est présélectionné.
  function theatreParDefaut() {
    if (!selTheatre || !window.HumintMap || !window.HumintMap.getCountry) return;
    var pays = window.HumintMap.getCountry();
    if (!pays) return;
    var poser = function () { var z = zoneDuPays && zoneDuPays[pays]; if (z && selTheatre.querySelector('option[value="' + z + '"]')) selTheatre.value = z; };
    if (zoneDuPays) { poser(); return; }
    fetch('/carte/countries.json').then(function (r) { return r.json(); }).then(function (d) {
      zoneDuPays = {}; (d.countries || []).forEach(function (c) { zoneDuPays[c.name] = c.zone; }); poser();
    }).catch(function () { /* présélection facultative */ });
  }

  function construireDeclencheur() {
    var bar = document.getElementById('chipbar');
    if (bar) {
      chip = document.createElement('button');
      chip.type = 'button'; chip.id = 'chip-assistant'; chip.className = 'chip chip-edit';
      chip.innerHTML = '<span class="chip-key">Assistant</span><span class="chip-val">Argos</span><span class="chip-caret">' + ICON + '</span>';
      chip.addEventListener('click', function (e) { e.stopPropagation(); basculer(); });
      var place = function () { if (chip.parentNode !== bar) bar.appendChild(chip); };
      new MutationObserver(place).observe(bar, { childList: true });
      place();
    } else {
      chip = document.createElement('button');
      chip.type = 'button'; chip.id = 'assistant-ri-bouton';
      chip.innerHTML = ICON + '<span>Argos</span>';
      chip.addEventListener('click', basculer);
      document.body.appendChild(chip);
    }
    chip.setAttribute('aria-controls', 'assistant-ri');
    chip.setAttribute('aria-pressed', 'false');
  }

  function ouvrir() {
    rendreCorpsSiBesoin();
    panneau.hidden = false;
    chip.setAttribute('aria-pressed', 'true');
    caler();
    if (champ) champ.focus();
  }
  function fermer() { panneau.hidden = true; chip.setAttribute('aria-pressed', 'false'); }
  function basculer() { if (panneau.hidden) ouvrir(); else fermer(); }
  var corpsPremium = false;
  function rendreCorpsSiBesoin() { if (!panneau.querySelector('.ar-corps').children.length || corpsPremium !== premium()) { corpsPremium = premium(); rendreCorps(); } }

  // Sous la barre d'en-tête de /carte/ (2 ou 3 lignes selon la largeur).
  function caler() {
    degagerPastille();
    if (innerWidth <= 720) { panneau.style.top = ''; return; }
    var h = document.getElementById('header');
    panneau.style.top = h ? Math.round(h.getBoundingClientRect().bottom + 12) + 'px' : '';
  }
  // La pastille FR | EN flottante de i18n.js occupe le coin bas droit : panneau et bouton se posent au dessus.
  function degagerPastille() {
    var p = document.querySelector('.lang-toggle--float');
    var r = p && p.getClientRects().length ? p.getBoundingClientRect() : null;   // offsetParent vaut null en position fixe
    var bas = r ? Math.round(innerHeight - r.top + 8) + 'px' : '';
    if (panneau) panneau.style.bottom = bas;
    if (chip && chip.id === 'assistant-ri-bouton') chip.style.bottom = bas;
  }

  /* ─────────── Fil de discussion ─────────── */
  var EXEMPLES = ['Quels enlèvements sont rapportés au Niger ?', 'Que se passe-t-il autour de Goma et Rutshuru ?', 'Quelles attaques contre des convois de carburant figurent dans le corpus ?'];

  function rendreFil() {
    if (!fil) return;
    if (!echanges.length) {
      fil.innerHTML = '<div class="ar-vide">Argos répond à partir des seuls extraits du corpus, sur le théâtre et la période choisis, et cite chaque fait. Les renseignements non recoupés par une source ouverte sont signalés comme non corroborés.' +
        '<ul>' + EXEMPLES.map(function (q) { return '<li><button type="button" class="ar-exemple">' + esc(q) + '</button></li>'; }).join('') + '</ul></div>';
      return;
    }
    fil.innerHTML = echanges.map(rendreEchange).join('');
    fil.scrollTop = fil.scrollHeight;
  }

  function rendreEchange(x, i) {
    var h = '<div class="ar-q" data-i18n-skip>' + esc(x.question) + '</div>';
    if (x.avis) {
      h += '<div class="ar-avis">' + esc(x.avis.texte) + (x.avis.bouton ? '<br><button type="button" data-action="' + x.avis.action + '">' + esc(x.avis.bouton) + '</button>' : '') + '</div>';
      return h;
    }
    if (!x.texte) return h + '<div class="ar-attente">' + (x.extraits ? 'Rédaction à partir de ' + x.extraits.length + ' extraits…' : 'Recherche dans le corpus…') + '</div>';
    var fixe = x.fin && !x.fin.cites.length;   // réponse réservée (refus, hors champ, non documenté) : texte d'interface traduit
    h += '<div class="ar-r"' + (fixe ? '' : ' data-i18n-skip') + '>' + paragraphes(x.texte, i) + '</div>';
    if (x.fin && x.fin.cites.length && x.extraits) {
      var cites = x.extraits.filter(function (e) { return x.fin.cites.indexOf(e.ref) >= 0; });
      h += '<div class="ar-sources"><h4>Extraits cités</h4>' + cites.map(function (e) {
        // Le lieu du corpus répète souvent le pays (« Niger », « Burkina Faso - Djibo ») : on ne l'écrit qu'une fois.
        var l = String(e.lieu || '').replace(new RegExp('^' + String(e.pays || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-,:]\\s*', 'i'), '');
        var lieu = (!l || l === e.pays ? [e.pays] : [l, e.pays]).filter(Boolean).join(', ');
        return '<button type="button" class="ar-src" data-e="' + i + ':' + e.n + '"><span class="n">[' + e.n + ']</span><span>' +
          '<b data-i18n-skip>' + esc(lieu || 'Lieu non précisé') + '</b>' +
          '<small><span>' + esc(dateFr(e)) + '</span> · <span' + (e.statut === 'non_corrobore' ? ' class="nc"' : '') + '>' + esc(STATUTS[e.statut] || e.statut) + '</span>' +
          (e.type ? ' · <span data-i18n-skip>' + esc(e.type) + '</span>' : '') + '<br><span data-i18n-skip>' + esc(e.ref) + '</span></small></span></button>';
      }).join('') + '</div>';
    } else if (!x.fin) h += '<div class="ar-attente">…</div>';
    return h;
  }

  function paragraphes(texte, i) {
    return texte.trim().split(/\n+/).map(function (p) {
      return '<p>' + esc(p).replace(/\[(\d{1,3}(?:,\s*\d{1,3})*)\]/g, function (_, liste) {
        return liste.split(/,\s*/).map(function (n) { return '<button type="button" class="ar-cite" data-e="' + i + ':' + n + '" title="Voir l\'extrait ' + n + '">' + n + '</button>'; }).join('');
      }) + '</p>';
    }).join('');
  }

  /* ─────────── Envoi et flux ─────────── */
  async function jeton() {
    var c = window.algorAuth && window.algorAuth.supabase;
    if (!c) return null;
    try { var r = await c.auth.getSession(); return r && r.data && r.data.session ? r.data.session.access_token : null; } catch (e) { return null; }
  }

  async function poser(texte) {
    var question = String(texte || '').replace(/\s+/g, ' ').trim();
    if (enCours || question.length < 3) return;
    var x = { question: question, texte: '', extraits: null, fin: null, avis: null };
    echanges.push(x);
    champ.value = '';
    envoyer.disabled = true;
    rendreFil();

    var corps = { question: question };
    if (selTheatre.value) corps.theatres = [selTheatre.value];
    if (selPeriode.value) corps.date_min = isoIlYa(+selPeriode.value);
    var precedentes = echanges.slice(0, -1).filter(function (e) { return e.fin; }).slice(-2).map(function (e) { return e.question; });
    if (precedentes.length) corps.precedentes = precedentes;

    enCours = new AbortController();
    try {
      var j = await jeton();
      if (!j) { avis(x, 'session'); return; }
      var r = await fetch(URL_FN, { method: 'POST', signal: enCours.signal,
        headers: { Authorization: 'Bearer ' + j, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      if (r.status === 401) { avis(x, 'session'); return; }
      if (r.status === 403) { window.__algorAuthGranted = false; avis(x, 'premium'); return; }
      if (r.status === 429) { var q = await r.json().catch(function () { return {}; }); avis(x, q.code === 'quota' ? 'quota' : 'rafale'); if (q.code === 'quota') quota(0); return; }
      if (!r.ok || !(r.headers.get('content-type') || '').includes('event-stream')) { avis(x, 'erreur'); return; }
      await lireFlux(r, x);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      avis(x, 'erreur');
    } finally {
      enCours = null;
      envoyer.disabled = false;
      rendreFil();
    }
  }

  async function lireFlux(r, x) {
    var lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader();
    var reste = '';
    for (;;) {
      var lu = await lecteur.read();
      if (lu.done) break;
      reste += lu.value;
      var blocs = reste.split('\n\n');
      reste = blocs.pop();
      blocs.forEach(function (b) {
        var ev = (b.match(/^event: (.*)$/m) || [])[1], d = (b.match(/^data: (.*)$/m) || [])[1];
        if (!ev || d == null) return;
        try { d = JSON.parse(d); } catch (e) { return; }
        if (ev === 'extraits') x.extraits = d;
        else if (ev === 'texte') x.texte += d.t;
        else if (ev === 'fin') { x.fin = d; quota(d.quota_restant); }
        else if (ev === 'erreur') avis(x, 'erreur');
      });
      rendreFil();
    }
    if (!x.fin && !x.avis) avis(x, 'erreur');
  }

  var AVIS = {
    session: { texte: 'Votre session a expiré. Reconnectez-vous pour continuer.', bouton: 'Se reconnecter', action: 'login' },
    premium: { texte: 'Argos est réservé aux abonnés premium.', bouton: 'Voir les offres', action: 'offres' },
    quota: { texte: 'Quota du jour atteint. Argos sera de nouveau disponible demain.' },
    rafale: { texte: 'Trop de questions en peu de temps. Réessayez dans une minute.' },
    erreur: { texte: 'Le service ne répond pas pour le moment. Réessayez dans un instant.', bouton: 'Réessayer', action: 'reessayer' },
  };
  function avis(x, cle) { x.avis = AVIS[cle]; x.cleAvis = cle; }
  function quota(n) {
    if (!pied) return;
    if (n === null) pied.textContent = t('Accès équipe : sans plafond');   // admin et editor
    else if (typeof n === 'number') pied.textContent = t(n + (n > 1 ? ' questions restantes' : ' question restante') + ' aujourd\'hui');
  }

  /* ─────────── Citations ─────────── */
  function extraitDe(cle) {
    var p = String(cle).split(':'), x = echanges[+p[0]];
    return x && x.extraits ? x.extraits.filter(function (e) { return String(e.n) === p[1]; })[0] : null;
  }
  function montrer(e, cle) {
    panneau.querySelectorAll('.ar-cite.sel,.ar-src.sel').forEach(function (b) { b.classList.remove('sel'); });
    panneau.querySelectorAll('[data-e="' + cle + '"]').forEach(function (b) { b.classList.add('sel'); });
    if (e.lat == null || e.lon == null) return;
    if (surCarte()) {
      var map = window.HumintMap.getMap();
      if (repere) repere.remove();
      var el = document.createElement('div'); el.className = 'ar-repere'; el.style.zIndex = '5';
      repere = new mapboxgl.Marker({ element: el }).setLngLat([e.lon, e.lat]).addTo(map);
      // Marges : panneau Analyse à gauche (s'il est là), assistant à droite.
      var ana = document.getElementById('analysis'), g = ana && ana.offsetWidth ? Math.round(ana.getBoundingClientRect().right) + 20 : 40;
      var marge = innerWidth > 720 ? { top: 100, bottom: 80, left: g, right: 440 } : { top: 40, bottom: Math.round(innerHeight * 0.75), left: 20, right: 20 };
      map.flyTo({ center: [e.lon, e.lat], zoom: Math.max(map.getZoom(), 8), padding: marge, duration: 700 });
    } else if (e.pays) {
      window.open('/carte/?pays=' + encodeURIComponent(e.pays), '_blank', 'noopener');
    }
  }

  function surClic(ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.classList.contains('ar-x')) { fermer(); return; }
    if (b.classList.contains('ar-exemple')) { poser(b.textContent); return; }
    if (b.dataset.e) { var e = extraitDe(b.dataset.e); if (e) montrer(e, b.dataset.e); return; }
    var a = b.dataset.action;
    if (a === 'login' && window.algorAuth && window.algorAuth.openLogin) window.algorAuth.openLogin();
    else if (a === 'offres') location.href = '/offres/';
    else if (a === 'reessayer') { var x = echanges.pop(); rendreFil(); if (x) poser(x.question); }
  }

  /* ─────────── Démarrage ─────────── */
  function demarrer() {
    if (panneau) return;
    styles();
    construirePanneau();
    construireDeclencheur();
    window.addEventListener('resize', function () { if (!panneau.hidden) caler(); else degagerPastille(); });
    setTimeout(degagerPastille, 800);   // la pastille est montée par i18n.js après le chargement du dictionnaire
    // L'accès premium peut être confirmé après le montage (overlay de connexion) : on reconstruit le corps.
    window.addEventListener('algorAuthReady', function () { window.__algorAuthGranted = true; if (!panneau.hidden) rendreCorpsSiBesoin(); });
  }
  // #chipbar est dans le HTML statique de /carte/ ; ailleurs, bouton flottant.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
