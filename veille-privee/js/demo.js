// Veille privée : jeu de données FICTIF de la démonstration (visiteur ou compte sans abonnement).
// Tout est inventé et fabriqué dans le navigateur : entreprise, sites, faits.
// Quelques lignes sont volontairement abîmées pour montrer le rapport d'import.
// La forme rendue est exactement celle de lireFichier() dans lecture.js.

const VILLES = [
  ['Lagos', 'Nigeria', 6.455, 3.394], ['Accra', 'Ghana', 5.604, -0.187], ['Abidjan', 'Côte d\'Ivoire', 5.36, -4.008],
  ['Nairobi', 'Kenya', -1.292, 36.822], ['Le Caire', 'Égypte', 30.044, 31.236], ['Casablanca', 'Maroc', 33.573, -7.59],
  ['Istanbul', 'Turquie', 41.008, 28.978], ['Karachi', 'Pakistan', 24.861, 67.001], ['Jakarta', 'Indonésie', -6.209, 106.846],
  ['Bogotá', 'Colombie', 4.711, -74.072], ['Lima', 'Pérou', -12.046, -77.043], ['Mexico', 'Mexique', 19.433, -99.133]
];
const TYPES = ['Vol', 'Intrusion', 'Manifestation', 'Blocage routier', 'Fraude', 'Menace'];
const NIVEAUX = ['Faible', 'Moyenne', 'Élevée'];
const FAITS = {
  'Vol': 'Vol de matériel signalé sur le site de',
  'Intrusion': 'Tentative d’intrusion de nuit sur le site de',
  'Manifestation': 'Rassemblement devant le site de',
  'Blocage routier': 'Axe d’accès bloqué près du site de',
  'Fraude': 'Soupçon de fraude documentaire au site de',
  'Menace': 'Message de menace reçu par le site de'
};

export function jeuFictif() {
  const entetes = ['Intitulé', 'Date du fait', 'Localité', 'Pays', 'Lat', 'Long', 'Type', 'Niveau', 'Responsable'];
  const lignes = [];
  for (let i = 0; i < 60; i++) {
    const [ville, pays, lat, lon] = VILLES[i % VILLES.length];
    const type = TYPES[(i * 5) % TYPES.length];
    const jour = String(1 + (i * 7) % 28).padStart(2, '0');
    const mois = String(1 + (i * 3) % 12).padStart(2, '0');
    // Dates écrites de trois façons, coordonnées avec virgule décimale : comme dans un vrai export.
    let date = i % 3 === 0 ? `2026-${mois}-${jour}` : i % 3 === 1 ? `${jour}/${mois}/2026` : `${jour}.${mois}.2026`;
    let la = String((lat + (i % 7) * 0.006).toFixed(4)).replace('.', ',');
    let lo = String((lon - (i % 5) * 0.006).toFixed(4)).replace('.', ',');
    if (i === 7) date = 'à préciser';              // date illisible
    if (i === 19) { la = ''; lo = ''; }            // sans coordonnées : le pays reste connu
    if (i === 31) { la = '123,4'; }                // latitude impossible
    lignes.push({ numero: i + 2, valeurs: [`${FAITS[type]} ${ville}`, date, ville, pays, la, lo, type, NIVEAUX[i % 3], `Référent ${1 + (i % 4)}`] });
  }
  lignes.push({ numero: 62, valeurs: lignes[3].valeurs.slice() });     // doublon exact
  lignes.push({ numero: 63, valeurs: ['', '', '', '', '', '', '', '', 'Référent 2'] });  // rien d'exploitable
  return { nom: 'signalements-fictifs.csv', entetes, lignes, notes: [] };
}

