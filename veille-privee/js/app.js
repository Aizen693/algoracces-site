// Veille privée : les écrans. Ce fichier ne fait que de l'affichage et de l'enchaînement :
//   lecture.js   lit le fichier dans le navigateur
//   detection.js devine les colonnes, convertit les lignes, dresse le rapport
//   stockage.js  parle à la base (c'est la base qui cloisonne, par RLS)
//   demo.js      fabrique le jeu fictif de la démonstration
//
// RÈGLE DE SÉCURITÉ : tout ce qui vient du fichier du client est hostile par défaut.
// On ne l'insère jamais dans la page sans passer par esc(), et on le place sous
// data-i18n-skip pour que le traducteur du site n'y touche pas.

import { lireFichier, ErreurLecture } from './lecture.js?v=20261117k';
import { ROLES, devinerRoles, convertir, placerAuCentreDuPays } from './detection.js?v=20261117k';
import * as base from './stockage.js?v=20261117k';
import { jeuFictif, demonstration } from './demo.js?v=20261117k';
import { ouvrirEspace, brancherEspace } from './espace.js?v=20261117k';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '');
// 20000 → « 20 000 ». Le traducteur du site reconnaît cette écriture et la passe en « 20,000 » en anglais.
const nb = (n) => Number(n).toLocaleString('fr-FR');

// En développement seulement (localhost + ?essai-local) : permet de déposer un fichier
// sans compte, pour tester la lecture. Rien n'est enregistré dans ce mode.
const ESSAI_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('essai-local');

const etat = {
  c: null,            // client Supabase
  abonne: false,
  demo: false,        // démonstration : rien n'est enregistré
  bases: [],
  baseOuverte: null,  // { id, nom, lignes, colonnes }
  cible: null,        // base à mettre à jour, ou null pour une nouvelle base
  fichier: null,      // { nom, entetes, lignes, notes }
  roles: [],          // rôle de chaque colonne du fichier
  rapport: null       // résultat de convertir()
};

// ------------------------------------------------------------------ Affichage
function montrer(vue) {
  $('verif').hidden = true;
  for (const v of ['v-presentation', 'v-bases', 'v-base', 'v-import']) $(v).hidden = v !== vue;
  if (vue !== 'v-base') $('v-espace').hidden = true;   // le poste d'analyse vit hors de ces blocs (voir brancherEspace)
}

function statut(id, texte, genre) {
  const el = $(id);
  el.textContent = texte || '';
  el.className = 'vp-statut' + (genre ? ' is-' + genre : '');
}

function etape(n) {
  $('e-fichier').hidden = n !== 1;
  $('e-correspondance').hidden = n !== 2;
  $('e-rapport').hidden = n !== 3;
  for (const li of $('etapes').children) {
    const k = Number(li.dataset.etape);
    li.className = k === n ? 'is-active' : k < n ? 'is-faite' : '';
  }
  $('v-import').scrollIntoView({ block: 'start' });
}

// --------------------------------------------------------------- Démarrage
async function demarrer() {
  etat.c = await base.client();
  if (!etat.c) { $('verif').textContent = 'Service de compte indisponible. Rechargez la page.'; return; }
  const { session, abonne } = await base.compte(etat.c);
  etat.abonne = abonne;
  etat.connecte = !!session;
  etat.lectureSeule = false;
  if (abonne) return afficherBases();
  // Ancien abonné : ses bases restent lisibles et exportables jusqu'à leur effacement, sans import ni modification.
  if (session) {
    let anciennes = [];
    try { anciennes = await base.listerBases(etat.c); } catch (e) { /* tables fermées : on montre la présentation */ }
    if (anciennes.length) {
      etat.lectureSeule = true;
      etat.echeance = await base.echeance(etat.c);
      return afficherBases();
    }
  }
  // Visiteur, ou compte sans abonnement : présentation et démonstration.
  $('presentation-acces').textContent = session
    ? 'Votre compte ne comprend pas la veille privée. Elle est réservée aux abonnés.'
    : 'La veille privée est réservée aux abonnés.';
  $('presentation-login').hidden = !!session;
  montrer('v-presentation');
}

// Connexion ou déconnexion pendant la visite : on repart de zéro, sauf au milieu d'un import.
// L'événement arrive aussi à chaque renouvellement de session : on ne réagit que si l'état change vraiment,
// sinon l'abonné serait renvoyé à la liste de ses bases en pleine lecture.
window.addEventListener('algorAuthStateChanged', (e) => {
  const connecte = !!(e.detail && e.detail.loggedIn);
  if (!etat.c || !$('v-import').hidden || connecte === etat.connecte) return;
  demarrer();
});

