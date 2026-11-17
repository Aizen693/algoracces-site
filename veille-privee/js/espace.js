// Veille privée : l'espace d'analyse d'une base.
// Une seule règle d'usage : tout ce qui est affiché se clique pour filtrer, et tout se met à jour
// ensemble (carte, frise, répartitions, croisement, tableau, rapport).
//   analyse.js fait les calculs, carte.js dessine la carte, ce fichier assemble l'écran.
//
// SÉCURITÉ : les valeurs viennent du fichier du client. Elles passent toutes par esc()
// avant d'entrer dans la page, et sont placées sous data-i18n-skip (jamais traduites).

import * as A from './analyse.js?v=20261117k';
import { creerCarte } from './carte.js?v=20261117k';
import * as base from './stockage.js?v=20261117k';
import { lireNombre, empreinteDe } from './detection.js?v=20261117k';
import { trouverPays } from './pays.js?v=20261117k';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (n) => Number(n).toLocaleString('fr-FR');
const dateFr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const NON_RENSEIGNE = 'Non renseigné';
const lib = (v) => (v === '' || v == null ? NON_RENSEIGNE : v);

const etat = {
  nom: '', toutes: [], champs: [], champ: 'categorie', croix: 'pays',
  filtre: { recherche: '', de: null, a: null, valeurs: {} },
  vues: [], pal: null, tri: { cle: 'date_evt', sens: -1 }, lignesVisibles: 50,
  carte: null, max: null,
  acces: null,   // { c, baseId } pour un abonné ; null en démonstration (rien ne s'enregistre)
  vues: [], vuesEnregistrees: []
};
const nomChamp = (cle) => (cle === 'mois' ? 'Mois' : (etat.champs.find((c) => c.cle === cle) || { nom: cle.replace(/^libre:/, '') }).nom);

// ---------------------------------------------------------------- Ouverture
// base = { nom, entrees, champ } ; champ (facultatif) = champ de lecture proposé au départ.
export async function ouvrirEspace(ouverture) {
  etat.nom = ouverture.nom;
  etat.toutes = ouverture.entrees;
  etat.acces = ouverture.acces || null;
  etat.champs = A.champsLisibles(etat.toutes);
  etat.champ = (ouverture.champ && etat.champs.find((c) => c.cle === ouverture.champ) ? ouverture.champ : null)
    || (etat.champs.find((c) => c.cle === 'categorie') || etat.champs.find((c) => c.libre) || etat.champs[0] || { cle: 'categorie' }).cle;
  etat.croix = etat.champ === 'pays' ? 'mois' : 'pays';
  etat.filtre = { recherche: '', de: null, a: null, valeurs: {} };
  etat.tri = { cle: 'date_evt', sens: -1 };
  etat.max = A.bornes(etat.toutes).max;
  arreterLecture();
  $('es-recherche').value = '';
  $('es-fiche').hidden = true;
  $('es-vues-bloc').hidden = !etat.acces;
  $('es-ajouter').hidden = !etat.acces;
  $('es-vue-form').hidden = true;
  chargerVues();

  $('es-champ').innerHTML = etat.champs.map((c) => `<option value="${esc(c.cle)}"${c.cle === etat.champ ? ' selected' : ''} data-i18n-skip>${esc(c.nom)}</option>`).join('');
  $('es-champ').closest('label').hidden = etat.champs.length < 2;

  if (!etat.carte) {
    etat.carte = creerCarte('es-map', { surEntrees: (rangs) => montrerFiche(rangs.map((i) => etat.vues[i]).filter(Boolean)), surMouvement: rendreEchelle, surPays: ouvrirPays, surPrete: () => { $('es-attente').hidden = true; } });
  }
  ouvrirOnglet('carte');
  rendre({ cadrer: true, anime: false });
}

// ------------------------------------------------------------------- Rendu
function rendre({ cadrer = false, anime = true } = {}) {
  etat.vues = A.filtrer(etat.toutes, etat.filtre);
  etat.pal = A.palette(etat.toutes, etat.champ);      // couleurs fixées sur la base entière : elles ne bougent pas quand on filtre
  etat.lignesVisibles = 50;
  rendreLecture(); rendreActifs(); rendrePeriodes(); rendreFaits();
  rendreCarte(cadrer, anime);
  rendreRepartitions(); rendreFrise(); rendreMatrice(); rendreTable();
}

function rendreLecture() {
  const v = etat.vues, b = A.bornes(v);
  const lieux = new Set(v.map((e) => e.lieu).filter(Boolean)).size, pays = new Set(v.map((e) => e.pays).filter(Boolean)).size;
  const morceaux = [`<b>${esc(nb(v.length))}</b> ${v.length > 1 ? 'entrées' : 'entrée'}${v.length !== etat.toutes.length ? ` sur ${esc(nb(etat.toutes.length))}` : ''}`];
  if (lieux) morceaux.push(`<b>${esc(nb(lieux))}</b> ${lieux > 1 ? 'lieux' : 'lieu'}`);
  if (pays) morceaux.push(`<b>${esc(nb(pays))}</b> pays`);
  if (b.min) morceaux.push(b.min === b.max ? `le ${esc(dateFr(b.min))}` : `du ${esc(dateFr(b.min))} au ${esc(dateFr(b.max))}`);
  $('es-lecture').innerHTML = morceaux.join('<i>·</i>');
}

// Les filtres en place, chacun retirable d'un clic.
function rendreActifs() {
  const f = etat.filtre, puces = [];
  if (f.de || f.a) puces.push(`<button type="button" class="es-puce" data-retire="periode">${esc(dateFr(f.de))} au ${esc(dateFr(f.a))}<span aria-hidden="true">×</span></button>`);
  for (const [cle, set] of Object.entries(f.valeurs)) for (const v of set) {
    puces.push(`<button type="button" class="es-puce" data-retire="${esc(cle)}" data-v="${esc(v)}"><small data-i18n-skip>${esc(nomChamp(cle))}</small><span data-i18n-skip>${esc(lib(v))}</span><span aria-hidden="true">×</span></button>`);
  }
  if (puces.length || f.recherche) puces.push('<button type="button" class="es-efface" data-retire="tout">Tout effacer</button>');
  $('es-actifs').innerHTML = puces.join('');
}

// Raccourcis de période, comptés à partir de la dernière date de la base (pas d'aujourd'hui :
// une base arrêtée il y a six mois doit rester lisible).
const RACCOURCIS = [['tout', 'Toute la période', 0], ['30', '30 derniers jours', 30], ['90', '90 derniers jours', 90], ['365', '12 derniers mois', 365]];
function rendrePeriodes() {
  const f = etat.filtre;
  $('es-periodes').hidden = !etat.max;
  $('es-periodes').innerHTML = RACCOURCIS.map(([k, nom, jours]) => {
    const actif = jours ? (f.a === etat.max && f.de === A.ajouterJours(etat.max, -(jours - 1))) : (!f.de && !f.a);
    return `<button type="button" data-jours="${jours}" aria-pressed="${actif}">${nom}</button>`;
  }).join('');
}

// Chaque écran s'ouvre sur une phrase qui répond à sa question. Ce sont des comptages mis en mots :
// rien n'est interprété. Les mots venus du fichier du client sont échappés et jamais traduits.
const mot = (v) => `<em data-i18n-skip>${esc(lib(v))}</em>`;
const motColore = (v) => `<em data-i18n-skip><i style="background:${etat.pal.couleur(v)}"></i>${esc(lib(v))}</em>`;
// Les phrases existent en français et en anglais. Elles sont écrites ici en entier dans les deux langues
// (et non traduites mot à mot par le dictionnaire du site) : l'ordre des mots n'est pas le même.
const EN = () => !!(window.AlgorI18n && window.AlgorI18n.lang === 'en');
const L = (fr, en) => (EN() ? en : fr);
const nbL = (n) => (EN() ? Number(n).toLocaleString('en-GB') : nb(n));
const pct = (x) => (EN() ? `${x}%` : `${x} %`);
const VIDE_FILTRES = () => `<p>${L('Aucune entrée ne correspond à ces filtres.', 'No entry matches these filters.')}</p>`;