// ---------------------------------------------------------------------------
// Deux démonstrations de l'espace d'analyse. Tout est inventé : sociétés, faits, montants.
// Les villes sont réelles (il faut des coordonnées), rien d'autre ne l'est.
// Tirage reproductible : la démonstration montre la même chose à chaque visite.
function tirage(graine) {
  let a = graine;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIN = Date.UTC(2026, 10, 10);   // dernière date des jeux fictifs : 10/11/2026
const jourIso = (ms) => new Date(ms).toISOString().slice(0, 10);

// [ville, pays, latitude, longitude, poids]
const SITES = [
  ['Lagos', 'Nigeria', 6.455, 3.394, 9], ['Abuja', 'Nigeria', 9.077, 7.399, 3], ['Accra', 'Ghana', 5.604, -0.187, 4],
  ['Abidjan', 'Côte d\'Ivoire', 5.36, -4.008, 5], ['Dakar', 'Sénégal', 14.717, -17.468, 3], ['Douala', 'Cameroun', 4.051, 9.768, 4],
  ['Nairobi', 'Kenya', -1.292, 36.822, 6], ['Mombasa', 'Kenya', -4.044, 39.668, 2], ['Le Caire', 'Égypte', 30.044, 31.236, 4],
  ['Casablanca', 'Maroc', 33.573, -7.59, 3], ['Istanbul', 'Turquie', 41.008, 28.978, 4], ['Karachi', 'Pakistan', 24.861, 67.001, 5],
  ['Mumbai', 'Inde', 19.076, 72.878, 4], ['Jakarta', 'Indonésie', -6.209, 106.846, 3], ['Manille', 'Philippines', 14.6, 120.984, 2],
  ['Bogotá', 'Colombie', 4.711, -74.072, 4], ['Lima', 'Pérou', -12.046, -77.043, 2], ['Mexico', 'Mexique', 19.433, -99.133, 5],
  ['São Paulo', 'Brésil', -23.551, -46.633, 4]
];
const VILLES_AFFAIRES = [
  ['Paris', 'France', 48.857, 2.352], ['Lyon', 'France', 45.764, 4.836], ['Madrid', 'Espagne', 40.417, -3.704], ['Milan', 'Italie', 45.464, 9.19],
  ['Francfort', 'Allemagne', 50.11, 8.682], ['Varsovie', 'Pologne', 52.23, 21.012], ['Londres', 'Royaume-Uni', 51.507, -0.128],
  ['Casablanca', 'Maroc', 33.573, -7.59], ['Abidjan', 'Côte d\'Ivoire', 5.36, -4.008], ['Dakar', 'Sénégal', 14.717, -17.468], ['Lagos', 'Nigeria', 6.455, 3.394],
  ['Nairobi', 'Kenya', -1.292, 36.822], ['Le Caire', 'Égypte', 30.044, 31.236], ['Dubaï', 'Émirats arabes unis', 25.205, 55.271], ['Riyad', 'Arabie saoudite', 24.713, 46.675],
  ['Singapour', 'Singapour', 1.352, 103.82], ['Mumbai', 'Inde', 19.076, 72.878], ['Jakarta', 'Indonésie', -6.209, 106.846]
];

function auHasard(rnd, liste, poids) {
  const total = poids.reduce((s, p) => s + p, 0);
  let x = rnd() * total;
  for (let i = 0; i < liste.length; i++) { x -= poids[i]; if (x <= 0) return liste[i]; }
  return liste[liste.length - 1];
}

function jeuSurete() {
  const rnd = tirage(20261116);
  const types = ['Vol', 'Intrusion', 'Manifestation', 'Blocage routier', 'Fraude', 'Menace', 'Accident', 'Cyber'];
  const poidsTypes = [9, 6, 5, 5, 3, 3, 4, 2];
  const niveaux = ['Faible', 'Moyenne', 'Élevée', 'Critique'];
  const lieux = ['entrepôt', 'bureau', 'site de production', 'dépôt logistique', 'chantier', 'agence'];
  const sources = ['Responsable de site', 'Gardiennage', 'Presse locale', 'Transporteur', 'Autorités locales'];
  const faits = { 'Vol': 'Vol de matériel', 'Intrusion': 'Tentative d’intrusion de nuit', 'Manifestation': 'Rassemblement devant le site, accès ralenti',
    'Blocage routier': 'Axe d’accès bloqué plusieurs heures', 'Fraude': 'Soupçon de fraude documentaire', 'Menace': 'Message de menace reçu',
    'Accident': 'Accident de circulation d’un véhicule de service', 'Cyber': 'Tentative d’hameçonnage visant le personnel' };
  const entetes = ['Intitulé', 'Date', 'Ville', 'Pays', 'Latitude', 'Longitude', 'Type', 'Niveau', 'Site', 'Source'];
  const lignes = [];
  for (let i = 0; i < 460; i++) {
    const [ville, pays, lat, lon] = auHasard(rnd, SITES, SITES.map((s) => s[4]));
    const type = auHasard(rnd, types, poidsTypes);
    const lieu = lieux[Math.floor(rnd() * lieux.length)];
    // Plus de faits sur les derniers mois, et une vague de blocages à Lagos en septembre 2026.
    let jours = Math.floor(Math.pow(rnd(), 1.5) * 540);
    let t = type, v = ville, p = pays, la = lat, lo = lon;
    if (i % 11 === 0) { t = 'Blocage routier'; v = 'Lagos'; p = 'Nigeria'; la = 6.455; lo = 3.394; jours = 45 + Math.floor(rnd() * 25); }
    lignes.push({ numero: i + 2, valeurs: [`${faits[t]}, ${lieu} de ${v}`, jourIso(FIN - jours * 86400000), v, p,
      (la + (rnd() - 0.5) * 0.09).toFixed(5), (lo + (rnd() - 0.5) * 0.09).toFixed(5), t,
      auHasard(rnd, niveaux, [6, 5, 3, 1]), lieu, sources[Math.floor(rnd() * sources.length)]] });
  }
  return { titre: 'Incidents de sûreté (données fictives)', champ: 'categorie', entetes, lignes };
}

function jeuConcurrence() {
  const rnd = tirage(451);
  // Chaque société fictive a ses terrains de prédilection : c'est ce que le croisement fait apparaître.
  const societes = [
    ['Norvia', ['France', 'Espagne', 'Italie', 'Maroc']], ['Helkam', ['Allemagne', 'Pologne', 'Royaume-Uni']],
    ['Brantis', ['Côte d\'Ivoire', 'Sénégal', 'Nigeria', 'Kenya', 'Maroc']], ['Ostrel', ['Émirats arabes unis', 'Arabie saoudite', 'Égypte']],
    ['Quadra Sud', ['Singapour', 'Inde', 'Indonésie']]
  ];
  const mouvements = ['Ouverture de site', 'Contrat remporté', 'Recrutement', 'Partenariat', 'Acquisition', 'Prise de parole'];
  const poidsMouv = [3, 6, 7, 4, 1, 5];
  const sources = ['Presse', 'Registre du commerce', 'Salon professionnel', 'Offre d’emploi', 'Communiqué'];
  const phrases = { 'Ouverture de site': 'ouvre un bureau à', 'Contrat remporté': 'remporte un contrat à', 'Recrutement': 'recrute une équipe commerciale à',
    'Partenariat': 'signe un partenariat local à', 'Acquisition': 'rachète un acteur local à', 'Prise de parole': 'intervient publiquement à' };
  const entetes = ['Titre', 'Date', 'Ville', 'Pays', 'Latitude', 'Longitude', 'Type de mouvement', 'Concurrent', 'Source', 'Montant estimé (M€)'];
  const lignes = [];
  for (let i = 0; i < 300; i++) {
    const [nom, terrains] = auHasard(rnd, societes, [6, 5, 5, 3, 3]);
    // Trois fois sur quatre la société agit sur ses terrains habituels, sinon ailleurs.
    const chezElle = VILLES_AFFAIRES.filter((v) => terrains.includes(v[1]));
    const [ville, pays, lat, lon] = rnd() < 0.76 ? chezElle[Math.floor(rnd() * chezElle.length)] : VILLES_AFFAIRES[Math.floor(rnd() * VILLES_AFFAIRES.length)];
    let mouv = auHasard(rnd, mouvements, poidsMouv);
    let jours = Math.floor(rnd() * 420);
    // Fait saillant du jeu : Brantis multiplie les contrats en Afrique de l'Ouest depuis l'été 2026.
    if (nom === 'Brantis' && i % 3 === 0) { mouv = 'Contrat remporté'; jours = Math.floor(rnd() * 110); }
    const montant = mouv === 'Contrat remporté' || mouv === 'Acquisition' ? (1 + Math.floor(rnd() * 40)) : '';
    lignes.push({ numero: i + 2, valeurs: [`${nom} ${phrases[mouv]} ${ville}`, jourIso(FIN - jours * 86400000), ville, pays,
      (lat + (rnd() - 0.5) * 0.05).toFixed(5), (lon + (rnd() - 0.5) * 0.05).toFixed(5), mouv, nom, sources[Math.floor(rnd() * sources.length)], montant] });
  }
  return { titre: 'Veille concurrentielle (données fictives)', champ: 'libre:Concurrent', entetes, lignes };
}

export function demonstration(cle) { return cle === 'concurrence' ? jeuConcurrence() : jeuSurete(); }