// ---------------------------------------------------------------- Mes bases
async function afficherBases(message) {
  montrer('v-bases');
  statut('bases-statut', message || '', message ? 'ok' : '');
  try { etat.bases = await base.listerBases(etat.c); }
  catch (e) { etat.bases = []; statut('bases-statut', base.messageErreur(e), 'err'); }
  $('bases-vide').hidden = etat.bases.length > 0;
  $('importer').hidden = etat.lectureSeule;
  $('bases-echeance').hidden = !etat.lectureSeule;
  if (etat.lectureSeule) {
    $('bases-echeance').textContent = etat.echeance
      ? `Votre abonnement a pris fin. Vos bases restent consultables et exportables jusqu’au ${dateFr(etat.echeance)}, puis elles seront effacées. Vous pouvez aussi les supprimer dès maintenant.`
      : 'Votre abonnement a pris fin. Vos bases restent consultables et exportables, sans import ni modification. Vous pouvez les supprimer à tout moment.';
  }
  $('importer').disabled = etat.bases.length >= 3;
  $('importer').title = etat.bases.length >= 3 ? 'Trois bases au plus par compte.' : '';
  $('bases').innerHTML = etat.bases.map((b) => `
    <li><button type="button" class="v5-row" data-id="${esc(b.id)}">
      <span class="vp-bases__nom" data-i18n-skip>${esc(b.nom)}</span>
      <span class="vp-bases__meta">Lignes : ${esc(nb(b.lignes))} · mise à jour le ${esc(dateFr(b.maj_le))}</span>
    </button></li>`).join('');
}

$('bases').addEventListener('click', (e) => {
  const bouton = e.target.closest('button[data-id]');
  if (bouton) ouvrirBase(bouton.dataset.id);
});
$('importer').addEventListener('click', () => ouvrirImport({ demo: false, cible: null }));
$('essayer').addEventListener('click', () => ouvrirImport({ demo: true, cible: null }));

// ------------------------------------------------------------------ Une base
async function ouvrirBase(id, message) {
  const b = etat.bases.find((x) => x.id === id);
  if (!b) return afficherBases();
  etat.baseOuverte = b; etat.demo = false;
  montrer('v-base');
  $('v-espace').hidden = true;
  $('espace-demo').hidden = true; $('es-gestion').hidden = false;
  $('maj').hidden = etat.lectureSeule; $('renommer-form').hidden = etat.lectureSeule;
  $('base-retour').textContent = 'Mes bases';
  $('renommer-nom').value = b.nom;
  finConfirmation();
  $('base-barre').hidden = false;
  try {
    // Toute la base est chargée une fois : filtres, carte et frise répondent ensuite sans attendre.
    const entrees = await base.lireToutesLignes(etat.c, id, (lues) => {
      $('base-barre').firstElementChild.style.width = Math.round((lues / Math.max(1, b.lignes)) * 100) + '%';
      statut('base-statut', `Chargement : ${nb(lues)} lignes sur ${nb(b.lignes)}…`);
    });
    $('base-barre').hidden = true;
    statut('base-statut', message || (entrees.length ? '' : 'Cette base est vide. Mettez la à jour avec un fichier.'), message ? 'ok' : '');
    $('base-nom').textContent = b.nom;
    $('v-espace').hidden = false;
    // En lecture seule, pas d'accès en écriture : ni saisie, ni vues à enregistrer.
    await ouvrirEspace({ nom: b.nom, entrees, acces: etat.lectureSeule ? null : { c: etat.c, baseId: id } });
  } catch (e) {
    $('base-barre').hidden = true;
    statut('base-statut', base.messageErreur(e), 'err');
    console.error(e);
  }
}

// Démonstration : un jeu fictif passe par la même lecture qu'un vrai fichier, puis s'ouvre
// directement dans l'espace d'analyse. Rien n'est enregistré.
function ouvrirDemo(cle) {
  const jeu = demonstration(cle);
  const rapport = convertir(jeu.entetes, jeu.lignes, devinerRoles(jeu.entetes, jeu.lignes));
  etat.demo = true; etat.baseOuverte = null;
  montrer('v-base');
  $('espace-demo').hidden = false; $('es-gestion').hidden = true; $('maj').hidden = true;
  $('base-retour').textContent = 'Présentation';
  $('base-barre').hidden = true;
  statut('base-statut', '');
  $('base-nom').textContent = jeu.titre;
  $('v-espace').hidden = false;
  ouvrirEspace({ nom: jeu.titre, entrees: rapport.entrees, champ: jeu.champ });
  $('v-base').scrollIntoView({ block: 'start' });
}
for (const bouton of document.querySelectorAll('[data-demo]')) bouton.addEventListener('click', () => ouvrirDemo(bouton.dataset.demo));