function rendreFaits() {
  const v = etat.vues, n = v.length;
  $('es-onglet-qui').textContent = nomChamp(etat.champ);
  if (!n) { for (const id of ['ph-carte', 'ph-quand', 'ph-qui', 'ph-croix']) $(id).innerHTML = VIDE_FILTRES(); return; }
  const troisPremiers = (tri) => tri.slice(0, 3).map((x) => `${mot(x.v)} (${esc(nbL(x.n))})`).join(', ');
  const B = (x) => `<b>${esc(x)}</b>`;

  // Où ?
  const pays = A.compter(v, 'pays').filter((x) => x.v), lieux = A.compter(v, 'lieu').filter((x) => x.v);
  const entrees = L(n > 1 ? 'entrées' : 'entrée', n > 1 ? 'entries' : 'entry');
  const enTete = L('En tête :', 'Leading:');
  let ou;
  if (pays.length > 1) ou = `<p>${B(nbL(n))} ${entrees} ${L('dans', 'in')} ${B(nbL(pays.length))} ${L('pays', 'countries')}.</p><small>${enTete} ${troisPremiers(pays)}.</small>`;
  else if (lieux.length > 1) ou = `<p>${B(nbL(n))} ${entrees} ${L('dans', 'in')} ${B(nbL(lieux.length))} ${L('lieux', 'places')}${pays.length ? `, ${mot(pays[0].v)}` : ''}.</p><small>${enTete} ${troisPremiers(lieux)}.</small>`;
  else ou = `<p>${B(nbL(n))} ${entrees}${lieux.length ? `, ${mot(lieux[0].v)}` : ''}.</p>`;
  $('ph-carte').innerHTML = ou;

  // Quand ?
  const b = A.bornes(v);
  if (!b.min) $('ph-quand').innerHTML = `<p>${L('Aucune date dans la sélection.', 'No date in the selection.')}</p>`;
  else {
    const parMois = new Map();
    for (const e of v) if (e.date_evt) parMois.set(e.date_evt.slice(0, 7), (parMois.get(e.date_evt.slice(0, 7)) || 0) + 1);
    const [mois, pic] = [...parMois].sort((x, y) => y[1] - x[1])[0];
    const moisLu = `${mois.slice(5, 7)}/${mois.slice(0, 4)}`;
    const evo = A.evolution(etat.toutes, etat.filtre);
    const moities = A.mouvements(v, etat.champ).reduce((t, x) => ({ avant: t.avant + x.avant, apres: t.apres + x.apres }), { avant: 0, apres: 0 });
    let suite = '';
    if (evo) suite = L(`${B((evo.pourcent > 0 ? '+' : '') + pct(evo.pourcent))} par rapport aux ${evo.jours} jours précédents.`,
      `${B((evo.pourcent > 0 ? '+' : '') + pct(evo.pourcent))} compared with the previous ${evo.jours} days.`);
    else if (moities.avant + moities.apres) suite = L(`${B(nbL(moities.apres))} entrées dans la seconde moitié de la période, ${B(nbL(moities.avant))} dans la première.`,
      `${B(nbL(moities.apres))} entries in the second half of the period, ${B(nbL(moities.avant))} in the first.`);
    const periode = L(`Du ${esc(dateFr(b.min))} au ${esc(dateFr(b.max))}.`, `From ${esc(dateFr(b.min))} to ${esc(dateFr(b.max))}.`);
    $('ph-quand').innerHTML = parMois.size > 1
      ? `<p>${L(`Le mois le plus chargé est ${B(moisLu)}, avec ${B(nbL(pic))} entrées.`, `The busiest month is ${B(moisLu)}, with ${B(nbL(pic))} entries.`)}</p><small>${periode} ${suite}</small>`
      : `<p>${periode}</p><small>${suite}</small>`;
  }

  // Qui ou quoi ?
  const tri = A.compter(v, etat.champ).filter((x) => x.v !== '');
  if (!tri.length) $('ph-qui').innerHTML = `<p>${L('Cette colonne est vide dans la sélection.', 'This column is empty in the selection.')}</p>`;
  else {
    const mouv = A.mouvements(v, etat.champ).filter((x) => x.v !== '');
    const hausse = mouv[0], baisse = mouv[mouv.length - 1];
    let suite = '';
    if (hausse && hausse.ecart > 0) suite += L(`${motColore(hausse.v)} progresse le plus : ${B(nbL(hausse.avant))} puis ${B(nbL(hausse.apres))}. `,
      `${motColore(hausse.v)} rises the most: ${B(nbL(hausse.avant))} then ${B(nbL(hausse.apres))}. `);
    if (baisse && baisse.ecart < 0) suite += L(`${motColore(baisse.v)} recule le plus : ${B(nbL(baisse.avant))} puis ${B(nbL(baisse.apres))}.`,
      `${motColore(baisse.v)} falls the most: ${B(nbL(baisse.avant))} then ${B(nbL(baisse.apres))}.`);
    const part = B(pct(Math.round((tri[0].n / n) * 100)));
    $('ph-qui').innerHTML = `<p>${L(`${motColore(tri[0].v)} arrive en tête, avec ${part} des entrées.`, `${motColore(tri[0].v)} leads, with ${part} of entries.`)}</p>${suite ? `<small>${suite}</small>` : ''}`;
  }
}

function rendreCarte(cadrer, anime) {
  const places = etat.carte.afficher(etat.vues, etat.pal, (e) => A.valeur(e, etat.champ) ?? '', comptesParPays());
  const hors = etat.vues.length - places;
  $('es-hors').hidden = !hors;
  $('es-hors').textContent = hors ? `${nb(hors)} ${hors > 1 ? 'entrées sans position ne sont pas sur la carte' : 'entrée sans position n’est pas sur la carte'}` : '';
  rendreLegende();
  if (cadrer) etat.carte.pret.then(() => etat.carte.cadrer(etat.vues, anime));
  rendreEchelle();
}

// Le pays de chaque entrée, ramené à son code ISO (« RDC » et « République démocratique du Congo » comptent ensemble).
const codesPays = new Map();
function codeDe(nom) {
  if (!nom) return null;
  if (!codesPays.has(nom)) { const p = trouverPays(nom); codesPays.set(nom, p ? p.code : null); }
  return codesPays.get(nom);
}
function comptesParPays() {
  const n = {};
  for (const e of etat.vues) { const c = codeDe(e.pays); if (c) n[c] = (n[c] || 0) + 1; }
  return n;
}

// La légende dit ce que montre la carte dans la lecture en cours.
function rendreLegende() {
  const mode = etat.carte.mode();
  if (mode === 'pays') {
    $('es-legende').innerHTML = '<p>Entrées par pays</p><span class="es-legende__echelle"><small>moins</small><i></i><i></i><i></i><i></i><small>plus</small></span><span>Cliquez un pays pour y entrer.</span>';
  } else if (mode === 'chaleur') {
    $('es-legende').innerHTML = '<p>Densité des entrées</p><span class="es-legende__echelle"><small>faible</small><i></i><i></i><i></i><i></i><small>forte</small></span><span>Zoomez pour retrouver les points.</span>';
  } else {
    // En lecture par points, la légende sert aussi de filtre : un clic sur une valeur ne garde qu'elle.
    const comptes = new Map(A.compter(A.filtrer(etat.toutes, etat.filtre, etat.champ), etat.champ).map((x) => [x.v, x.n]));
    const choisies = etat.filtre.valeurs[etat.champ] || new Set();
    $('es-legende').innerHTML = `<p><span data-i18n-skip>${esc(nomChamp(etat.champ))}</span><small>Cliquez pour filtrer</small></p>`
      + etat.pal.legende.map((x) => `<button type="button" data-cle="${esc(etat.champ)}" data-v="${esc(x.v)}" aria-pressed="${choisies.has(x.v)}" class="${choisies.size && !choisies.has(x.v) ? 'is-eteinte' : ''}"><i style="background:${x.couleur}"></i><span data-i18n-skip>${esc(x.v)}</span><b>${esc(nb(comptes.get(x.v) || 0))}</b></button>`).join('')
      + (etat.pal.autres ? `<span class="es-legende__autres"><i style="background:${A.COULEUR_AUTRES}"></i><span>Autres</span></span>` : '');
  }
}

