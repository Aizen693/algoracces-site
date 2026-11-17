// Veille privée : comprendre le fichier.
//   1. deviner le rôle de chaque colonne (titre, date, lieu…)
//   2. convertir chaque ligne en une entrée propre, en tolérant les données réelles
//   3. dresser le rapport d'import (lignes écartées, valeurs à vérifier, doublons)
// Rien n'est envoyé ici : tout se passe dans le navigateur.

import { simplifier, trouverPays } from './pays.js?v=20261117k';

// Les rôles qu'une colonne peut jouer. L'ordre est celui de l'écran de correspondance.
export const ROLES = [
  { cle: 'titre', nom: 'Titre', mots: ['titre', 'intitule', 'title', 'objet', 'evenement', 'event', 'libelle', 'nom', 'name', 'sujet', 'headline'] },
  { cle: 'date', nom: 'Date', mots: ['date', 'jour', 'day', 'quand', 'when', 'horodatage', 'timestamp'] },
  { cle: 'lieu', nom: 'Lieu', mots: ['lieu', 'ville', 'localite', 'city', 'location', 'place', 'commune', 'site', 'adresse', 'address', 'town'] },
  { cle: 'pays', nom: 'Pays', mots: ['pays', 'country', 'etat', 'nation'] },
  { cle: 'lat', nom: 'Latitude', mots: ['latitude', 'lat', 'y'] },
  { cle: 'lon', nom: 'Longitude', mots: ['longitude', 'long', 'lon', 'lng', 'x'] },
  { cle: 'categorie', nom: 'Catégorie', mots: ['categorie', 'category', 'type', 'typologie', 'nature', 'classe', 'theme', 'action'] },
  { cle: 'gravite', nom: 'Gravité', mots: ['gravite', 'niveau', 'severite', 'severity', 'criticite', 'priorite', 'priority', 'level', 'risque'] },
  { cle: 'source', nom: 'Source', mots: ['source', 'origine', 'auteur', 'author', 'emetteur', 'media'] },
  { cle: 'url', nom: 'Lien', mots: ['url', 'lien', 'link', 'href', 'adresse web', 'site web'] },
  { cle: 'description', nom: 'Description', mots: ['description', 'detail', 'details', 'commentaire', 'comment', 'resume', 'summary', 'texte', 'contenu', 'notes', 'note', 'observation'] }
];

