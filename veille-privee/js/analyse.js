// Veille privée : les calculs de l'espace d'analyse. Aucun affichage ici, aucun appel réseau.
// Tout part d'une liste d'entrées (les lignes d'une base) et rend des comptages.
// Rien n'est « deviné » ni rédigé par une IA : ce sont des additions et des tris.

// Couleurs des valeurs les plus fréquentes : celles de la carte principale du site.
export const COULEURS = ['#d32f2f', '#1565c0', '#2e7d32', '#c49a3c', '#7b1fa2', '#ff9800'];
export const COULEUR_AUTRES = '#8A8B90';

const CHAMPS_FIXES = [
  { cle: 'categorie', nom: 'Catégorie' }, { cle: 'gravite', nom: 'Gravité' }, { cle: 'pays', nom: 'Pays' },
  { cle: 'source', nom: 'Source' }, { cle: 'lieu', nom: 'Lieu' }
];

// Valeur d'une entrée pour un champ. Un champ libre s'écrit « libre:Nom de la colonne ».
export function valeur(e, cle) {
  const v = cle.startsWith('libre:') ? (e.libres || {})[cle.slice(6)] : e[cle];
  return v == null || v === '' ? null : String(v);
}

// Les champs par lesquels on peut lire la base : ceux qui ont entre 2 et 60 valeurs différentes.
// Une colonne « Référence » avec une valeur par ligne ne sert à rien comme filtre : elle est écartée.
export function champsLisibles(entrees) {
  const candidats = CHAMPS_FIXES.slice();
  const libres = new Set();
  for (const e of entrees.slice(0, 2000)) for (const k of Object.keys(e.libres || {})) libres.add(k);
  for (const k of libres) candidats.push({ cle: 'libre:' + k, nom: k, libre: true });
  const lisibles = [];
  for (const c of candidats) {
    const vues = new Set();
    let remplies = 0;
    for (const e of entrees) { const v = valeur(e, c.cle); if (v !== null) { remplies++; if (vues.size <= 60) vues.add(v); } }
    if (vues.size >= 2 && vues.size <= 60 && remplies >= entrees.length * 0.2) lisibles.push({ ...c, valeurs: vues.size });
  }
  return lisibles;
}

// filtre = { recherche: 'texte', de: 'AAAA-MM-JJ' | null, a: 'AAAA-MM-JJ' | null, valeurs: { cle: Set } }
export function filtrer(entrees, filtre, sauf) {
  const mots = (filtre.recherche || '').toLowerCase().split(/\s+/).filter(Boolean);
  const criteres = Object.entries(filtre.valeurs || {}).filter(([cle, set]) => set.size && cle !== sauf);
  return entrees.filter((e) => {
    if (filtre.de && (!e.date_evt || e.date_evt < filtre.de)) return false;
    if (filtre.a && (!e.date_evt || e.date_evt > filtre.a)) return false;
    for (const [cle, set] of criteres) if (!set.has(valeur(e, cle) ?? '')) return false;
    if (mots.length) {
      const texte = (e._texte || (e._texte = [e.titre, e.description, e.lieu, e.pays, e.categorie, e.source, e.gravite, ...Object.values(e.libres || {})].join(' ').toLowerCase()));
      for (const m of mots) if (!texte.includes(m)) return false;
    }
    return true;
  });
}

// [{ v: 'Vol', n: 42 }, …] trié du plus fréquent au moins fréquent. v = '' pour « non renseigné ».
export function compter(entrees, cle) {
  const n = new Map();
  for (const e of entrees) { const v = valeur(e, cle) ?? ''; n.set(v, (n.get(v) || 0) + 1); }
  return [...n].map(([v, k]) => ({ v, n: k })).sort((a, b) => b.n - a.n || a.v.localeCompare(b.v, 'fr'));
}