function changerMode(mode) {
  etat.carte.changerMode(mode);
  for (const b of $('es-modes').children) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  rendreLegende();
  // La lecture par pays n'a de sens que vue de loin : on recadre sur toute la sélection.
  if (mode === 'pays') etat.carte.cadrer(etat.vues);
}

// Clic sur un pays teinté : on ne garde que ce pays et on repasse aux disques pour voir ce qu'il contient.
function ouvrirPays(code) {
  const noms = A.compter(etat.toutes, 'pays').map((x) => x.v).filter((v) => v && codeDe(v) === code);
  if (!noms.length) return;
  etat.filtre.valeurs.pays = new Set(noms);
  changerMode('disques');
  rendre({ cadrer: true });
}

// À quelle échelle regarde-t-on ? Le libellé suit le zoom de la carte.
function rendreEchelle() {
  const z = etat.carte.zoom();
  const niveau = z < 3.2 ? 'mondiale' : z < 5.2 ? 'continentale' : z < 7.6 ? 'nationale' : z < 10.5 ? 'régionale' : z < 13.5 ? 'urbaine' : 'locale';
  $('es-niveau').textContent = niveau;
}

// Petite courbe d'une valeur dans le temps, dessinée à sa propre échelle : on lit sa forme (monte, baisse, pic).
function courbe(serie) {
  if (!serie) return '<span class="es-spark"></span>';
  const sommet = Math.max(...serie, 1), pas = 60 / (serie.length - 1);
  const points = serie.map((n, i) => `${(i * pas).toFixed(1)},${(15 - (n / sommet) * 13).toFixed(1)}`).join(' ');
  return `<svg class="es-spark" viewBox="0 0 60 16" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// Barres horizontales cliquables. Les valeurs déjà choisies restent visibles pour pouvoir en ajouter.
function barres(hote, cle, max = 10) {
  const tri = A.compter(A.filtrer(etat.toutes, etat.filtre, cle), cle);
  const choisies = etat.filtre.valeurs[cle] || new Set();
  const plafond = tri.length ? tri[0].n : 1;
  const colore = cle === etat.champ;
  const courbes = A.tendances(A.filtrer(etat.toutes, etat.filtre, cle), cle);
  $(hote).innerHTML = tri.slice(0, max).map((x) => `
    <button type="button" class="es-barre-l${choisies.has(x.v) ? ' is-choisie' : ''}" data-cle="${esc(cle)}" data-v="${esc(x.v)}" aria-pressed="${choisies.has(x.v)}">
      <span class="es-barre-l__nom" data-i18n-skip>${colore && x.v !== '' ? `<i style="background:${etat.pal.couleur(x.v)}"></i>` : ''}${esc(lib(x.v))}</span>
      ${courbe(courbes.get(x.v))}<span class="es-barre-l__n">${esc(nb(x.n))}</span>
      <span class="es-barre-l__trait"><i style="width:${Math.max(1.5, (x.n / plafond) * 100)}%"></i></span>
    </button>`).join('')
    + (tri.length > max ? `<p class="es-reste">et ${esc(nb(tri.length - max))} autres valeurs</p>` : '')
    + (tri.length ? '' : '<p class="es-reste">Aucune valeur.</p>');
}

function rendreRepartitions() {
  $('es-rep-titre').textContent = nomChamp(etat.champ);
  barres('es-rep', etat.champ, 10);
  const second = etat.champ === 'pays' ? 'lieu' : 'pays';
  $('es-geo-titre').textContent = second === 'pays' ? 'Pays' : 'Lieux';
  $('es-geo').dataset.cle = second;
  barres('es-geo', second, 10);
  barres('es-lieux', 'lieu', 10);
  rendreBord();
}

// Frise : une colonne par jour, semaine ou mois, empilée par couleur. On glisse dessus pour choisir une période.
let friseCourante = null;
function rendreFrise() {
  const f = etat.filtre;
  const sansPeriode = A.filtrer(etat.toutes, { ...f, de: null, a: null });
  const fr = A.frise(sansPeriode, etat.champ);
  friseCourante = fr;
  const hote = $('es-frise');
  $('es-frise-bloc').hidden = fr.tranches.length < 2;
  if (fr.tranches.length < 2) { hote.innerHTML = ''; return; }
  const n = fr.tranches.length, L = 1000, H = 120, pasX = L / n, larg = Math.max(0.6, pasX * (n > 80 ? 0.9 : 0.78));
  const sommet = Math.max(...fr.tranches.map((t) => t.n), 1);
  let rects = '';
  fr.tranches.forEach((t, i) => {
    const dans = (!f.de || t.a >= f.de) && (!f.a || t.de <= f.a);
    let y = H;
    const ordre = [...t.parts].sort((a, b) => (etat.pal.rang.get(a[0]) ?? 99) - (etat.pal.rang.get(b[0]) ?? 99));
    for (const [v, k] of ordre) {
      const h = (k / sommet) * H;
      y -= h;
      rects += `<rect x="${(i * pasX + (pasX - larg) / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${larg.toFixed(2)}" height="${h.toFixed(2)}" fill="${etat.pal.couleur(v)}" opacity="${dans ? 1 : 0.22}"/>`;
    }
  });
  const reperes = [0, 0.25, 0.5, 0.75, 1].map((p) => fr.tranches[Math.min(n - 1, Math.round(p * (n - 1)))].libelle);
  const pasNom = { jour: 'par jour', semaine: 'par semaine', mois: 'par mois' }[fr.pas];
  $('es-frise-pas').textContent = `Entrées ${pasNom}. Maximum : ${nb(sommet)}.`;
  hote.innerHTML = `<div class="es-frise__zone" id="es-frise-zone"><svg viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" aria-hidden="true">${rects}</svg><div class="es-frise__pic" style="left:${((fr.tranches.findIndex((t) => t.n === sommet) + 0.5) / n) * 100}%">sommet : ${esc(nb(sommet))}</div><div class="es-frise__choix" id="es-frise-choix" hidden></div><div class="es-frise__bulle" id="es-frise-bulle" hidden></div></div>
    <div class="es-frise__axe">${[...new Set(reperes)].map((r) => `<span>${esc(r)}</span>`).join('')}</div>`;
  brancherFrise();
}

function brancherFrise() {
  const zone = $('es-frise-zone'), choix = $('es-frise-choix'), bulle = $('es-frise-bulle');
  const n = friseCourante.tranches.length;
  const rang = (e) => { const r = zone.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))); };
  let depart = null;
  const tracer = (a, b) => { const g = Math.min(a, b), d = Math.max(a, b); choix.hidden = false; choix.style.left = (g / n) * 100 + '%'; choix.style.width = ((d - g + 1) / n) * 100 + '%'; };
  zone.addEventListener('pointerdown', (e) => { depart = rang(e); zone.setPointerCapture(e.pointerId); tracer(depart, depart); });
  zone.addEventListener('pointermove', (e) => {
    const i = rang(e), t = friseCourante.tranches[i];
    bulle.hidden = false; bulle.style.left = ((i + 0.5) / n) * 100 + '%';
    bulle.textContent = `${t.libelle} : ${nb(t.n)}`;
    if (depart !== null) tracer(depart, i);
  });
  zone.addEventListener('pointerleave', () => { bulle.hidden = true; });
  zone.addEventListener('pointerup', (e) => {
    if (depart === null) return;
    const i = rang(e), g = Math.min(depart, i), d = Math.max(depart, i);
    depart = null;
    etat.filtre.de = friseCourante.tranches[g].de; etat.filtre.a = friseCourante.tranches[d].a;
    rendre();
  });
}

// Croisement : le champ de lecture en lignes, un autre champ (ou les mois) en colonnes.
function rendreMatrice() {
  const autres = [{ cle: 'mois', nom: 'Mois' }, ...etat.champs.filter((c) => c.cle !== etat.champ)];
  if (!autres.find((c) => c.cle === etat.croix)) etat.croix = autres[0].cle;
  $('es-croix').innerHTML = autres.map((c) => `<option value="${esc(c.cle)}"${c.cle === etat.croix ? ' selected' : ''} data-i18n-skip>${esc(c.nom)}</option>`).join('');
  const m = A.croiser(etat.vues, etat.champ, etat.croix);
  $('es-croix-titre').innerHTML = `<span data-i18n-skip>${esc(nomChamp(etat.champ))}</span> par`;
  if (!m.lignes.length || !m.colonnes.length) { $('es-matrice').innerHTML = '<p class="es-reste">Pas assez de valeurs pour croiser ces deux champs.</p>'; $('ph-croix').innerHTML = `<p>${L('Pas assez de valeurs pour croiser ces deux colonnes.', 'Not enough values to cross these two columns.')}</p>`; return; }
  // La case la plus chargée, mise en phrase.
  let fort = null;
  for (const l of m.lignes) for (const c of m.colonnes) { const k = m.n(l.v, c.v); if (!fort || k > fort.k) fort = { l, c, k }; }
  const cases = `<b>${esc(nbL(fort.k))}</b>`, partLigne = `<b>${pct(Math.round((fort.k / fort.l.n) * 100))}</b>`;
  $('ph-croix').innerHTML = `<p>${L(`${motColore(fort.l.v)} et ${mot(fort.c.libelle)} : ${cases} entrées, la case la plus chargée.`, `${motColore(fort.l.v)} and ${mot(fort.c.libelle)}: ${cases} entries, the busiest cell.`)}</p>`
    + `<small>${L(`Soit ${partLigne} des entrées de ${mot(fort.l.v)}.`, `That is ${partLigne} of the entries for ${mot(fort.l.v)}.`)}</small>`;
  const tete = '<tr><th></th>' + m.colonnes.map((c) => `<th data-i18n-skip title="${esc(c.v)}">${esc(lib(c.libelle))}</th>`).join('') + '<th>Total</th></tr>';
  const corps = m.lignes.map((l) => `<tr><th data-i18n-skip><i style="background:${etat.pal.couleur(l.v)}"></i>${esc(lib(l.v))}</th>`
    + m.colonnes.map((c) => {
      const k = m.n(l.v, c.v), force = k / m.max;
      // --f = intensité de la case (0 à 1). La couleur vient de la feuille de style : encre sur papier dans le rapport, clair sur nuit dans le poste.
      return k ? `<td><button type="button" data-l="${esc(l.v)}" data-c="${esc(c.v)}" class="${force > 0.5 ? 'is-fort' : ''}" style="--f:${(0.08 + 0.92 * force).toFixed(3)}">${esc(nb(k))}</button></td>` : '<td><span>·</span></td>';
    }).join('') + `<td class="num">${esc(nb(l.n))}</td></tr>`).join('');
  $('es-matrice').innerHTML = `<div class="vp-table-cadre"><table class="es-croise"><thead>${tete}</thead><tbody>${corps}</tbody></table></div>`;
}

// Tableau des entrées de la vue, triable.
function colonnesTable() {
  const cols = [{ cle: 'date_evt', nom: 'Date' }, { cle: 'titre', nom: 'Titre' }, { cle: 'lieu', nom: 'Lieu' }, { cle: 'pays', nom: 'Pays' }];
  if (!cols.find((c) => c.cle === etat.champ)) cols.push({ cle: etat.champ, nom: nomChamp(etat.champ), client: true });
  if (etat.champ !== 'gravite' && etat.toutes.some((e) => e.gravite)) cols.push({ cle: 'gravite', nom: 'Gravité' });
  return cols;
}
function rendreTable() {
  const cols = colonnesTable(), { cle, sens } = etat.tri;
  const lignes = etat.vues.slice().sort((a, b) => {
    const x = A.valeur(a, cle), y = A.valeur(b, cle);
    if (x === y) return 0;
    if (x === null) return 1;            // les valeurs vides toujours en bas
    if (y === null) return -1;
    return x.localeCompare(y, 'fr', { numeric: true }) * sens;
  });
  etat.triees = lignes;
  $('es-table').innerHTML = '<thead><tr>' + cols.map((c) => `<th><button type="button" data-tri="${esc(c.cle)}"${c.client ? ' data-i18n-skip' : ''} aria-sort="${c.cle === cle ? (sens > 0 ? 'ascending' : 'descending') : 'none'}"><span>${esc(c.nom)}</span>${c.cle === cle ? `<span aria-hidden="true" data-i18n-skip>${sens > 0 ? '↑' : '↓'}</span>` : ''}</button></th>`).join('') + '</tr></thead><tbody data-i18n-skip>'
    + lignes.slice(0, etat.lignesVisibles).map((e, i) => `<tr data-i="${i}" tabindex="0">` + cols.map((c) => {
      const v = c.cle === 'date_evt' ? dateFr(e.date_evt) : (A.valeur(e, c.cle) ?? '');
      const pastille = c.cle === etat.champ && v ? `<i style="background:${etat.pal.couleur(v)}"></i>` : '';
      return `<td class="${c.cle === 'date_evt' ? 'num' : ''}" title="${esc(v)}">${pastille}${esc(v)}</td>`;
    }).join('') + '</tr>').join('') + '</tbody>';
  $('es-table-vide').hidden = lignes.length > 0;
  $('es-plus').hidden = lignes.length <= etat.lignesVisibles;
  const reste = lignes.length - etat.lignesVisibles;
  if (reste > 0) $('es-plus').textContent = `Afficher la suite (${nb(Math.min(50, reste))} sur ${nb(reste)} restantes)`;
}

// Fiche : une entrée avec tous ses champs, ou la liste des entrées d'un même endroit.
function montrerFiche(entrees) {
  const hote = $('es-fiche');
  if (!entrees.length) { hote.hidden = true; return; }
  hote.hidden = false;
  const fermer = '<button type="button" class="es-fiche__x" data-fermer-fiche aria-label="Fermer la fiche">×</button>';
  if (entrees.length > 1) {
    etat.ficheListe = entrees;
    hote.innerHTML = `${fermer}<p class="es-fiche__sur">${esc(nb(entrees.length))} entrées au même endroit</p>
      <ul class="es-fiche__liste" data-i18n-skip>${entrees.slice(0, 200).map((e, i) => `<li><button type="button" data-fiche="${i}"><i style="background:${etat.pal.couleur(A.valeur(e, etat.champ) ?? '')}"></i><span>${esc(e.titre)}</span><small>${esc(dateFr(e.date_evt))}</small></button></li>`).join('')}</ul>`;
    return;
  }
  const e = entrees[0];
  const rang = (nom, v, client = true) => (v == null || v === '' ? '' : `<div><dt>${esc(nom)}</dt><dd${client ? ' data-i18n-skip' : ''}>${esc(v)}</dd></div>`);
  const position = e.lat == null ? 'Hors carte' : e.precision_geo === 'pays' ? 'Centre du pays (position approximative)' : `${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}`;
  // Le lien n'est rendu cliquable que s'il est en http ou https (jamais javascript: ni data:).
  const lien = e.url && /^https?:\/\//i.test(e.url) ? `<div><dt>Lien</dt><dd><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer nofollow" data-i18n-skip>${esc(e.url.replace(/^https?:\/\//i, '').slice(0, 60))}</a></dd></div>` : '';
  hote.innerHTML = `${fermer}${etat.ficheListe && etat.ficheListe.includes(e) ? '<button type="button" class="es-fiche__retour" data-fiche-retour>Retour à la liste</button>' : ''}
    <p class="es-fiche__sur"><i style="background:${etat.pal.couleur(A.valeur(e, etat.champ) ?? '')}"></i><span data-i18n-skip>${esc(lib(A.valeur(e, etat.champ)))}</span></p>
    <h4 data-i18n-skip>${esc(e.titre)}</h4>
    <dl>${rang('Date', dateFr(e.date_evt), false)}${rang('Lieu', [e.lieu, e.pays].filter(Boolean).join(', '))}${rang('Position', position, false)}
      ${rang('Catégorie', e.categorie)}${rang('Gravité', e.gravite)}${rang('Source', e.source)}${lien}
      ${Object.entries(e.libres || {}).map(([k, v]) => `<div><dt data-i18n-skip>${esc(k)}</dt><dd data-i18n-skip>${esc(v)}</dd></div>`).join('')}</dl>
    ${e.description ? `<p class="es-fiche__desc" data-i18n-skip>${esc(e.description)}</p>` : ''}
    ${etat.acces && e.id ? '<div class="es-fiche__actions"><button type="button" class="btn-outline" data-modifier>Modifier</button><button type="button" class="btn-outline vp-danger" data-supprimer>Supprimer</button></div>' : ''}`;
  etat.ficheEntree = e;
}