$('renommer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nom = $('renommer-nom').value.trim().slice(0, 80);
  if (!nom) return;
  try {
    await base.renommerBase(etat.c, etat.baseOuverte.id, nom);
    etat.baseOuverte.nom = nom;
    $('base-nom').textContent = nom;
    statut('base-statut', 'Base renommée.', 'ok');
  } catch (err) { statut('base-statut', base.messageErreur(err), 'err'); }
});

$('maj').addEventListener('click', () => ouvrirImport({ demo: false, cible: etat.baseOuverte }));

// Suppression en deux clics : le premier demande confirmation, le second efface.
let confirmation = null;
function finConfirmation() {
  clearTimeout(confirmation); confirmation = null;
  $('supprimer').textContent = 'Supprimer la base';
}
$('supprimer').addEventListener('click', async () => {
  if (!confirmation) {
    $('supprimer').textContent = 'Confirmer la suppression définitive';
    confirmation = setTimeout(finConfirmation, 6000);
    return;
  }
  finConfirmation();
  $('supprimer').disabled = true;
  try {
    await base.supprimerBase(etat.c, etat.baseOuverte.id);
    await afficherBases('Base supprimée. Ses lignes ont été effacées.');
  } catch (err) { statut('base-statut', base.messageErreur(err), 'err'); }
  $('supprimer').disabled = false;
});

for (const bouton of document.querySelectorAll('[data-retour]')) {
  bouton.addEventListener('click', () => (etat.abonne || etat.lectureSeule ? afficherBases() : montrer('v-presentation')));
}

// -------------------------------------------------------- Import, étape 1 : fichier
function ouvrirImport({ demo, cible }) {
  etat.demo = demo; etat.cible = cible; etat.fichier = null; etat.rapport = null;
  montrer('v-import');
  $('demo-bandeau').hidden = !demo;
  $('info-hebergement').hidden = demo;
  $('import-retour').textContent = demo ? 'Présentation' : 'Mes bases';
  $('corr-precedent').hidden = demo && !ESSAI_LOCAL;
  $('fichier').value = '';
  $('cible-nom').value = '';
  statut('fichier-statut', '');
  statut('rapport-statut', '');
  if (demo && !ESSAI_LOCAL) return chargerTable(jeuFictif());   // la démonstration saute le dépôt
  etape(1);
}

const depot = $('depot');
depot.addEventListener('click', () => $('fichier').click());
depot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fichier').click(); } });
depot.addEventListener('dragover', (e) => { e.preventDefault(); depot.classList.add('is-survol'); });
depot.addEventListener('dragleave', () => depot.classList.remove('is-survol'));
depot.addEventListener('drop', (e) => {
  e.preventDefault(); depot.classList.remove('is-survol');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) surFichier(f);
});
$('fichier').addEventListener('change', () => { const f = $('fichier').files[0]; if (f) surFichier(f); });

async function surFichier(fichier) {
  depot.classList.add('is-occupe');
  statut('fichier-statut', 'Lecture du fichier…');
  try {
    const table = await lireFichier(fichier);
    statut('fichier-statut', '');
    chargerTable({ nom: fichier.name, ...table });
  } catch (e) {
    // ErreurLecture : message prévu pour le client. Autre erreur : message général.
    statut('fichier-statut', e instanceof ErreurLecture ? e.message : 'Ce fichier n’a pas pu être lu. Vérifiez son format, puis réessayez.', 'err');
    if (!(e instanceof ErreurLecture)) console.error(e);
  }
  depot.classList.remove('is-occupe');
}

function chargerTable(table) {
  etat.fichier = table;
  etat.roles = devinerRoles(table.entetes, table.lignes);
  // Mise à jour d'une base : on reprend la correspondance validée la dernière fois.
  const connus = etat.cible && etat.cible.colonnes && etat.cible.colonnes.roles;
  // Elle s'applique aux colonnes de même nom ; les autres gardent le rôle deviné.
  if (connus) {
    table.entetes.forEach((nom, c) => {
      if (!(nom in connus)) return;
      etat.roles = etat.roles.map((r) => (r === connus[nom] ? '' : r));   // un rôle, une seule colonne
      etat.roles[c] = connus[nom];
    });
  }
  rendreCorrespondance();
  etape(2);
}