// Associe une couleur aux six valeurs les plus fréquentes d'un champ. Les autres sont grises.
// Rend { rang: Map(valeur → 0..5), couleur(valeur), legende: [{ v, couleur, n }] }.
export function palette(entrees, cle) {
  const tri = compter(entrees, cle).filter((x) => x.v !== '');
  const rang = new Map(tri.slice(0, COULEURS.length).map((x, i) => [x.v, i]));
  return {
    rang,
    couleur: (v) => (rang.has(v) ? COULEURS[rang.get(v)] : COULEUR_AUTRES),
    legende: tri.slice(0, COULEURS.length).map((x, i) => ({ v: x.v, n: x.n, couleur: COULEURS[i] })),
    autres: tri.slice(COULEURS.length).reduce((s, x) => s + x.n, 0)
  };
}

// ----------------------------------------------------------------------- Temps
const jour = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoDe = (ms) => new Date(ms).toISOString().slice(0, 10);
export const ajouterJours = (iso, n) => isoDe(jour(iso) + n * 86400000);
export const ecartJours = (a, b) => Math.round((jour(b) - jour(a)) / 86400000);

export function bornes(entrees) {
  let min = null, max = null;
  for (const e of entrees) { const d = e.date_evt; if (!d) continue; if (!min || d < min) min = d; if (!max || d > max) max = d; }
  return { min, max };
}


// Découpe la période en tranches : jours jusqu'à 2 mois, semaines jusqu'à 14 mois, mois au delà.
// Rend { pas, tranches: [{ de, a, libelle, n, parts: Map(valeur → n) }] } comptées sur le champ donné.
export function frise(entrees, cle) {
  const { min, max } = bornes(entrees);
  if (!min) return { pas: null, tranches: [] };
  const duree = ecartJours(min, max);
  const pas = duree <= 62 ? 'jour' : duree <= 430 ? 'semaine' : 'mois';
  const tranches = [];
  if (pas === 'mois') {
    let a = +min.slice(0, 4), m = +min.slice(5, 7);
    while (`${a}-${String(m).padStart(2, '0')}` <= max.slice(0, 7)) {
      const de = `${a}-${String(m).padStart(2, '0')}-01`;
      const fin = isoDe(Date.UTC(a, m, 0));
      tranches.push({ de, a: fin, libelle: `${String(m).padStart(2, '0')}/${a}` });   // chiffres : lisible en français comme en anglais
      if (++m > 12) { m = 1; a++; }
    }
  } else {
    const largeur = pas === 'jour' ? 1 : 7;
    let de = min;
    if (pas === 'semaine') de = ajouterJours(min, -((new Date(jour(min)).getUTCDay() + 6) % 7));   // lundi
    while (de <= max) {
      const fin = ajouterJours(de, largeur - 1);
      tranches.push({ de, a: fin, libelle: `${de.slice(8, 10)}/${de.slice(5, 7)}/${de.slice(0, 4)}` });
      de = ajouterJours(de, largeur);
    }
  }
  for (const t of tranches) { t.n = 0; t.parts = new Map(); }
  for (const e of entrees) {
    if (!e.date_evt) continue;
    // Les tranches sont triées : recherche par dichotomie.
    let g = 0, d = tranches.length - 1;
    while (g < d) { const m = (g + d) >> 1; if (tranches[m].a < e.date_evt) g = m + 1; else d = m; }
    const t = tranches[g];
    const v = valeur(e, cle) ?? '';
    t.n++; t.parts.set(v, (t.parts.get(v) || 0) + 1);
  }
  return { pas, tranches };
}