// ------------------------------------------------------------------ 1. Rôles
// Rend un tableau de la taille des en-têtes : la clé du rôle, ou '' (champ libre).
export function devinerRoles(entetes, lignes) {
  const echantillon = lignes.slice(0, 200);
  const colonne = (c) => echantillon.map((l) => l.valeurs[c]).filter((v) => String(v).trim() !== '');
  const part = (valeurs, test) => (valeurs.length ? valeurs.filter(test).length / valeurs.length : 0);

  // Une note par couple (colonne, rôle) : le nom de la colonne d'abord, son contenu ensuite.
  const notes = [];
  entetes.forEach((entete, c) => {
    const nom = simplifier(entete);
    const mots = nom.split(' ');
    const valeurs = colonne(c);
    for (const role of ROLES) {
      let note = 0;
      for (const mot of role.mots) {
        if (nom === mot) note = Math.max(note, 10);
        else if (mots.includes(mot)) note = Math.max(note, 6);          // « Date du fait »
        else if (mot.length > 3 && nom.includes(mot)) note = Math.max(note, 3);
      }
      // Le contenu confirme ou contredit le nom.
      if (role.cle === 'date') note += part(valeurs, (v) => lireDate(v) !== null) > 0.6 ? 4 : (note ? -5 : 0);
      if (role.cle === 'lat') note += part(valeurs, (v) => bornes(lireNombre(v), 90)) > 0.8 ? 2 : (note ? -8 : 0);
      if (role.cle === 'lon') note += part(valeurs, (v) => bornes(lireNombre(v), 180)) > 0.8 ? 2 : (note ? -8 : 0);
      if (role.cle === 'url') note += part(valeurs, (v) => /^https?:\/\//i.test(String(v).trim())) > 0.6 ? 8 : 0;
      if (role.cle === 'pays') note += part(valeurs, (v) => trouverPays(v) !== null) > 0.6 ? 5 : 0;
      if (note >= 6 || (note >= 4 && role.cle !== 'titre')) notes.push({ c, role: role.cle, note });
    }
  });

  // On attribue en partant des meilleures notes : un rôle par colonne, une colonne par rôle.
  const roles = entetes.map(() => '');
  const pris = new Set();
  for (const n of notes.sort((a, b) => b.note - a.note || a.c - b.c)) {
    if (roles[n.c] || pris.has(n.role)) continue;
    roles[n.c] = n.role;
    pris.add(n.role);
  }
  return roles;
}

const bornes = (n, max) => n !== null && n >= -max && n <= max;

// ----------------------------------------------------------- 2. Valeurs brutes
// « 4,05 », « 4.05 », « 4,05° », 4.05 → 4.05 ; tout le reste → null
export function lireNombre(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v ?? '').trim().replace(/[\s  °]/g, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const MOIS = {
  janvier: 1, janv: 1, jan: 1, january: 1, fevrier: 2, fevr: 2, fev: 2, february: 2, feb: 2,
  mars: 3, mar: 3, march: 3, avril: 4, avr: 4, april: 4, apr: 4, mai: 5, may: 5,
  juin: 6, june: 6, jun: 6, juillet: 7, juil: 7, july: 7, jul: 7, aout: 8, august: 8, aug: 8,
  septembre: 9, sept: 9, sep: 9, september: 9, octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11, decembre: 12, dec: 12, december: 12
};

// Rend une date au format AAAA-MM-JJ, ou null si la valeur n'est pas une date.
// Comprend : 2026-03-12, 2026-03-12T08:30, 12/03/2026, 12-03-26, 12.03.2026,
// « 12 mars 2026 », « March 12, 2026 » et le numéro de série Excel (46093).
export function lireDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number') {
    // Numéro de série Excel : nombre de jours depuis le 30/12/1899. On ne retient que 1954 à 2119.
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Math.round((Math.floor(v) - 25569) * 86400000));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t)) return lireDate(Number(t));          // numéro de série écrit en texte

  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);    // année en tête
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s].*)?$/);  // jour en tête, à la française
  if (m) {
    let jour = +m[1], mois = +m[2];
    const annee = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (mois > 12 && jour <= 12) [jour, mois] = [mois, jour];           // 03/25/2026 ne peut être qu'américain
    return iso(annee, mois, jour);
  }

  const s = simplifier(t);
  m = s.match(/^(?:[a-z]+ )?(\d{1,2})(?:er)? ([a-z]+) (\d{4})\b/);       // 12 mars 2026, lundi 12 mars 2026
  if (m && MOIS[m[2]]) return iso(+m[3], MOIS[m[2]], +m[1]);
  m = s.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)? (\d{4})\b/);          // March 12, 2026
  if (m && MOIS[m[1]]) return iso(+m[3], MOIS[m[1]], +m[2]);
  return null;
}