// ------------------------------------------------ Import, étape 2 : correspondance
function rendreCorrespondance() {
  const { nom, entetes, lignes, notes } = etat.fichier;
  const reconnues = etat.roles.filter(Boolean).length;
  $('corr-resume').innerHTML = `<span data-i18n-skip>${esc(nom)}</span> · <span>Lignes lues : ${esc(nb(lignes.length))}. Colonnes : ${esc(String(entetes.length))}, dont reconnues automatiquement : ${esc(String(reconnues))}.</span>`;

  const options = (choisi) => '<option value="">Champ libre</option>'
    + ROLES.map((r) => `<option value="${r.cle}"${r.cle === choisi ? ' selected' : ''}>${esc(r.nom)}</option>`).join('');
  const tete = entetes.map((e, c) => `<th><span data-i18n-skip id="col-${c}" title="${esc(e)}">${esc(e)}</span><select data-c="${c}" class="${etat.roles[c] ? 'is-reconnu' : ''}" aria-labelledby="col-${c}">${options(etat.roles[c])}</select></th>`).join('');
  const corps = lignes.slice(0, 6).map((l) => '<tr>' + l.valeurs.map((v) => `<td title="${esc(v)}">${esc(String(v).slice(0, 120))}</td>`).join('') + '</tr>').join('');
  $('corr-table').innerHTML = `<thead><tr>${tete}</tr></thead><tbody data-i18n-skip>${corps}</tbody>`;
  $('corr-notes').innerHTML = notes.map((n) => `<li>${esc(n)}</li>`).join('');
}

// Un rôle ne peut être donné qu'à une seule colonne : le choisir ailleurs libère l'ancienne.
$('corr-table').addEventListener('change', (e) => {
  const select = e.target.closest('select[data-c]');
  if (!select) return;
  const c = Number(select.dataset.c);
  if (select.value) etat.roles = etat.roles.map((r, i) => (i !== c && r === select.value ? '' : r));
  etat.roles[c] = select.value;
  rendreCorrespondance();
});

$('corr-precedent').addEventListener('click', () => etape(1));
$('corr-suivant').addEventListener('click', () => {
  etat.rapport = convertir(etat.fichier.entetes, etat.fichier.lignes, etat.roles);
  $('geo-pays').checked = false;
  rendreRapport();
  etape(3);
});

// ------------------------------------------------------ Import, étape 3 : rapport
function rendreRapport() {
  const r = etat.rapport;
  const places = $('geo-pays').checked ? r.placables : 0;
  const kpi = (n, libelle) => `<div class="vp-kpi"><b>${esc(String(n))}</b><span>${esc(libelle)}</span></div>`;
  $('rapport-kpis').innerHTML = kpi(r.entrees.length, 'lignes prêtes')
    + kpi(r.entrees.length - r.sansCarte + places, 'sur la carte')
    + kpi(r.sansCarte - places, 'sans position')
    + kpi(r.sansDate, 'sans date')
    + kpi(r.doublons, 'doublons ignorés')
    + kpi(r.ecartees.length, 'lignes écartées')
    + kpi(r.aVerifier.length, 'valeurs à vérifier');

  $('geo-bloc').hidden = r.placables === 0;
  $('geo-pays-txt').textContent = `Placer au centre de leur pays les lignes sans coordonnées dont le pays est reconnu. Lignes concernées : ${nb(r.placables)}.`;

  liste('rapport-ecartees', r.ecartees, `Lignes écartées, non importées : ${nb(r.ecartees.length)}`);
  liste('rapport-averifier', r.aVerifier, `Valeurs à vérifier, lignes importées sans cette valeur : ${nb(r.aVerifier.length)}`);

  const maj = !!etat.cible;
  $('cible-nouvelle').hidden = maj;
  $('cible-maj').hidden = !maj;
  if (maj) $('cible-maj-nom').textContent = etat.cible.nom;
  else if (!$('cible-nom').value) $('cible-nom').value = etat.fichier.nom.replace(/\.[a-z0-9]+$/i, '').slice(0, 80);
  $('cible-bloc').hidden = etat.demo;
  $('enregistrer').disabled = r.entrees.length === 0;
  $('enregistrer').hidden = etat.demo;
  statut('rapport-statut', etat.demo ? 'Démonstration : rien n’est enregistré. Avec un compte abonné, ces lignes rejoindraient votre base.' : '');
}