// ---------------------------------------------------------------- Interactions
function basculer(cle, v) {
  const set = etat.filtre.valeurs[cle] || (etat.filtre.valeurs[cle] = new Set());
  if (set.has(v)) set.delete(v); else set.add(v);
  $('es-fiche').hidden = true; etat.ficheListe = null;
  rendre({ cadrer: true });
}

export function brancherEspace() {
  // Le poste d'analyse est déplacé à la racine de la page : placé dans une section du site, il resterait
  // coincé sous la barre de navigation et ne pourrait pas couvrir tout l'écran.
  document.body.appendChild($('v-espace'));
  $('es-champ').addEventListener('change', () => { etat.champ = $('es-champ').value; if (etat.croix === etat.champ) etat.croix = 'mois'; $('es-fiche').hidden = true; rendre(); });
  $('es-croix').addEventListener('change', () => { etat.croix = $('es-croix').value; rendreMatrice(); });
  let minuterie = null;
  $('es-recherche').addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(() => { etat.filtre.recherche = $('es-recherche').value.trim(); rendre(); }, 220); });

  $('es-periodes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-jours]'); if (!b) return;
    const jours = Number(b.dataset.jours);
    etat.filtre.de = jours ? A.ajouterJours(etat.max, -(jours - 1)) : null;
    etat.filtre.a = jours ? etat.max : null;
    rendre();
  });
  $('es-actifs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-retire]'); if (!b) return;
    const quoi = b.dataset.retire;
    if (quoi === 'tout') { etat.filtre = { recherche: '', de: null, a: null, valeurs: {} }; $('es-recherche').value = ''; }
    else if (quoi === 'periode') { etat.filtre.de = null; etat.filtre.a = null; }
    else etat.filtre.valeurs[quoi].delete(b.dataset.v);
    rendre({ cadrer: true });
  });
  for (const hote of ['es-rep', 'es-geo', 'es-lieux', 'es-bandeau', 'es-mouv', 'es-legende']) $(hote).addEventListener('click', (e) => { const b = e.target.closest('button[data-cle]'); if (b) basculer(b.dataset.cle, b.dataset.v); });

  $('es-matrice').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-l]'); if (!b) return;
    etat.filtre.valeurs[etat.champ] = new Set([b.dataset.l]);
    if (etat.croix === 'mois') {
      const [an, mois] = b.dataset.c.split('-').map(Number);
      etat.filtre.de = `${b.dataset.c}-01`; etat.filtre.a = new Date(Date.UTC(an, mois, 0)).toISOString().slice(0, 10);
    } else etat.filtre.valeurs[etat.croix] = new Set([b.dataset.c]);
    rendre({ cadrer: true });
  });

  $('es-table').addEventListener('click', (e) => {
    const tri = e.target.closest('button[data-tri]');
    if (tri) { etat.tri = { cle: tri.dataset.tri, sens: etat.tri.cle === tri.dataset.tri ? -etat.tri.sens : 1 }; rendreTable(); return; }
    const ligne = e.target.closest('tr[data-i]');
    if (ligne) ouvrirLigne(etat.triees[Number(ligne.dataset.i)]);
  });
  $('es-table').addEventListener('keydown', (e) => { const l = e.target.closest('tr[data-i]'); if (l && e.key === 'Enter') ouvrirLigne(etat.triees[Number(l.dataset.i)]); });
  $('es-plus').addEventListener('click', () => { etat.lignesVisibles += 50; rendreTable(); });

  $('es-fiche').addEventListener('click', (e) => {
    if (e.target.closest('[data-modifier]')) return ouvrirSaisie(etat.ficheEntree);
    const suppr = e.target.closest('[data-supprimer]');
    if (suppr) return supprimerEntree(suppr);
    if (e.target.closest('[data-fermer-fiche]')) { $('es-fiche').hidden = true; etat.ficheListe = null; return; }
    if (e.target.closest('[data-fiche-retour]')) return montrerFiche(etat.ficheListe);
    const b = e.target.closest('button[data-fiche]');
    if (b) montrerFiche([etat.ficheListe[Number(b.dataset.fiche)]]);
  });
  $('es-monde').addEventListener('click', () => etat.carte.cadrer(etat.toutes));
  $('es-selection').addEventListener('click', () => etat.carte.cadrer(etat.vues));
  $('es-rapport').addEventListener('click', ouvrirRapport);
  $('es-onglets').addEventListener('click', (e) => { const b = e.target.closest('button[data-onglet]'); if (b) ouvrirOnglet(b.dataset.onglet); });
  $('es-modes').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b) changerMode(b.dataset.mode); });
  $('es-plein').addEventListener('click', () => pleinEcran(!$('es-carte').classList.contains('is-plein')));
  // Échap ferme ce qui est ouvert, du plus récent au plus ancien : le rapport, puis la fiche.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('es-saisie').open || $('v-espace').hidden) return;
    if (!$('rapport').hidden) return $('rapport-fermer').click();
    if (!$('es-fiche').hidden) { $('es-fiche').hidden = true; etat.ficheListe = null; }
  });
  $('es-anim').addEventListener('click', () => (lecture ? arreterLecture() : lireDansLeTemps()));
  brancherOutils();
  $('rapport-fermer').addEventListener('click', () => { $('rapport').hidden = true; document.documentElement.classList.remove('vp-rapport-ouvert'); });
  $('rapport-imprimer').addEventListener('click', () => window.print());
}