// Vérifie que la date existe vraiment (pas de 31 février) et qu'elle est plausible.
function iso(annee, mois, jour) {
  if (annee < 1900 || annee > 2100 || mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

// Texte propre : espaces resserrés, longueur plafonnée. '' devient null.
function texte(v, max) {
  const t = String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t ]+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

// Empreinte courte et rapide d'un texte (53 bits, écrite en base 36).
// Elle ne protège rien : elle sert seulement à reconnaître deux lignes identiques.
function empreinte(t) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(11, '0');
}

// Empreinte du contenu d'une entrée. Deux entrées de même contenu ont la même empreinte.
export function empreinteDe(e) {
  return empreinte(JSON.stringify([e.titre, e.date_evt, e.lieu, e.pays, e.lat, e.lon, e.categorie, e.source, e.url, e.description, e.gravite, e.libres]));
}

// ------------------------------------------------------------- 3. Conversion
// entetes : noms des colonnes ; lignes : [{ numero, valeurs }] ; roles : rôle de chaque colonne.
// Rend { entrees, ecartees, aVerifier, doublons, sansCarte, sansDate, placables }.
export function convertir(entetes, lignes, roles) {
  const colonneDe = {};                                  // rôle → numéro de colonne
  roles.forEach((r, c) => { if (r) colonneDe[r] = c; });
  const libres = entetes.map((nom, c) => (roles[c] ? null : nom));   // colonnes gardées en champs libres

  const entrees = [], ecartees = [], aVerifier = [];
  const dejaVues = new Set();
  let doublons = 0;

  for (const ligne of lignes) {
    const brut = (role) => (role in colonneDe ? ligne.valeurs[colonneDe[role]] : '');
    const rempli = (role) => String(brut(role) ?? '').trim() !== '';
    // motif : phrase fixe (traduisible). valeur : ce que contenait le fichier (jamais traduit, toujours échappé).
    const signaler = (motif, valeur) => aVerifier.push({ numero: ligne.numero, motif, valeur: valeur ? String(valeur).slice(0, 60) : '' });

    const e = {
      titre: texte(brut('titre'), 500), date_evt: null, lieu: texte(brut('lieu'), 300), pays: texte(brut('pays'), 120),
      lat: null, lon: null, precision_geo: null, categorie: texte(brut('categorie'), 200),
      source: texte(brut('source'), 300), url: null, description: texte(brut('description'), 10000),
      gravite: texte(brut('gravite'), 100), libres: {}
    };

    // Date : illisible → la ligne est gardée, sans date (absente de la frise).
    if (rempli('date')) {
      e.date_evt = lireDate(brut('date'));
      if (!e.date_evt) signaler('Date illisible. Ligne importée sans date.', brut('date'));
    }

    // Coordonnées : il faut les deux, et dans les bornes. Sinon la ligne reste hors carte.
    if (rempli('lat') || rempli('lon')) {
      const lat = lireNombre(brut('lat')), lon = lireNombre(brut('lon'));
      if (bornes(lat, 90) && bornes(lon, 180) && !(lat === 0 && lon === 0)) { e.lat = lat; e.lon = lon; e.precision_geo = 'fichier'; }
      else signaler('Coordonnées inutilisables. Ligne importée sans position.', `${String(brut('lat')).slice(0, 25)} ; ${String(brut('lon')).slice(0, 25)}`);
    }

    // Lien : seules les adresses http et https sont gardées (jamais javascript: ni data:).
    if (rempli('url')) {
      const u = String(brut('url')).trim();
      if (/^https?:\/\/[^\s]+$/i.test(u) && u.length <= 2000) e.url = u;
      else signaler('Lien écarté : ce n’est pas une adresse web en http ou https.', u);
    }

    // Champs libres : toute colonne non reconnue, gardée telle quelle (texte, 500 caractères au plus).
    libres.forEach((nom, c) => {
      if (nom === null) return;
      const v = texte(ligne.valeurs[c], 500);
      if (v !== null) e.libres[nom] = v;
    });

    // Une ligne sans aucun contenu reconnu ne peut pas servir : elle est écartée.
    const aDuContenu = e.titre || e.description || e.date_evt || e.lieu || e.pays || e.lat !== null || e.categorie;
    if (!aDuContenu && !Object.keys(e.libres).length) { ecartees.push({ numero: ligne.numero, motif: 'Aucune valeur exploitable dans cette ligne.' }); continue; }
    if (!aDuContenu) { ecartees.push({ numero: ligne.numero, motif: 'Aucune des colonnes reconnues n’est remplie (titre, date, lieu, pays, catégorie, description).' }); continue; }

    // Titre de secours, pour que la ligne soit toujours lisible dans le tableau.
    if (!e.titre) e.titre = (e.description || [e.categorie, e.lieu || e.pays].filter(Boolean).join(', ') || 'Sans titre').slice(0, 120);

    // Doublon : même contenu qu'une ligne déjà lue dans ce fichier.
    e.empreinte = empreinteDe(e);
    if (dejaVues.has(e.empreinte)) { doublons++; continue; }
    dejaVues.add(e.empreinte);
    entrees.push(e);
  }

  const sansCarte = entrees.filter((e) => e.lat === null);
  return {
    entrees, ecartees, aVerifier, doublons,
    sansCarte: sansCarte.length,
    sansDate: entrees.filter((e) => !e.date_evt).length,
    // Lignes sans coordonnées dont le pays est reconnu : on peut proposer le centre du pays.
    placables: sansCarte.filter((e) => trouverPays(e.pays) || trouverPays(e.lieu)).length
  };
}

// Pose au centre de leur pays les entrées sans coordonnées. Rend le nombre d'entrées placées.
// Calcul local : aucun nom de lieu ne quitte le navigateur.
export function placerAuCentreDuPays(entrees) {
  let n = 0;
  for (const e of entrees) {
    if (e.lat !== null) continue;
    const pays = trouverPays(e.pays) || trouverPays(e.lieu);
    if (!pays) continue;
    e.lat = pays.lat; e.lon = pays.lon; e.precision_geo = 'pays';
    if (!e.pays) e.pays = pays.nom;
    n++;
  }
  return n;
}
