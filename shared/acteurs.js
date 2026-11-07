/**
 * acteurs.js : libellé canonique d'un acteur, pour que les filtres ne montrent
 * qu'une case par acteur réel.
 *
 * Les bulletins terrain écrivent le même acteur de dix façons : casse
 * (CIVIL / Civil / CIVILS), code de rubrique (CIVIL INT, CIVIL-GENERAL INT),
 * typologie collée au nom (GSIM-Attaque, JAS – Divers informations), précision
 * d'unité entre parenthèses (FDS (Opération HADIN KAI)), coquilles (Lukawara).
 * Ce module ramène tout cela à un seul libellé. Le libellé brut n'est pas perdu :
 * la typologie est classée à part (typologie-acled.js) à partir du texte brut.
 *
 * Un seul point de vérité, lu par la carte, /theatres/ et les scripts Node.
 *
 *   AlgorActeurs.normaliser('CIVILS – Divers informations')  → 'Civils'
 *   AlgorActeurs.liste(['GSIM', 'GSIM-Attaque', 'JNIM'])     → ['GSIM']
 */
(function (root) {
  'use strict';

  // Clé de comparaison : majuscules, sans accent, sans ponctuation ni espace.
  function cle(a) {
    return String(a == null ? '' : a).toUpperCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
  }

  // Segment final qui décrit l'événement et non l'acteur (« GSIM-Attaque »).
  var TYPO = /^(attaq|assassin|combat|destruc|desert|arrest|divers|enlev|menac|embusc|explosi|incursi|mouvem|presenc|regroup|taxe|refugi|drone)/;

  // Sigles dont la parenthèse ne précise que l'unité ou l'opération : on la retire.
  var PAREN_RETIREE = { FDS: 1, GAT: 1, LAKURAWA: 1 };

  // Variantes connues → libellé retenu (clé = cle(variante)).
  var ALIAS = {
    // Population civile : rubriques INT / GENERAL du bulletin comprises
    CIVIL: 'Civils', CIVILS: 'Civils', CIVILINT: 'Civils', CIVILGENERALINT: 'Civils',
    // JNIM = GSIM (sigle arabe / sigle français)
    GSIM: 'GSIM', JNIM: 'GSIM',
    // État islamique au Sahel (ex-EIGS, renommé en 2022)
    EIS: 'EI-Sahel', EISAHEL: 'EI-Sahel', EIGS: 'EI-Sahel',
    EI: 'EI', ETATISLAMIQUE: 'EI',
    EIISWAPWILAYATGHARBAFRIQIYAH: 'ISWAP',
    BOKOHARAM: 'Boko Haram',
    LAKURAWA: 'Lakurawa', LUKAWARA: 'Lakurawa', LAKURAWAEIGS: 'Lakurawa',
    EIGSLAKURAWA: 'Lakurawa', LAKURAWAEI: 'Lakurawa',
    FAMA: 'FAMa', FAMAAC: 'FAMa/AC', FAMAC: 'FAMa/AC', FAMAAFRICACORPS: 'FAMa/AC',
    FAMAAK: 'FAMa/AK', FAMASMP: 'FAMa/SMP', FLAFAMA: 'FLA, FAMa',
    FDSVDP: 'FDS/VDP',
    GATEI: 'GAT, EI', GATEIISCAP: 'GAT, ISCAP', GATETISCAP: 'GAT, ISCAP',
    GATGSIM: 'GAT, GSIM', GATBOKOHARAM: 'GAT, Boko Haram',
    GSIMEIS: 'GSIM, EI-Sahel', GSIMEIGS: 'GSIM, EI-Sahel',
    MILITAIRESBASEDETSAURE: 'Militaires',
    GENERALINT: 'GENERAL INT', GENERALEXT: 'GENERAL EXT', GENERLEXT: 'GENERAL EXT',
    FORCESAMERICAINES: 'USA', UN: 'ONU', ONU: 'ONU', EU: 'UE'
  };

  function normaliser(raw) {
    if (raw == null) return null;
    // Espacement des séparateurs : « EI - S » → « EI-S », « FAMA / AK » → « FAMA/AK »,
    // le tiret long des bulletins compris.
    var s = String(raw).trim().replace(/\s+/g, ' ')
      .replace(/\s*[-–—]\s*/g, '-').replace(/\s*\/\s*/g, '/');
    if (!s) return null;
    // Retire la typologie collée en fin de libellé, éventuellement en plusieurs segments.
    var m;
    while ((m = s.match(/^(.*[^-])-([^-]+)$/)) &&
      TYPO.test(m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))) s = m[1];
    // Parenthèse de précision d'unité : « FDS (Opération HADIN KAI) » → « FDS ».
    m = s.match(/^([^()]+?) ?\((.+)\)$/);
    if (m && PAREN_RETIREE[cle(m[1])]) s = m[1];
    return ALIAS[cle(s)] || s;
  }

  // Liste distincte de libellés canoniques, triée.
  function liste(arr) {
    var vu = {}, out = [];
    (arr || []).forEach(function (a) {
      var n = normaliser(a);
      if (n && !vu[cle(n)]) { vu[cle(n)] = 1; out.push(n); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'fr'); });
  }

  var api = { normaliser: normaliser, liste: liste, cle: cle };
  root.AlgorActeurs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
