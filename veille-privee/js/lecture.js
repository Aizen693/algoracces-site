// Veille privée : lire un fichier (CSV, Excel, JSON, GeoJSON) DANS LE NAVIGATEUR.
// Rien n'est envoyé ici. On rend toujours la même forme, quel que soit le format :
//   { entetes: ['Titre', 'Date', …], lignes: [['…', '…'], …], notes: ['…'] }
// Chaque ligne est un tableau de valeurs brutes (texte ou nombre), dans l'ordre des en-têtes.

export const PLAFOND_OCTETS = 10 * 1024 * 1024;   // 10 Mo
export const PLAFOND_LIGNES = 20000;

// Lecteur Excel SheetJS 0.20.3 (licence Apache 2.0), copié dans ce dossier le 17/11/2026 depuis cdn.sheetjs.com :
// la page ne dépend d'aucun serveur tiers au moment où le client dépose son fichier.
const SHEETJS = '/veille-privee/vendor/xlsx.full.min.js?v=0.20.3';

// Une erreur dont le message peut être montré tel quel au client.
export class ErreurLecture extends Error {}

export async function lireFichier(fichier) {
  if (fichier.size > PLAFOND_OCTETS) {
    throw new ErreurLecture('Ce fichier dépasse 10 Mo. Réduisez la période ou scindez le fichier, puis réessayez.');
  }
  if (fichier.size === 0) throw new ErreurLecture('Ce fichier est vide.');

  const extension = fichier.name.toLowerCase().split('.').pop();
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let table;
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') table = lireCsv(decoder(octets));
  else if (extension === 'xlsx' || extension === 'xls') table = await lireExcel(octets);
  else if (extension === 'json' || extension === 'geojson') table = lireJson(decoder(octets));
  else throw new ErreurLecture('Format non reconnu. Formats acceptés : CSV, Excel (XLSX), JSON et GeoJSON.');

  return nettoyer(table);
}

// --- Texte -------------------------------------------------------------------
// Un export Excel français est souvent en Windows-1252 et non en UTF-8.
// On essaie UTF-8 de façon stricte ; s'il y a une erreur, c'est du Windows-1252.
function decoder(octets) {
  let texte;
  try { texte = new TextDecoder('utf-8', { fatal: true }).decode(octets); }
  catch (e) { texte = new TextDecoder('windows-1252').decode(octets); }
  return texte.replace(/^﻿/, ''); // marque d'ordre des octets en tête de fichier
}

// --- CSV ---------------------------------------------------------------------
function lireCsv(texte) {
  const separateur = devinerSeparateur(texte);
  const lignes = [];
  let ligne = [], champ = '', entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }   // "" = un guillemet
      else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"' && champ === '') entreGuillemets = true;
    else if (c === separateur) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return { lignes, notes: [] };
}

// Le séparateur est celui qui revient le plus dans la première ligne, hors guillemets.
function devinerSeparateur(texte) {
  const premiere = texte.slice(0, texte.search(/\r|\n/) === -1 ? 5000 : texte.search(/\r|\n/));
  const sansGuillemets = premiere.replace(/"[^"]*"/g, '');
  let meilleur = ',', max = 0;
  for (const s of [';', ',', '\t', '|']) {
    const n = sansGuillemets.split(s).length - 1;
    if (n > max) { max = n; meilleur = s; }
  }
  return meilleur;
}

// --- Excel -------------------------------------------------------------------
// La bibliothèque n'est chargée que si le client dépose un fichier Excel.
function chargerSheetJs() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, echec) => {
    const s = document.createElement('script');
    s.src = SHEETJS;
    s.onload = ok;
    s.onerror = () => echec(new ErreurLecture('Le lecteur Excel n’a pas pu être chargé. Vérifiez votre connexion, ou enregistrez le fichier en CSV.'));
    document.head.appendChild(s);
  });
}

async function lireExcel(octets) {
  await chargerSheetJs();
  let classeur;
  try { classeur = window.XLSX.read(octets, { type: 'array' }); }
  catch (e) { throw new ErreurLecture('Ce fichier Excel est illisible. Ouvrez-le dans votre tableur et enregistrez-le de nouveau.'); }
  const noms = classeur.SheetNames || [];
  if (!noms.length) throw new ErreurLecture('Ce classeur ne contient aucune feuille.');
  // raw: true → les dates restent des numéros de série Excel, convertis ensuite sans ambiguïté.
  const lignes = window.XLSX.utils.sheet_to_json(classeur.Sheets[noms[0]], { header: 1, raw: true, defval: '' });
  const notes = noms.length > 1 ? [`Le classeur a ${noms.length} feuilles : seule la première est lue.`] : [];
  return { lignes, notes };
}