function ouvrirLigne(e) {
  if (!e) return;
  etat.ficheListe = null;
  montrerFiche([e]);
  if (e.lat != null) etat.carte.allerA(e);
  ouvrirOnglet('carte');
}

// --------------------------------------------------------------------- Rapport
// Une page A4 construite à partir de la vue affichée. Les chiffres sont calculés ;
// l'analyse et les recommandations sont écrites par le client, dans la page.
function ouvrirRapport() {
  const v = etat.vues, f = etat.filtre, b = A.bornes(v);
  const lieux = new Set(v.map((e) => e.lieu).filter(Boolean)).size, pays = new Set(v.map((e) => e.pays).filter(Boolean)).size;
  const evo = A.evolution(etat.toutes, f);
  const filtres = Object.entries(f.valeurs).filter(([, s]) => s.size).map(([cle, s]) => `${nomChamp(cle)} : ${[...s].map(lib).join(', ')}`);
  if (f.recherche) filtres.push(`Recherche : ${f.recherche}`);
  const tableau = (cle, max) => {
    const tri = A.compter(v, cle).slice(0, max), sommet = tri.length ? tri[0].n : 1;
    return `<table class="rp-rep"><tbody data-i18n-skip>${tri.map((x) => `<tr><td>${cle === etat.champ && x.v !== '' ? `<i style="background:${etat.pal.couleur(x.v)}"></i>` : ''}${esc(lib(x.v))}</td><td class="rp-trait"><i style="width:${(x.n / sommet) * 100}%"></i></td><td class="num">${esc(nb(x.n))}</td><td class="num">${Math.round((x.n / v.length) * 100)} %</td></tr>`).join('')}</tbody></table>`;
  };
  const second = etat.champ === 'pays' ? 'lieu' : 'pays';
  const recentes = v.filter((e) => e.date_evt).sort((x, y) => y.date_evt.localeCompare(x.date_evt)).slice(0, 12);
  const faits = A.faits(v, etat.champ);
  const aujourdhui = new Date().toLocaleDateString('fr-FR');
  const t = (x) => (window.AlgorI18n ? window.AlgorI18n.t(x) : x);   // pour les textes posés en attribut

  $('rapport-page').innerHTML = `
    <header class="rp-tete">
      <p class="rp-marque">Algor Acces <span>Veille privée</span></p>
      <h1 contenteditable="plaintext-only" spellcheck="false" data-i18n-skip>Rapport de veille : ${esc(etat.nom)}</h1>
      <p class="rp-sous">${b.min ? `Période du ${esc(dateFr(b.min))} au ${esc(dateFr(b.max))}. ` : ''}Édité le ${esc(aujourdhui)}.</p>
      ${filtres.length ? `<p class="rp-filtres" data-i18n-skip>${esc(filtres.join(' · '))}</p>` : ''}
    </header>
    <section class="rp-chiffres">
      <div><b>${esc(nb(v.length))}</b><span>${v.length > 1 ? 'entrées' : 'entrée'}</span></div>
      <div><b>${esc(nb(lieux))}</b><span>${lieux > 1 ? 'lieux' : 'lieu'}</span></div>
      <div><b>${esc(nb(pays))}</b><span>pays</span></div>
      ${evo ? `<div><b>${evo.pourcent > 0 ? '+' : ''}${evo.pourcent} %</b><span>sur ${evo.jours} jours</span></div>` : ''}
    </section>
    <section><h2>À retenir</h2><div class="rp-phrases" data-i18n-skip>${['ph-carte', 'ph-quand', 'ph-qui', 'ph-croix'].map((id) => `<div>${$(id).innerHTML}</div>`).join('')}</div></section>
    <section><h2>Analyse</h2><div class="rp-saisie" contenteditable="plaintext-only" data-vide="${esc(t('Écrivez ici votre lecture de la période.'))}" data-i18n-skip></div></section>
    <section class="rp-carte"><h2>Carte</h2><img alt="Carte des entrées du rapport" src="${etat.carte.image()}">
      <p class="rp-legende">${etat.pal.legende.map((x) => `<span><i style="background:${x.couleur}"></i><span data-i18n-skip>${esc(x.v)}</span></span>`).join('')}${etat.pal.autres ? `<span><i style="background:${A.COULEUR_AUTRES}"></i>Autres</span>` : ''}</p></section>
    ${$('es-frise-bloc').hidden ? '' : `<section><h2>Dans le temps</h2><div class="rp-frise">${$('es-frise').querySelector('svg').outerHTML}</div><div class="es-frise__axe">${$('es-frise').querySelector('.es-frise__axe').innerHTML}</div></section>`}
    <section class="rp-deux"><div><h2 data-i18n-skip>${esc(nomChamp(etat.champ))}</h2>${tableau(etat.champ, 8)}</div><div><h2>${second === 'pays' ? 'Pays' : 'Lieux'}</h2>${tableau(second, 8)}</div></section>
    <section><h2><span data-i18n-skip>${esc(nomChamp(etat.champ))}</span> par <span data-i18n-skip>${esc(nomChamp(etat.croix).toLowerCase())}</span></h2>${$('es-matrice').innerHTML}</section>
    <section><h2>Dernières entrées</h2><table class="rp-liste"><tbody data-i18n-skip>${recentes.map((e) => `<tr><td class="num">${esc(dateFr(e.date_evt))}</td><td>${esc(e.titre)}</td><td>${esc([e.lieu, e.pays].filter(Boolean).join(', '))}</td></tr>`).join('')}</tbody></table></section>
    <section><h2>Recommandations</h2><div class="rp-saisie" contenteditable="plaintext-only" data-vide="${esc(t('Écrivez ici vos recommandations.'))}" data-i18n-skip></div></section>
    <footer class="rp-pied">Données fournies par le client. Chiffres calculés à partir de ces données, sans intelligence artificielle. Analyse et recommandations rédigées par l'auteur du rapport.</footer>`;
  $('rapport').hidden = false;
  document.documentElement.classList.add('vp-rapport-ouvert');
  $('rapport').scrollTop = 0;
}

