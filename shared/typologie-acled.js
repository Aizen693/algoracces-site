/**
 * typologie-acled.js : typologie des événements alignée sur la grille ACLED
 * (types et sous-types d'événements du codebook ACLED ; grille de classement
 * seulement, aucune donnée ACLED reprise).
 *
 * Un seul point de vérité, lu par la carte (navigateur) et par les scripts
 * Node du manifeste. Référentiel et validation : referentiels/typologie-acled/.
 *
 *   AlgorTypologie.classer(libelleTerrain, acteur, description)
 *     → { type: 'Affrontement armé', famille: 'Combats', brut: 'Attaque', confiance: 'cible' }
 *
 * `type` est le sous-type affiché et filtré ; `famille` est le type ACLED ;
 * `brut` est le libellé terrain, conservé tel quel pour la fiche.
 * Les libellés ambigus (Attaque, Offensive, Incursion, Pénétration, Assassinat,
 * Exécution) sont tranchés par l'auteur (acteur) et la cible lue dans la
 * description. Sans indice : « Attaque, cible non précisée ».
 */
(function (root) {
  'use strict';

  var COMBATS = 'Combats', EXPLO = 'Explosions / violence à distance', VCC = 'Violence contre les civils',
      MANIF = 'Manifestations', EMEUTE = 'Émeutes', DS = 'Développements stratégiques', CTX = 'Contexte (hors ACLED)',
      AMB = 'Combats ou violence contre les civils';

  // Ordre d'affichage des familles et sous-types (le filtre de la carte suit cet ordre à effectif égal).
  var FAMILLES = [COMBATS, EXPLO, VCC, MANIF, EMEUTE, DS, CTX];
  var AMBIGU = 'Attaque, cible non précisée';

  function low(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // [regex sur le libellé terrain, sous-type, famille] ; l'ordre fixe la priorité.
  // null = libellé ambigu, tranché par la cible.
  var REGLES = [
    [/pieg|\bvbied/, 'Engin explosif / IED', EXPLO],
    [/\bied\b|\bie[df]?\b|\beid\b|\bmines?\b|explosif/, 'Engin explosif / IED', EXPLO],
    [/artillerie|missile|pilonnage|bombardement|roquette|obus/, 'Bombardement / artillerie', EXPLO],
    [/frappe|drone|aerien/, 'Frappe aérienne ou de drone', EXPLO],
    [/enlevem|otage|sequestr|disparition|kidnap|\brapt\b/, 'Enlèvement / disparition forcée', VCC],
    [/assassinat|execution|meurtre|massacre/, null],
    [/embuscade|interception|combat|affront|accroch|\btirs?\b|ouverture du feu|echange/, 'Affrontement armé', COMBATS],
    [/attaque|incursion|penetrat|\braid\b|offensive|assaut/, null],
    [/manifestation/, 'Manifestation', MANIF],
    [/emeute/, 'Émeute', EMEUTE],
    [/\bvols?\b|braquage|pillage|extorsion|taxe|cotisation|prelevement|racket|destruction|incendie|sabotage/, 'Pillage / destruction de biens', DS],
    [/arrestation|inculpation|convoqu|transfert de detenu|interpellation/, 'Arrestations', DS],
    [/reddition|redition|rendition|desertion|defection/, 'Reddition / défection', DS],
    [/trafic/, 'Criminalité / trafic', CTX],
    [/saisie/, 'Saisie d\'armes', DS],
    [/liberation/, 'Libération d\'otages', DS],
    [/prise de position|installation/, 'Base ou position établie', DS],
    [/operation|ratissage|reconnaissance|controle|exercice|convoi|renfor|presence|mouvement|regroupement|rassemblement|position|arrivee|deploiement|patrouille/, 'Activité des forces', DS],
    [/menace|alerte|ultimatum|intimidation/, 'Menace / alerte', CTX],
    [/deplacement|refugi|humanitaire/, 'Déplacement de population', CTX],
    [/decision|promulgation|decheance|interdiction|reception|election|discours|declaration|revendication|rencontre|reunion|diplomat|politique|coup d/, 'Politique et institutionnel', CTX],
    [/intemperie|inondation|climat/, 'Environnement', CTX],
  ];

  /* ── Tranchage par la cible (voir referentiels/typologie-acled/regle-cible.py) ── */
  var ETATIQUE = /\b(fds|vdp|fama|ak|smp|armee|gendarmerie|police|garde|dozo|fardc|monusco|tsahal|idf|cgri|irgc|forces?)\b/;
  var ARME = /\b(postes? (militaire|avance|de police|de gendarmerie|de douane)|camps?|base|detachement|caserne|gendarmerie|commissariat|brigade|militaires?|soldats?|fds|vdp|fama|fardc|armee|gardes?|douan\w*|policiers?|gendarmes?|convoi|patrouille|escorte|troupes?|bataillon|miliciens?|milices?|dozos?|koglweogo|vigilantes?|cjtf|wazalendo|chasseurs traditionnels|forces? (de defense|armees|de securite)|unite)\b/;
  var GROUPE_ARME = /\b(combattants?|terroristes?|jihadistes?|djihadistes?|assaillants|gsim|jnim|ei|eigs|eis|iswap|jas|boko|hani|gat|fla|lakurawa|adf|m23|codeco|bandits? armes?|groupes? arme)\b/;
  var CIVIL = /\b(villages?|civils?|populations?|habitants?|marches?|ecoles?|eglises?|mosquees?|fideles|commercants?|orpailleurs?|orpaillage|bergers?|eleveurs?|cultivateurs?|agriculteurs?|passagers?|cars?|bus|transport|femmes|enfants|chefs? (de village|coutumiers?)|imams?|pasteurs?|catechistes?|conseillers?|maires?|notables?|hameaux?|domiciles?|concessions?|betail|troupeaux?|elus?|enseignants?|travailleurs?|ouvriers?|chauffeurs?|personnes?|individus?|deplaces)\b/;
  var RIPOSTE = /(repouss\w*|ripost\w*|echanges? de tirs|accroch\w*|affrontement\w*|neutralis\w*|mis en deroute)/;
  var VERBE = /(attaqu\w*|cibl\w*|vise\w*|assassin\w*|execut\w*|tue\w*|abattu\w*|incursion\w*|penetr\w*|offensive|pris pour cible|investi\w*)/g;

  function trancher(acteur, description) {
    var a = low(acteur), d = low(description), etat = ETATIQUE.test(a), m, zones = [];
    VERBE.lastIndex = 0;
    while ((m = VERBE.exec(d))) zones.push(d.slice(m.index + m[0].length, m.index + m[0].length + 90));
    var essais = [[zones.join(' '), 'cible'], [d, 'texte']];
    for (var i = 0; i < essais.length; i++) {
      var z = essais[i][0], portee = essais[i][1];
      if (!z) continue;
      if (etat) {
        if (GROUPE_ARME.test(z)) return ['Affrontement armé', COMBATS, portee];
        if (CIVIL.test(z)) return ['Attaque contre des civils', VCC, portee];
      } else {
        if (ARME.test(z)) return ['Affrontement armé', COMBATS, portee];
        if (CIVIL.test(z) && RIPOSTE.test(d)) return ['Affrontement armé', COMBATS, 'riposte'];
        if (CIVIL.test(z)) return ['Attaque contre des civils', VCC, portee];
      }
    }
    return null;
  }

  function classer(brut, acteur, description) {
    var b = String(brut == null ? '' : brut).trim();
    if (!b) return null;
    var l = low(b);
    for (var i = 0; i < REGLES.length; i++) {
      var r = REGLES[i];
      if (!r[0].test(l)) continue;
      if (r[1]) return { type: r[1], famille: r[2], brut: b, confiance: 'libelle' };
      var t = trancher(acteur, description);
      if (t) return { type: t[0], famille: t[1], brut: b, confiance: t[2] };
      return { type: AMBIGU, famille: AMB, brut: b, confiance: 'a relire' };
    }
    return { type: 'Information / divers', famille: CTX, brut: b, confiance: 'libelle' };
  }

  // Sous-types → famille (pour l'affichage groupé et les anciennes adresses).
  var SOUS_TYPES = {};
  REGLES.forEach(function (r) { if (r[1]) SOUS_TYPES[r[1]] = r[2]; });
  SOUS_TYPES['Attaque contre des civils'] = VCC;
  SOUS_TYPES['Information / divers'] = CTX;
  SOUS_TYPES[AMBIGU] = AMB;

  function famille(sousType) { return SOUS_TYPES[sousType] || null; }

  // Anciennes typologies maison (liens /carte/?event=… déjà partagés) → sous-types ACLED.
  var ANCIENNES = {
    'Attaque': ['Affrontement armé', 'Attaque contre des civils', AMBIGU],
    'Assassinat': ['Attaque contre des civils', 'Affrontement armé', AMBIGU],
    'Combat / Affrontement': ['Affrontement armé'], 'Embuscade': ['Affrontement armé'],
    'Frappe / Drône': ['Frappe aérienne ou de drone', 'Bombardement / artillerie'],
    'IED / Explosif': ['Engin explosif / IED'],
    'Enlèvement / Prise d\'otage': ['Enlèvement / disparition forcée'],
    'Vol / Pillage / Extorsion': ['Pillage / destruction de biens'], 'Destruction': ['Pillage / destruction de biens'],
    'Arrestation': ['Arrestations', 'Reddition / défection'],
    'Opération (forces)': ['Activité des forces'], 'Présence / Mouvement': ['Activité des forces'],
    'Menaces / Alerte': ['Menace / alerte'], 'Déplacement / Réfugiés': ['Déplacement de population'],
    'Information / Divers': ['Information / divers', 'Politique et institutionnel'],
  };
  function depuisAncienne(label) { return ANCIENNES[label] || null; }

  // Rang d'affichage d'un sous-type : famille puis ordre des règles.
  var ORDRE = [];
  FAMILLES.forEach(function (f) { Object.keys(SOUS_TYPES).forEach(function (s) { if (SOUS_TYPES[s] === f && ORDRE.indexOf(s) < 0) ORDRE.push(s); }); });
  ORDRE.push(AMBIGU);
  function rang(sousType) { var i = ORDRE.indexOf(sousType); return i < 0 ? 999 : i; }

  var api = {
    classer: classer, famille: famille, depuisAncienne: depuisAncienne, rang: rang,
    FAMILLES: FAMILLES, AMBIGU: AMBIGU, SOUS_TYPES: ORDRE.slice(),
    REFERENCE: 'Grille alignée sur les types et sous-types d\'événements du codebook ACLED',
  };
  root.AlgorTypologie = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