// --- JSON et GeoJSON ---------------------------------------------------------
function lireJson(texte) {
  let donnees;
  try { donnees = JSON.parse(texte); }
  catch (e) { throw new ErreurLecture('Ce fichier JSON est mal formé.'); }

  let objets, notes = [];
  if (donnees && donnees.type === 'FeatureCollection' && Array.isArray(donnees.features)) {
    // GeoJSON : les propriétés deviennent des colonnes, le point devient latitude et longitude.
    let sansPoint = 0;
    objets = donnees.features.map((f) => {
      const o = { ...(f && f.properties) };
      const g = f && f.geometry;
      if (g && g.type === 'Point' && Array.isArray(g.coordinates)) { o.longitude = g.coordinates[0]; o.latitude = g.coordinates[1]; }
      else sansPoint++;
      return o;
    });
    if (sansPoint) notes.push(`Éléments du GeoJSON qui ne sont pas des points, importés sans coordonnées : ${sansPoint}.`);
  } else if (Array.isArray(donnees)) objets = donnees;
  else if (donnees && typeof donnees === 'object') {
    // { "items": [ … ] } ou { "data": [ … ] } : on prend le premier tableau trouvé.
    objets = Object.values(donnees).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
  }
  if (!Array.isArray(objets) || !objets.length) throw new ErreurLecture('Ce fichier JSON ne contient pas de liste d’éléments.');

  // Les colonnes sont l'union des clés rencontrées, dans leur ordre d'apparition.
  const entetes = [];
  const vues = new Set();
  for (const o of objets) if (o && typeof o === 'object') for (const k of Object.keys(o)) if (!vues.has(k)) { vues.add(k); entetes.push(k); }
  const lignes = [entetes];
  for (const o of objets) {
    if (!o || typeof o !== 'object') continue;
    lignes.push(entetes.map((k) => {
      const v = o[k];
      if (v == null) return '';
      return typeof v === 'object' ? JSON.stringify(v) : v;   // objet imbriqué : gardé en texte
    }));
  }
  return { lignes, notes };
}

// --- Mise en forme commune ---------------------------------------------------
// Première ligne = en-têtes. On retire les lignes entièrement vides et on plafonne.
function nettoyer({ lignes, notes }) {
  const estVide = (l) => l.every((v) => String(v ?? '').trim() === '');
  while (lignes.length && estVide(lignes[0])) lignes.shift();   // lignes vides avant les en-têtes
  if (lignes.length < 2) throw new ErreurLecture('Ce fichier ne contient aucune ligne de données sous la ligne d’en-têtes.');

  const largeur = Math.max(...lignes.slice(0, 200).map((l) => l.length));
  const vus = new Map();
  const entetes = [];
  for (let i = 0; i < largeur; i++) {
    let nom = String(lignes[0][i] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || `Colonne ${i + 1}`;
    const deja = vus.get(nom) || 0;                    // deux colonnes du même nom : « Date », « Date (2) »
    vus.set(nom, deja + 1);
    if (deja) nom = `${nom} (${deja + 1})`;
    entetes.push(nom);
  }

  const corps = [];
  let vides = 0;
  for (let i = 1; i < lignes.length; i++) {
    if (estVide(lignes[i])) { vides++; continue; }
    // numero = numéro de la ligne dans le fichier d'origine, pour le rapport d'import
    corps.push({ numero: i + 1, valeurs: entetes.map((_, c) => lignes[i][c] ?? '') });
  }
  if (!corps.length) throw new ErreurLecture('Ce fichier ne contient aucune ligne de données.');
  if (corps.length > PLAFOND_LIGNES) {
    throw new ErreurLecture(`Ce fichier contient ${corps.length.toLocaleString('fr-FR')} lignes. Le plafond est de 20 000 lignes par base : réduisez la période ou scindez le fichier.`);
  }
  if (vides) notes.push(`Lignes entièrement vides ignorées : ${vides}.`);

  // Une colonne sans en-tête et sans aucune valeur n'apporte rien : on la retire.
  const utiles = entetes.map((nom, c) => !/^Colonne \d+$/.test(nom) || corps.some((l) => String(l.valeurs[c]).trim() !== ''));
  return {
    entetes: entetes.filter((_, c) => utiles[c]),
    lignes: corps.map((l) => ({ numero: l.numero, valeurs: l.valeurs.filter((_, c) => utiles[c]) })),
    notes
  };
}