function liste(id, elements, titre) {
  const bloc = $(id);
  bloc.hidden = elements.length === 0;
  bloc.querySelector('summary').textContent = titre;
  const vus = elements.slice(0, 300);
  bloc.querySelector('ul').innerHTML = vus.map((x) => `<li><b>Ligne ${esc(String(x.numero))}</b> <span>${esc(x.motif)}</span>${x.valeur ? ` <span data-i18n-skip>« ${esc(x.valeur)} »</span>` : ''}</li>`).join('')
    + (elements.length > vus.length ? `<li>Autres lignes non affichées : ${esc(nb(elements.length - vus.length))}.</li>` : '');
}

$('geo-pays').addEventListener('change', rendreRapport);
$('rapport-precedent').addEventListener('click', () => etape(2));

$('enregistrer').addEventListener('click', async () => {
  if (etat.demo) return;
  const r = etat.rapport;
  const nouvelle = !etat.cible;
  const nom = $('cible-nom').value.trim().slice(0, 80);
  if (nouvelle && !nom) return statut('rapport-statut', 'Donnez un nom à la base.', 'err');
  const mode = nouvelle ? 'nouvelle' : document.querySelector('input[name="mode"]:checked').value;

  // Copie des entrées : le placement au centre du pays ne touche pas au rapport affiché.
  const entrees = r.entrees.map((e) => ({ ...e }));
  if ($('geo-pays').checked) placerAuCentreDuPays(entrees);

  // Ce que l'on retient de la correspondance, pour la prochaine mise à jour.
  const colonnes = { roles: {}, libres: [] };
  etat.fichier.entetes.forEach((e, c) => { if (etat.roles[c]) colonnes.roles[e] = etat.roles[c]; else colonnes.libres.push(e); });

  const boutons = [$('enregistrer'), $('rapport-precedent')];
  boutons.forEach((b) => { b.disabled = true; });
  $('barre').hidden = false;
  const avancer = (faites, total) => {
    $('barre').firstElementChild.style.width = Math.round((faites / total) * 100) + '%';
    statut('rapport-statut', `Enregistrement : ${nb(faites)} lignes sur ${nb(total)}…`);
  };
  avancer(0, entrees.length);

  let baseId = nouvelle ? null : etat.cible.id;
  try {
    if (nouvelle) baseId = await base.creerBase(etat.c, nom, colonnes);
    else await base.enregistrerColonnes(etat.c, baseId, colonnes);
    let retirees = 0;
    if (mode === 'remplacer') {
      statut('rapport-statut', 'Retrait des lignes absentes du nouveau fichier…');
      retirees = await base.retirerLignesAbsentes(etat.c, baseId, new Set(entrees.map((e) => e.empreinte)));
    }
    const bilan = await base.envoyerLignes(etat.c, baseId, entrees, avancer);
    etat.bases = await base.listerBases(etat.c);
    const message = mode === 'remplacer'
      ? `Contenu remplacé. Lignes ajoutées : ${nb(bilan.ajoutees)}. Lignes retirées : ${nb(retirees)}. Lignes inchangées : ${nb(bilan.dejaPresentes)}.`
      : bilan.dejaPresentes
      ? `Lignes ajoutées : ${nb(bilan.ajoutees)}. Déjà présentes dans la base et ignorées : ${nb(bilan.dejaPresentes)}.`
      : `Lignes enregistrées : ${nb(bilan.ajoutees)}.`;
    $('cible-nom').value = '';
    ouvrirBase(baseId, message);
  } catch (e) {
    // Une base neuve restée incomplète est retirée : on ne laisse pas de demi-import.
    if (nouvelle && baseId) { try { await base.supprimerBase(etat.c, baseId); } catch (x) { /* déjà signalé plus bas */ } }
    const plafond = String(e && e.message).includes('PLAFOND');
    const suite = nouvelle ? ' Rien n’a été enregistré.'
      : plafond ? '' : ' L’import est incomplet : relancez le, les lignes déjà enregistrées seront reconnues.';
    statut('rapport-statut', base.messageErreur(e) + suite, 'err');
    if (!plafond) console.error(e);
  }
  $('barre').hidden = true;
  boutons.forEach((b) => { b.disabled = false; });
});

brancherEspace();
demarrer();