// ============================================================ Vues enregistrées
// Une vue = le champ de lecture et les filtres du moment, sous un nom. Elle est rangée en base
// avec la même règle que le reste : visible du seul compte propriétaire.
function vueCourante() {
  const f = etat.filtre;
  return { champ: etat.champ, croix: etat.croix, recherche: f.recherche, de: f.de, a: f.a,
    valeurs: Object.fromEntries(Object.entries(f.valeurs).filter(([, s]) => s.size).map(([k, s]) => [k, [...s]])) };
}

// Ce qui revient de la base est relu avec méfiance : types vérifiés, champs inconnus ignorés.
function appliquerVue(v) {
  const iso = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  if (v && etat.champs.find((c) => c.cle === v.champ)) etat.champ = v.champ;
  if (v && typeof v.croix === 'string') etat.croix = v.croix;
  const valeurs = {};
  for (const [cle, liste] of Object.entries((v && v.valeurs) || {})) if (Array.isArray(liste)) valeurs[cle] = new Set(liste.map(String));
  etat.filtre = { recherche: typeof (v && v.recherche) === 'string' ? v.recherche.slice(0, 200) : '', de: iso(v && v.de), a: iso(v && v.a), valeurs };
  $('es-recherche').value = etat.filtre.recherche;
  $('es-champ').value = etat.champ;
  rendre({ cadrer: true });
}

function rendreVues(choisie = '') {
  $('es-vues').innerHTML = '<option value="">Vues enregistrées</option>'
    + etat.vuesEnregistrees.map((v) => `<option value="${esc(v.id)}" data-i18n-skip${v.id === choisie ? ' selected' : ''}>${esc(v.nom)}</option>`).join('');
  $('es-vues').hidden = !etat.vuesEnregistrees.length;
  $('es-vue-suppr').hidden = !choisie;
}

async function chargerVues() {
  etat.vuesEnregistrees = [];
  if (etat.acces) { try { etat.vuesEnregistrees = await base.listerVues(etat.acces.c, etat.acces.baseId); } catch (e) { console.error(e); } }
  rendreVues();
}