// ------------------------------------------------------------------ Croisement
// Tableau à deux entrées : combien d'entrées pour chaque couple (ligne, colonne).
// Ex. lignes = concurrents, colonnes = pays → qui est présent où.
// colonnes = 'mois' croise avec le temps. Rend { lignes, colonnes, cases, max }.
export function croiser(entrees, cleLignes, cleColonnes, maxLignes = 8, maxColonnes = 10) {
  const col = (e) => (cleColonnes === 'mois' ? (e.date_evt ? e.date_evt.slice(0, 7) : null) : valeur(e, cleColonnes));
  const totLignes = new Map(), totCol = new Map(), cases = new Map();
  for (const e of entrees) {
    const l = valeur(e, cleLignes), c = col(e);
    if (l === null || c === null) continue;
    totLignes.set(l, (totLignes.get(l) || 0) + 1);
    totCol.set(c, (totCol.get(c) || 0) + 1);
    const k = l + '\u0000' + c;
    cases.set(k, (cases.get(k) || 0) + 1);
  }
  const lignes = [...totLignes].sort((a, b) => b[1] - a[1]).slice(0, maxLignes).map(([v, n]) => ({ v, n }));
  let colonnes;
  if (cleColonnes === 'mois') {
    // Les derniers mois, dans l'ordre du calendrier.
    colonnes = [...totCol].sort((a, b) => a[0].localeCompare(b[0])).slice(-maxColonnes)
      .map(([v, n]) => ({ v, n, libelle: `${v.slice(5, 7)}/${v.slice(0, 4)}` }));
  } else {
    colonnes = [...totCol].sort((a, b) => b[1] - a[1]).slice(0, maxColonnes).map(([v, n]) => ({ v, n, libelle: v }));
  }
  let max = 0;
  for (const l of lignes) for (const c of colonnes) max = Math.max(max, cases.get(l.v + '\u0000' + c.v) || 0);
  return { lignes, colonnes, max, n: (l, c) => cases.get(l + '\u0000' + c) || 0 };
}

// ------------------------------------------------------------- Faits à retenir
// Quelques constats chiffrés, calculés. Chaque fait = { chiffre, texte, valeur? }.
// « valeur » est un mot du fichier du client : l'affichage doit l'échapper.
export function faits(entrees, cle) {
  const liste = [];
  if (!entrees.length) return liste;
  const total = entrees.length;

  const tri = compter(entrees, cle).filter((x) => x.v !== '');
  if (tri.length > 1) {
    const part = Math.round((tri[0].n / total) * 100);
    liste.push({ chiffre: part + ' %', texte: 'des entrées pour', valeur: tri[0].v });
  }

  const pays = compter(entrees, 'pays').filter((x) => x.v !== '');
  if (pays.length > 3) {
    const trois = pays.slice(0, 3);
    const part = Math.round((trois.reduce((s, x) => s + x.n, 0) / total) * 100);
    liste.push({ chiffre: part + ' %', texte: 'des entrées dans trois pays', valeur: trois.map((x) => x.v).join(', ') });
  } else if (pays.length === 1) {
    const lieux = compter(entrees, 'lieu').filter((x) => x.v !== '');
    if (lieux.length > 1) liste.push({ chiffre: Math.round((lieux[0].n / total) * 100) + ' %', texte: 'des entrées dans une seule localité', valeur: lieux[0].v });
  }

  const parMois = new Map();
  for (const e of entrees) if (e.date_evt) parMois.set(e.date_evt.slice(0, 7), (parMois.get(e.date_evt.slice(0, 7)) || 0) + 1);
  if (parMois.size > 2) {
    const [mois, n] = [...parMois].sort((a, b) => b[1] - a[1])[0];
    liste.push({ chiffre: String(n), texte: 'entrées pendant le mois le plus chargé,', valeur: `${mois.slice(5, 7)}/${mois.slice(0, 4)}` });
  }

  const sansPosition = entrees.filter((e) => e.lat == null).length;
  if (sansPosition) liste.push({ chiffre: String(sansPosition), texte: sansPosition > 1 ? 'entrées sans position, absentes de la carte' : 'entrée sans position, absente de la carte' });
  return liste;
}