// ================================================================== Exports
// CSV de la vue en cours, lisible par Excel en français (point-virgule, virgule décimale, UTF-8 signé).
// Un tableur exécute comme une formule toute cellule qui commence par = + - ou @ : ces cellules
// de texte sont précédées d'une apostrophe, qui les force en texte. Les latitudes et longitudes
// sont des nombres que nous avons validés nous-mêmes : elles restent des nombres, même négatives.
function exporterCsv() {
  const libres = [];
  for (const e of etat.vues) for (const k of Object.keys(e.libres || {})) if (!libres.includes(k)) libres.push(k);
  const texte = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const nombre = (n) => (n == null ? '' : String(n).replace('.', ','));
  const lignes = [['Titre', 'Date', 'Lieu', 'Pays', 'Latitude', 'Longitude', 'Catégorie', 'Gravité', 'Source', 'Lien', 'Description', ...libres].map(texte).join(';')];
  for (const e of etat.vues) {
    lignes.push([texte(e.titre), texte(dateFr(e.date_evt)), texte(e.lieu), texte(e.pays), nombre(e.lat), nombre(e.lon), texte(e.categorie), texte(e.gravite),
      texte(e.source), texte(e.url), texte(e.description), ...libres.map((k) => texte((e.libres || {})[k]))].join(';'));
  }
  telecharger(new Blob(['﻿' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' }), nomFichier('csv'));
}

const nomFichier = (extension) => (etat.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'veille') + '.' + extension;

function telecharger(contenu, nom) {
  const lien = document.createElement('a');
  lien.href = typeof contenu === 'string' ? contenu : URL.createObjectURL(contenu);
  lien.download = nom;
  document.body.appendChild(lien); lien.click(); lien.remove();
  if (typeof contenu !== 'string') setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
}

// ============================================================ Saisie à la main
const CHAMPS_SAISIE = [
  ['titre', 'Titre', 'text', 500], ['date_evt', 'Date', 'date'], ['lieu', 'Lieu', 'text', 300], ['pays', 'Pays', 'text', 120],
  ['lat', 'Latitude', 'text', 20], ['lon', 'Longitude', 'text', 20], ['categorie', 'Catégorie', 'text', 200], ['gravite', 'Gravité', 'text', 100],
  ['source', 'Source', 'text', 300], ['url', 'Lien', 'url', 2000], ['description', 'Description', 'textarea', 10000]
];
let enSaisie = null;   // l'entrée en cours de modification, ou null pour un ajout

function ouvrirSaisie(entree) {
  enSaisie = entree || null;
  $('es-saisie-titre').textContent = entree ? 'Modifier l’entrée' : 'Ajouter une entrée';
  const libres = [];
  for (const e of etat.toutes.slice(0, 3000)) for (const k of Object.keys(e.libres || {})) if (!libres.includes(k) && libres.length < 30) libres.push(k);
  // Propositions tirées de la base pour les champs courts : on évite « Vol » et « vol » côte à côte.
  const propositions = (cle) => A.compter(etat.toutes, cle).filter((x) => x.v).slice(0, 40).map((x) => `<option value="${esc(x.v)}"></option>`).join('');
  const valeurDe = (cle) => (entree ? (cle === 'lat' || cle === 'lon' ? (entree[cle] ?? '') : (entree[cle] ?? '')) : '');
  $('es-saisie-champs').innerHTML = CHAMPS_SAISIE.map(([cle, nom, type, max]) => {
    const v = valeurDe(cle), id = 'saisie-' + cle;
    if (type === 'textarea') return `<div class="v5-field v5-field--full"><label for="${id}">${nom}</label><textarea id="${id}" maxlength="${max}" data-i18n-skip>${esc(v)}</textarea></div>`;
    const liste = ['categorie', 'gravite', 'pays', 'source'].includes(cle) ? ` list="${id}-liste"` : '';
    return `<div class="v5-field${cle === 'titre' ? ' v5-field--full' : ''}"><label for="${id}">${nom}</label><input id="${id}" type="${type === 'url' ? 'text' : type}"${max ? ` maxlength="${max}"` : ''}${liste} value="${esc(v)}">${liste ? `<datalist id="${id}-liste">${propositions(cle)}</datalist>` : ''}</div>`;
  }).join('') + libres.map((k, i) => `<div class="v5-field"><label for="saisie-libre-${i}" data-i18n-skip>${esc(k)}</label><input id="saisie-libre-${i}" type="text" maxlength="500" data-libre="${esc(k)}" value="${esc(entree ? (entree.libres || {})[k] ?? '' : '')}"></div>`).join('');
  $('es-saisie-statut').textContent = '';
  $('es-saisie-statut').className = 'vp-statut';
  $('es-saisie').showModal();
}

// Relit le formulaire. Rend { entree } ou { erreur }.
function lireSaisie() {
  const champ = (cle) => $('saisie-' + cle).value.replace(/\s+/g, ' ').trim();
  const e = { titre: champ('titre') || null, date_evt: $('saisie-date_evt').value || null, lieu: champ('lieu') || null, pays: champ('pays') || null,
    lat: null, lon: null, precision_geo: null, categorie: champ('categorie') || null, gravite: champ('gravite') || null, source: champ('source') || null,
    url: null, description: $('saisie-description').value.trim() || null, libres: {} };
  if (!e.titre) return { erreur: 'Donnez un titre à l’entrée.' };
  const la = champ('lat'), lo = champ('lon');
  if (la || lo) {
    const lat = lireNombre(la), lon = lireNombre(lo);
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return { erreur: 'Coordonnées inutilisables. La latitude va de -90 à 90, la longitude de -180 à 180.' };
    e.lat = lat; e.lon = lon;
    const memes = enSaisie && enSaisie.lat === lat && enSaisie.lon === lon;
    e.precision_geo = memes ? enSaisie.precision_geo : 'manuel';
  }
  const lien = champ('url');
  if (lien) {
    if (!/^https?:\/\/[^\s]+$/i.test(lien)) return { erreur: 'Le lien doit commencer par http:// ou https://.' };
    e.url = lien;
  }
  for (const input of document.querySelectorAll('#es-saisie-champs [data-libre]')) { const v = input.value.trim(); if (v) e.libres[input.dataset.libre] = v; }
  e.empreinte = empreinteDe(e);
  return { entree: e };
}

async function enregistrerSaisie(evenement) {
  evenement.preventDefault();
  const statut = $('es-saisie-statut');
  const { entree, erreur } = lireSaisie();
  if (erreur) { statut.textContent = erreur; statut.className = 'vp-statut is-err'; return; }
  statut.textContent = 'Enregistrement…'; statut.className = 'vp-statut';
  try {
    let ligne;
    if (enSaisie) {
      ligne = await base.modifierLigne(etat.acces.c, enSaisie.id, entree);
      etat.toutes[etat.toutes.indexOf(enSaisie)] = ligne;
    } else {
      ligne = await base.ajouterLigne(etat.acces.c, etat.acces.baseId, entree);
      etat.toutes.push(ligne);
    }
    apresModification();
    $('es-saisie').close();
    etat.ficheListe = null;
    ouvrirOnglet('carte');   // la fiche de l'entrée s'ouvre sur la carte
    montrerFiche([ligne]);
    if (ligne.lat != null) etat.carte.allerA(ligne);
  } catch (e) {
    statut.textContent = base.messageErreur(e); statut.className = 'vp-statut is-err';
  }
}

// Après un ajout, une modification ou une suppression : les champs lisibles et la dernière date peuvent avoir changé.
function apresModification() {
  etat.champs = A.champsLisibles(etat.toutes);
  etat.max = A.bornes(etat.toutes).max;
  $('es-champ').innerHTML = etat.champs.map((c) => `<option value="${esc(c.cle)}"${c.cle === etat.champ ? ' selected' : ''} data-i18n-skip>${esc(c.nom)}</option>`).join('');
  rendre();
}

// Suppression en deux clics, comme pour une base.
let confirmeSuppression = null;
async function supprimerEntree(bouton) {
  if (confirmeSuppression !== etat.ficheEntree) {
    confirmeSuppression = etat.ficheEntree;
    bouton.textContent = 'Confirmer la suppression';
    return;
  }
  confirmeSuppression = null;
  try {
    await base.supprimerLigne(etat.acces.c, etat.ficheEntree.id);
    etat.toutes.splice(etat.toutes.indexOf(etat.ficheEntree), 1);
    $('es-fiche').hidden = true; etat.ficheListe = null;
    apresModification();
  } catch (e) { bouton.textContent = base.messageErreur(e); }
}

function brancherOutils() {
  $('es-csv').addEventListener('click', exporterCsv);
  $('es-image').addEventListener('click', () => telecharger(etat.carte.image(), nomFichier('jpg')));
  $('es-ajouter').addEventListener('click', () => ouvrirSaisie(null));
  $('es-saisie-form').addEventListener('submit', enregistrerSaisie);
  $('es-saisie-annuler').addEventListener('click', () => $('es-saisie').close());

  $('es-vues').addEventListener('change', () => {
    const v = etat.vuesEnregistrees.find((x) => x.id === $('es-vues').value);
    $('es-vue-suppr').hidden = !v;
    if (v) appliquerVue(v.filtres);
  });
  $('es-vue-enreg').addEventListener('click', () => { $('es-vue-form').hidden = !$('es-vue-form').hidden; if (!$('es-vue-form').hidden) $('es-vue-nom').focus(); });
  $('es-vue-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nom = $('es-vue-nom').value.trim().slice(0, 80);
    if (!nom) return;
    try {
      const vue = await base.creerVue(etat.acces.c, etat.acces.baseId, nom, vueCourante());
      etat.vuesEnregistrees.push(vue);
      $('es-vue-nom').value = ''; $('es-vue-form').hidden = true;
      rendreVues(vue.id);
    } catch (err) { $('es-vue-nom').value = ''; $('es-vue-nom').placeholder = base.messageErreur(err); }
  });
  $('es-vue-suppr').addEventListener('click', async () => {
    const id = $('es-vues').value;
    if (!id) return;
    try { await base.supprimerVue(etat.acces.c, id); etat.vuesEnregistrees = etat.vuesEnregistrees.filter((v) => v.id !== id); rendreVues(); } catch (e) { console.error(e); }
  });
}

// ================================================================ Plein écran
function pleinEcran(oui) {
  $('es-carte').classList.toggle('is-plein', oui);
  document.documentElement.classList.toggle('vp-carte-pleine', oui);
  $('es-plein').textContent = oui ? 'Quitter le plein écran' : 'Plein écran';
  etat.carte.redimensionner();
}

// ============================================================ Lecture animée
// La frise défile du début à la fin : la carte montre à chaque pas tout ce qui s'est passé
// jusqu'à la date affichée. En 45 pas au plus, pour qu'une longue base ne dure pas des minutes.
let lecture = null;
function lireDansLeTemps() {
  const f = etat.filtre, avant = { de: f.de, a: f.a };
  const tranches = A.frise(A.filtrer(etat.toutes, { ...f, de: null, a: null }), etat.champ).tranches;
  if (tranches.length < 3) return;
  const saut = Math.max(1, Math.ceil(tranches.length / 45));
  let i = 0;
  $('es-anim').textContent = 'Arrêter';
  ouvrirOnglet('carte');
  const pas = () => {
    f.de = tranches[0].de; f.a = tranches[i].a;
    etat.vues = A.filtrer(etat.toutes, f);
    rendreLecture(); rendreCarte(false); rendreFrise();
    $('es-date-anim').hidden = false;
    $('es-date-anim').textContent = `Jusqu’au ${dateFr(tranches[i].a)} : ${nb(etat.vues.length)}`;
    if (i >= tranches.length - 1) { clearInterval(lecture.minuterie); lecture.minuterie = setTimeout(arreterLecture, 1800); return; }
    i = Math.min(tranches.length - 1, i + saut);
  };
  lecture = { avant, minuterie: setInterval(pas, 700) };
  pas();
}

function arreterLecture() {
  if (!lecture) return;
  clearInterval(lecture.minuterie); clearTimeout(lecture.minuterie);
  etat.filtre.de = lecture.avant.de; etat.filtre.a = lecture.avant.a;
  lecture = null;
  $('es-anim').textContent = 'Rejouer dans le temps';
  $('es-date-anim').hidden = true;
  rendre();
}

// ===================================================================== Onglets
function ouvrirOnglet(nom) {
  for (const b of $('es-onglets').children) b.setAttribute('aria-selected', String(b.dataset.onglet === nom));
  for (const vue of document.querySelectorAll('#v-espace .poste__vue')) vue.hidden = vue.dataset.vue !== nom;
  if (nom === 'carte' && etat.carte) etat.carte.redimensionner();
}

// ============================================================ Tableau de bord
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
function rendreBord() {
  const v = etat.vues, total = v.length;
  // Bandeau : une seule barre, découpée selon la part de chaque valeur
  $('es-bandeau-titre').textContent = nomChamp(etat.champ);
  const tri = A.compter(v, etat.champ);
  const tete = tri.slice(0, 6), reste = tri.slice(6).reduce((s, x) => s + x.n, 0);
  const part = (n) => (total ? (n / total) * 100 : 0);
  $('es-bandeau').innerHTML = `<div class="es-bandeau__barre">${tete.map((x) => `<button type="button" data-cle="${esc(etat.champ)}" data-v="${esc(x.v)}" style="width:${part(x.n)}%;background:${etat.pal.couleur(x.v)}" title="${esc(lib(x.v))}" aria-label="${esc(lib(x.v))}"></button>`).join('')}${reste ? `<span style="width:${part(reste)}%"></span>` : ''}</div>
    <div class="es-bandeau__legende">${tete.map((x) => `<button type="button" data-cle="${esc(etat.champ)}" data-v="${esc(x.v)}"><i style="background:${etat.pal.couleur(x.v)}"></i><b>${Math.round(part(x.n))} %</b><span data-i18n-skip>${esc(lib(x.v))}</span></button>`).join('')}${reste ? `<span><i></i><b>${Math.round(part(reste))} %</b><span>Autres</span></span>` : ''}</div>`;

  // Ce qui monte, ce qui baisse : barres vers la droite pour une hausse, vers la gauche pour une baisse
  const mouv = A.mouvements(v, etat.champ).filter((x) => x.avant + x.apres > 0);
  const garde = mouv.length > 9 ? [...mouv.slice(0, 5), ...mouv.slice(-4)] : mouv;
  const ampleur = Math.max(1, ...garde.map((x) => Math.abs(x.ecart)));
  $('es-mouv').innerHTML = garde.length ? garde.map((x) => `<button type="button" class="es-mouv-l" data-cle="${esc(etat.champ)}" data-v="${esc(x.v)}">
      <span class="es-mouv-l__nom" data-i18n-skip><i style="background:${etat.pal.couleur(x.v)}"></i>${esc(lib(x.v))}</span>
      <span class="es-mouv-l__axe"><i class="${x.ecart < 0 ? 'is-baisse' : 'is-hausse'}" style="width:${(Math.abs(x.ecart) / ampleur) * 50}%"></i></span>
      <span class="es-mouv-l__n">${x.ecart > 0 ? '+' : ''}${esc(nb(x.ecart))}</span>
      <span class="es-mouv-l__detail">${esc(nb(x.avant))} puis ${esc(nb(x.apres))}</span></button>`).join('')
    : '<p class="es-reste">Il faut des dates sur plus d’un jour pour comparer.</p>';

  // Rythme de la semaine
  const rythme = A.rythmeSemaine(v), sommet = Math.max(1, ...rythme);
  $('es-rythme').innerHTML = `<div class="es-rythme">${rythme.map((n, i) => `<div><span>${esc(nb(n))}</span><i style="height:${Math.max(2, (n / sommet) * 100)}%"></i><b>${JOURS[i]}</b></div>`).join('')}</div>`;

  // Calendrier : une colonne par semaine, une case par jour, plus sombre quand il y a plus d'entrées
  const cal = A.calendrier(v);
  if (!cal) { $('es-cal').innerHTML = '<p class="es-reste">Aucune date dans la sélection.</p>'; $('es-cal-note').textContent = ''; }
  else {
    $('es-cal-note').textContent = `Du ${dateFr(cal.semaines[0][0].jour)} au ${dateFr(cal.fin)}. Maximum par jour : ${nb(cal.max)}.`;
    $('es-cal').innerHTML = `<div class="es-cal" style="--semaines:${cal.semaines.length}">${cal.semaines.map((s) => `<div>${s.map((j) => (j.n === null ? '<i class="is-hors"></i>' : `<i style="--f:${j.n ? (0.18 + 0.82 * (j.n / cal.max)).toFixed(2) : 0}" title="${dateFr(j.jour)} : ${nb(j.n)}"></i>`)).join('')}</div>`).join('')}</div>`;
  }
}