// Évolution entre la période affichée et la période de même durée qui la précède.
// Rend { avant, apres, pourcent } ou null si la comparaison n'a pas de sens.
export function evolution(toutes, filtre) {
  if (!filtre.de || !filtre.a) return null;
  const duree = ecartJours(filtre.de, filtre.a) + 1;
  const precedent = { ...filtre, de: ajouterJours(filtre.de, -duree), a: ajouterJours(filtre.de, -1) };
  const avant = filtrer(toutes, precedent).length, apres = filtrer(toutes, filtre).length;
  if (!avant) return null;
  return { avant, apres, jours: duree, pourcent: Math.round(((apres - avant) / avant) * 100) };
}

// ------------------------------------------------------------------ Tendances
// Pour chaque valeur d'un champ, sa courbe dans le temps : la période des entrées est coupée
// en « cases » tranches égales et on compte les entrées de chaque tranche.
// Rend Map(valeur → [n0, n1, …]). Sert aux petites courbes à côté des barres.
export function tendances(entrees, cle, cases = 14) {
  const { min, max } = bornes(entrees);
  const courbes = new Map();
  if (!min || min === max) return courbes;
  const debut = jour(min), duree = jour(max) - debut;
  for (const e of entrees) {
    if (!e.date_evt) continue;
    const v = valeur(e, cle) ?? '';
    let c = courbes.get(v);
    if (!c) courbes.set(v, (c = new Array(cases).fill(0)));
    c[Math.min(cases - 1, Math.floor(((jour(e.date_evt) - debut) / duree) * cases))]++;
  }
  return courbes;
}

// --------------------------------------------------------- Tableau de bord
// Entrées par jour de la semaine, du lundi au dimanche.
export function rythmeSemaine(entrees) {
  const jours = [0, 0, 0, 0, 0, 0, 0];
  for (const e of entrees) if (e.date_evt) jours[(new Date(jour(e.date_evt)).getUTCDay() + 6) % 7]++;
  return jours;
}

// Calendrier : une case par jour sur les dernières semaines de la sélection (53 au plus).
// Rend { semaines: [[n lundi … n dimanche], …], debut, fin, max }. Une case hors période vaut null.
export function calendrier(entrees, maxSemaines = 53) {
  const { min, max } = bornes(entrees);
  if (!min) return null;
  const lundi = (iso) => ajouterJours(iso, -((new Date(jour(iso)).getUTCDay() + 6) % 7));
  const fin = max;
  let debut = lundi(min);
  if (ecartJours(debut, fin) > maxSemaines * 7 - 1) debut = lundi(ajouterJours(fin, -(maxSemaines * 7 - 7)));
  const parJour = new Map();
  for (const e of entrees) if (e.date_evt && e.date_evt >= debut) parJour.set(e.date_evt, (parJour.get(e.date_evt) || 0) + 1);
  const semaines = [];
  let sommet = 0;
  for (let d = debut; d <= fin; d = ajouterJours(d, 7)) {
    const semaine = [];
    for (let k = 0; k < 7; k++) {
      const j = ajouterJours(d, k);
      const n = j > fin || j < min ? null : (parJour.get(j) || 0);
      if (n) sommet = Math.max(sommet, n);
      semaine.push({ jour: j, n });
    }
    semaines.push(semaine);
  }
  return { semaines, debut, fin, max: sommet };
}

// Ce qui monte, ce qui baisse : pour chaque valeur d'un champ, le nombre d'entrées dans la première
// moitié de la période et dans la seconde. Rend [{ v, avant, apres, ecart }] trié du plus en hausse au plus en baisse.
export function mouvements(entrees, cle) {
  const { min, max } = bornes(entrees);
  if (!min || min === max) return [];
  const milieu = ajouterJours(min, Math.floor(ecartJours(min, max) / 2));
  const m = new Map();
  for (const e of entrees) {
    if (!e.date_evt) continue;
    const v = valeur(e, cle) ?? '';
    let x = m.get(v);
    if (!x) m.set(v, (x = { v, avant: 0, apres: 0 }));
    if (e.date_evt <= milieu) x.avant++; else x.apres++;
  }
  return [...m.values()].map((x) => ({ ...x, ecart: x.apres - x.avant })).sort((a, b) => b.ecart - a.ecart);
}
