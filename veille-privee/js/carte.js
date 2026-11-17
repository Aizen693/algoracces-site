// Veille privée : la carte de l'espace d'analyse.
// Même fond et même dessin des points que /carte/ (Mapbox Streets, frontières épaisses,
// points à halo). Ce code est une copie adaptée de shared/humint-engine.js, qui n'est pas modifié.
//
// Une seule carte sert à toutes les échelles. Les points proches à l'écran sont regroupés
// en un disque qui porte leur nombre et, sur son anneau, leur répartition par couleur.
// Vu du monde : un disque par région du globe. En zoomant : par pays, par ville, puis point par point.

/* global mapboxgl */
import { COULEURS, COULEUR_AUTRES } from './analyse.js?v=20261117k';

// Jeton public du site (restreint par adresse à algoracces.fr et au poste local), le même que /carte/.
const JETON = 'pk.eyJ1IjoiYXo2OTMiLCJhIjoiY21uMGlhY2ZyMGx6bDJycjAxYWZjbWt5eiJ9.SQqOLLgLwWKnUGMztrSArg';
const SRC = 'vp-points';       // points regroupés en disques
const BRUT = 'vp-brut';        // les mêmes points, non regroupés, pour la carte de chaleur
const PAYS = 'vp-pays';        // contours des pays (fonds Mapbox), pour la lecture par pays
const TEINTES = [...COULEURS, COULEUR_AUTRES];   // rangs 0 à 5 = couleurs, rang 6 = autres
const VIDE = { type: 'FeatureCollection', features: [] };

// surEntrees(rangs) est appelé quand on clique un point ou un disque qui ne peut plus s'ouvrir :
// rangs = positions des entrées dans la liste passée à afficher().
// surPays(code) est appelé quand on clique un pays teinté (code ISO à deux lettres).
// nuit : fond sombre (celui de la carte cyber de /veille/). Sans lui, le fond clair de /carte/.
// surPrete() est appelé la première fois que les points sont à l'écran.
export function creerCarte(conteneur, { surEntrees, surMouvement, surPays, surPrete, nuit = false }) {
  const clair = (a) => (nuit ? `rgba(255,255,255,${a})` : `rgba(28,29,33,${a})`);   // la teinte qui ressort sur le fond
  mapboxgl.accessToken = JETON;
  const carte = new mapboxgl.Map({
    container: conteneur, style: nuit ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11', center: [15, 20], zoom: 1.3,
    localFontFamily: "'Host Grotesk', 'Helvetica Neue', sans-serif",   // les noms de la carte dans la typographie du site
    projection: 'globe', attributionControl: false, language: 'fr',   // un globe : à l'échelle du monde, les distances restent justes
    preserveDrawingBuffer: true   // nécessaire pour copier la carte dans le rapport
  });
  carte.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
  carte.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

  const disques = new Map();   // identifiant du regroupement → { marqueur, total, parts, lngLat, taille }
  let enAttente = null;        // données reçues avant que le fond soit prêt
  let mode = 'disques';        // 'disques', 'chaleur' ou 'pays'
  let noms = [];               // nom de chaque couleur (rang 0 à 5, puis « Autres »), pour le survol d'un cercle
  let annoncee = false;        // surPrete n'est appelé qu'une fois
  let parPays = {};            // code ISO → nombre d'entrées, pour la lecture par pays
  const bulle = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'vp-bulle', offset: 10 });

  const pret = new Promise((ok) => carte.on('load', () => {
    // Atmosphère autour du globe, dans les tons du site.
    try { carte.setFog(nuit ? { color: 'rgb(15,16,19)', 'high-color': 'rgb(40,44,62)', 'horizon-blend': 0.07, 'space-color': 'rgb(9,10,12)', 'star-intensity': 0.18 }
      : { color: 'rgb(255,255,255)', 'high-color': 'rgb(255,255,255)', 'horizon-blend': 0.015, 'space-color': 'rgb(255,255,255)', 'star-intensity': 0 }); } catch (e) { /* sans atmosphère */ }
    if (!nuit) graver();
    // Frontières : on masque le trait fin du fond et on trace un trait épais, comme sur /carte/.
    for (const l of carte.getStyle().layers || []) {
      if (/^admin-0-boundary/.test(l.id)) { try { carte.setLayoutProperty(l.id, 'visibility', 'none'); } catch (e) { /* fond différent */ } }
    }
    try {
      carte.addSource('mb-admin', { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
      carte.addLayer({
        id: 'admin0-thick', type: 'line', source: 'mb-admin', 'source-layer': 'admin',
        filter: ['all', ['==', ['get', 'admin_level'], 0], ['==', ['get', 'maritime'], 'false']],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': nuit ? '#FFFFFF' : '#000000', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, nuit ? 0.7 : 1.2, 6, nuit ? 1.2 : 2.2, 9, nuit ? 1.8 : 3.2, 12, nuit ? 2.4 : 4.2], 'line-opacity': nuit ? 0.42 : 0.92 }
      });
      const premierTexte = (carte.getStyle().layers || []).find((l) => l.type === 'symbol');
      if (premierTexte) carte.moveLayer('admin0-thick', premierTexte.id);
    } catch (e) { /* la frontière fine du fond reste en place */ }

    // Les points. Le regroupement compte, pour chaque disque, combien de points de chaque couleur.
    const compteurs = {};
    TEINTES.forEach((_, k) => { compteurs['c' + k] = ['+', ['case', ['==', ['get', 'k'], k], 1, 0]]; });
    carte.addSource(SRC, { type: 'geojson', data: VIDE, cluster: true, clusterRadius: 46, clusterMaxZoom: 15, clusterProperties: compteurs });
    const seul = ['!', ['has', 'point_count']];
    carte.addLayer({ id: 'vp-halo', type: 'circle', source: SRC, filter: seul, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 9, 8, 14, 12, 19], 'circle-color': ['get', 'c'], 'circle-opacity': nuit ? 0.28 : 0.1, 'circle-blur': 1.2 } });
    carte.addLayer({ id: 'vp-anneau', type: 'circle', source: SRC, filter: seul, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 7, 12, 9], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'c'], 'circle-stroke-width': 0.8, 'circle-stroke-opacity': 0.6 } });
    carte.addLayer({ id: 'vp-point', type: 'circle', source: SRC, filter: seul, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.2, 8, 4.2, 12, 5.5], 'circle-color': ['get', 'c'], 'circle-stroke-color': '#1C1D21', 'circle-stroke-width': 1 } });

    // Carte de chaleur : la densité des points, en encre. En zoomant, les points eux-mêmes reviennent.
    carte.addSource(BRUT, { type: 'geojson', data: VIDE });
    carte.addLayer({ id: 'vp-chaleur', type: 'heatmap', source: BRUT, maxzoom: 13, layout: { visibility: 'none' }, paint: {
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 14, 5, 26, 10, 40],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 10, 1.6],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, clair(0), 0.15, clair(0.26), 0.45, clair(0.55), 0.8, clair(0.82), 1, clair(1)],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.92, 13, 0] } });
    carte.addLayer({ id: 'vp-chaleur-points', type: 'circle', source: BRUT, minzoom: 8, layout: { visibility: 'none' }, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 13, 5.5], 'circle-color': ['get', 'c'], 'circle-stroke-color': '#0d1117', 'circle-stroke-width': 0.6,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 10.5, 1], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 10.5, 1] } });
    carte.on('click', 'vp-chaleur-points', (e) => surEntrees([e.features[0].properties.i]));

    // Lecture par pays : chaque pays est teinté selon son nombre d'entrées. Plus c'est sombre, plus il y en a.
    try {
      carte.addSource(PAYS, { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' });
      carte.addLayer({ id: 'vp-pays-fond', type: 'fill', source: PAYS, 'source-layer': 'country_boundaries', layout: { visibility: 'none' },
        filter: ['any', ['==', ['get', 'worldview'], 'all'], ['in', 'US', ['get', 'worldview']]],
        paint: { 'fill-color': nuit ? '#FFFFFF' : '#1C1D21', 'fill-opacity': 0 } }, 'admin0-thick');
      carte.on('click', 'vp-pays-fond', (e) => { const code = e.features[0].properties.iso_3166_1; if (parPays[code] && surPays) surPays(code); });
      carte.on('mousemove', 'vp-pays-fond', (e) => {
        const code = e.features[0].properties.iso_3166_1, n = parPays[code];
        carte.getCanvas().style.cursor = n ? 'pointer' : '';
        if (!n) return bulle.remove();
        bulle.setLngLat(e.lngLat).setText(`${e.features[0].properties.name_fr || e.features[0].properties.name || code} : ${n.toLocaleString('fr-FR')}`).addTo(carte);
      });
      carte.on('mouseleave', 'vp-pays-fond', () => { carte.getCanvas().style.cursor = ''; bulle.remove(); });
    } catch (e) { /* contours indisponibles : la lecture par pays reste vide, les autres marchent */ }

    carte.on('click', 'vp-point', (e) => surEntrees([e.features[0].properties.i]));
    carte.on('mouseenter', 'vp-point', () => { carte.getCanvas().style.cursor = 'pointer'; });
    carte.on('mouseleave', 'vp-point', () => { carte.getCanvas().style.cursor = ''; });
    carte.on('render', () => { if (mode === 'disques' && carte.isSourceLoaded(SRC)) dessinerDisques(); });
    carte.on('idle', () => { if (!annoncee) { annoncee = true; if (surPrete) surPrete(); } });
    carte.on('moveend', () => surMouvement && surMouvement());
    if (enAttente) { poser(enAttente); enAttente = null; }
    appliquerMode();
    ok();
  }));

  // Rendu « planche gravée » : terres en papier, mers en hachures d'encre, méridiens et parallèles,
  // tout le reste du fond (parcs, bâtiments, ombrages) retiré. C'est le dessin d'un atlas imprimé.
  function graver() {
    // Motif de hachure : un trait d'encre en diagonale, répété.
    const cote = 12, toile = document.createElement('canvas');
    toile.width = cote; toile.height = cote;
    const g = toile.getContext('2d');
    g.strokeStyle = 'rgba(28,29,33,0.42)'; g.lineWidth = 1;
    for (const d of [-cote, 0, cote]) { g.beginPath(); g.moveTo(d, cote); g.lineTo(d + cote, 0); g.stroke(); }
    try { carte.addImage('vp-hachure', g.getImageData(0, 0, cote, cote), { pixelRatio: 2 }); } catch (e) { /* déjà posé */ }

    for (const l of carte.getStyle().layers || []) {
      try {
        if (l.type === 'background') carte.setPaintProperty(l.id, 'background-color', '#FFFFFF');
        else if (l.id === 'water') carte.setPaintProperty(l.id, 'fill-pattern', 'vp-hachure');
        else if (/landuse|national-park|land-structure|hillshade|building|aeroway|pitch|landcover|waterway-shadow|water-shadow/.test(l.id)) carte.setLayoutProperty(l.id, 'visibility', 'none');
        else if (l.type === 'fill') carte.setPaintProperty(l.id, 'fill-color', '#FFFFFF');
        else if (l.type === 'line' && /waterway/.test(l.id)) carte.setPaintProperty(l.id, 'line-color', 'rgba(28,29,33,0.35)');
        else if (l.type === 'symbol' && /continent-label|state-label|natural|water-|waterway|poi|airport|transit|road/.test(l.id)) carte.setLayoutProperty(l.id, 'visibility', 'none');   // moins de noms : seuls pays et villes restent
        else if (l.type === 'symbol' && /settlement/.test(l.id)) { carte.setLayerZoomRange(l.id, 4.2, 24); carte.setPaintProperty(l.id, 'text-color', '#3C3D42'); carte.setPaintProperty(l.id, 'text-halo-color', '#FFFFFF'); carte.setPaintProperty(l.id, 'text-halo-width', 1.4); }
        else if (l.type === 'symbol') { carte.setPaintProperty(l.id, 'text-color', '#1C1D21'); carte.setPaintProperty(l.id, 'text-halo-color', '#FFFFFF'); carte.setPaintProperty(l.id, 'text-halo-width', 1.4); }
      } catch (e) { /* propriété absente sur cette couche */ }
    }

    // Graticule : un méridien et un parallèle tous les 20 degrés.
    const lignes = [];
    for (let lon = -180; lon <= 180; lon += 20) { const c = []; for (let lat = -85; lat <= 85; lat += 5) c.push([lon, lat]); lignes.push(c); }
    for (let lat = -80; lat <= 80; lat += 20) { const c = []; for (let lon = -180; lon <= 180; lon += 5) c.push([lon, lat]); lignes.push(c); }
    carte.addSource('vp-graticule', { type: 'geojson', data: { type: 'FeatureCollection', features: lignes.map((c) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: {} })) } });
    const premierTexte = (carte.getStyle().layers || []).find((l) => l.type === 'symbol');
    carte.addLayer({ id: 'vp-graticule', type: 'line', source: 'vp-graticule', paint: { 'line-color': '#1C1D21', 'line-width': 0.5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 5, 0.12, 7, 0] } }, premierTexte && premierTexte.id);
  }

  // Cercle proportionnel : sa taille dit le nombre d'entrées, son anneau leur répartition.
  // Dessin à plat, cerné d'encre, comme sur une carte statistique imprimée.
  function svgDisque(total, parts, taille) {
    const r = taille / 2, ep = Math.max(5, taille * 0.2), rayon = r - 1 - ep / 2, tour = 2 * Math.PI * rayon;
    let fait = 0, arcs = '';
    parts.forEach((n, k) => {
      if (!n) return;
      const long = (n / total) * tour;
      arcs += `<circle cx="${r}" cy="${r}" r="${rayon}" fill="none" stroke="${TEINTES[k]}" stroke-width="${ep}" stroke-dasharray="${long} ${tour - long}" stroke-dashoffset="${-fait}" transform="rotate(-90 ${r} ${r})"/>`;
      fait += long;
    });
    return `<svg width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}" aria-hidden="true">
      <circle cx="${r}" cy="${r}" r="${r - 0.6}" fill="#fff"/>${arcs}
      <circle cx="${r}" cy="${r}" r="${r - 0.6}" fill="none" stroke="#1C1D21" stroke-width="1.1"/>
      <circle cx="${r}" cy="${r}" r="${rayon - ep / 2}" fill="#fff" stroke="#1C1D21" stroke-width="0.9"/>
      <text x="${r}" y="${r}" dy=".36em" text-anchor="middle" fill="#1C1D21" font-size="${taille > 52 ? 15 : taille > 38 ? 12.5 : 11}" font-family="Host Grotesk, sans-serif">${abrege(total)}</text></svg>`;
  }
  const abrege = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n));
  // La surface du cercle suit le nombre d'entrées (rayon en racine carrée) : 4 fois plus d'entrées = cercle 2 fois plus large.
  const tailleDisque = (n) => Math.round(Math.min(96, 26 + Math.sqrt(n) * 4.4));

  function dessinerDisques() {
    const vus = new Set();
    for (const f of carte.querySourceFeatures(SRC)) {
      const p = f.properties;
      if (!p.cluster || vus.has(p.cluster_id)) continue;
      vus.add(p.cluster_id);
      if (disques.has(p.cluster_id)) continue;
      const parts = TEINTES.map((_, k) => p['c' + k] || 0);
      const taille = tailleDisque(p.point_count);
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'vp-disque';
      bouton.setAttribute('aria-label', `${p.point_count} entrées regroupées`);
      bouton.innerHTML = svgDisque(p.point_count, parts, taille);
      const id = p.cluster_id, lngLat = f.geometry.coordinates;
      bouton.addEventListener('click', () => ouvrirDisque(id, lngLat, p.point_count));
      // Au survol : le total et le détail par couleur, sans avoir à cliquer.
      bouton.addEventListener('mouseenter', () => {
        const lignes = parts.map((n, k) => ({ n, k })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 4)
          .map((x) => `<span><i style="background:${TEINTES[x.k]}"></i>${echapper(noms[x.k] || 'Autres')}<b>${x.n.toLocaleString('fr-FR')}</b></span>`).join('');
        bulle.setLngLat(lngLat).setHTML(`<strong>${p.point_count.toLocaleString('fr-FR')}</strong>${lignes}<em>Cliquez pour zoomer</em>`).addTo(carte);
      });
      bouton.addEventListener('mouseleave', () => bulle.remove());
      const marqueur = new mapboxgl.Marker({ element: bouton }).setLngLat(lngLat).addTo(carte);
      disques.set(id, { marqueur, total: p.point_count, parts, lngLat, taille });
    }
    for (const [id, d] of disques) if (!vus.has(id)) { d.marqueur.remove(); disques.delete(id); }
  }

  // Un clic sur un disque zoome jusqu'à le séparer. S'il ne peut plus se séparer
  // (points au même endroit), on rend la liste de ses entrées.
  function ouvrirDisque(id, lngLat, total) {
    const source = carte.getSource(SRC);
    source.getClusterExpansionZoom(id, (erreur, zoom) => {
      if (erreur) return;
      if (zoom > 15.5 || carte.getZoom() >= 15) {
        source.getClusterLeaves(id, Math.min(total, 500), 0, (e2, feuilles) => { if (!e2) surEntrees(feuilles.map((f) => f.properties.i)); });
      } else carte.easeTo({ center: lngLat, zoom: Math.min(zoom + 0.3, 16), duration: 600 });
    });
  }

  const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function viderDisques() { for (const d of disques.values()) d.marqueur.remove(); disques.clear(); }

  function poser(donnees) {
    carte.getSource(SRC).setData(donnees);
    carte.getSource(BRUT).setData(donnees);
    // Poids d'un point dans la carte de chaleur : réglé sur le volume, pour qu'une base de 300 lignes
    // et une base de 20 000 lignes donnent toutes deux des nuances, et pas des taches uniformément noires.
    carte.setPaintProperty('vp-chaleur', 'heatmap-weight', Math.max(0.002, Math.min(1, 45 / Math.max(1, donnees.features.length))));
    teinterPays();
  }

  // Teinte des pays : cinq paliers d'encre, du plus clair au plus sombre, sur une échelle en racine carrée
  // (sinon un seul pays très chargé écrase tous les autres).
  function teinterPays() {
    if (!carte.getLayer('vp-pays-fond')) return;
    const codes = Object.keys(parPays);
    if (!codes.length) { carte.setPaintProperty('vp-pays-fond', 'fill-opacity', 0); return; }
    const sommet = Math.max(...Object.values(parPays));
    const expr = ['match', ['get', 'iso_3166_1']];
    for (const code of codes) expr.push(code, 0.12 + (nuit ? 0.6 : 0.66) * Math.sqrt(parPays[code] / sommet));
    expr.push(0);
    carte.setPaintProperty('vp-pays-fond', 'fill-opacity', expr);
  }

  function appliquerMode() {
    const voir = (id, oui) => { if (carte.getLayer(id)) carte.setLayoutProperty(id, 'visibility', oui ? 'visible' : 'none'); };
    for (const id of ['vp-halo', 'vp-anneau', 'vp-point']) voir(id, mode === 'disques');
    voir('vp-chaleur', mode === 'chaleur'); voir('vp-chaleur-points', mode === 'chaleur');
    voir('vp-pays-fond', mode === 'pays');
    if (mode !== 'disques') viderDisques();
    bulle.remove();
    carte.triggerRepaint();
  }

  return {
    pret,
    redimensionner: () => carte.resize(),
    zoom: () => carte.getZoom(),
    mode: () => mode,
    changerMode(m) { mode = m; if (carte.getSource(SRC)) appliquerMode(); },

    // entrees : la liste filtrée. pal : la palette du champ de lecture (analyse.js). cle : ce champ.
    afficher(entrees, pal, valeurDe, comptesPays) {
      parPays = comptesPays || {};
      noms = pal.legende.map((x) => x.v);
      const features = [];
      entrees.forEach((e, i) => {
        if (e.lat == null || e.lon == null) return;
        const v = valeurDe(e);
        const k = pal.rang.has(v) ? pal.rang.get(v) : 6;
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: { i, k, c: TEINTES[k] } });
      });
      const donnees = { type: 'FeatureCollection', features };
      viderDisques();
      if (carte.getSource(SRC)) poser(donnees); else enAttente = donnees;
      return features.length;
    },

    // Cadre la carte sur les entrées données : une ville, un pays ou le monde selon leur étendue.
    cadrer(entrees, anime = true) {
      let o = 180, e = -180, s = 90, n = -90, k = 0;
      for (const x of entrees) {
        if (x.lat == null) continue;
        k++; o = Math.min(o, x.lon); e = Math.max(e, x.lon); s = Math.min(s, x.lat); n = Math.max(n, x.lat);
      }
      if (!k) return;
      carte.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });   // annule le décalage laissé par une fiche
      if (e - o < 0.002 && n - s < 0.002) carte.easeTo({ center: [o, s], zoom: 11, duration: anime ? 700 : 0 });
      else {
        // Sur un globe, des données réparties sur toute la planète donneraient une sphère minuscule :
        // on ne dézoome jamais en dessous d'un globe qui remplit l'écran.
        // Sur grand écran, on laisse la place du cartouche à gauche et de la légende à droite : le globe se centre dans l'espace libre.
        const large = carte.getContainer().clientWidth > 1000;
        const vue = carte.cameraForBounds([[o, s], [e, n]], { padding: { top: 80, bottom: 70, left: large ? 430 : 80, right: large ? 290 : 70 }, maxZoom: 13 });
        if (vue) carte.easeTo({ center: vue.center, zoom: Math.max(vue.zoom, 1.7), bearing: 0, pitch: 0, duration: anime ? 700 : 0, padding: { top: 0, bottom: 0, left: large ? 140 : 0, right: 0 } });
      }
    },

    // Va sur une entrée. La fiche s'ouvre à droite de la carte : on décale le point vers la gauche
    // pour qu'il reste visible (sur un écran étroit la fiche est en bas, on décale vers le haut).
    allerA(e) {
      const large = carte.getContainer().clientWidth > 700;
      carte.easeTo({ center: [e.lon, e.lat], zoom: Math.max(carte.getZoom(), 11), duration: 700,
        padding: large ? { right: 380, left: 0, top: 0, bottom: 0 } : { bottom: 260, left: 0, top: 0, right: 0 } });
    },

    // Image de la carte telle qu'affichée, disques compris, pour le rapport.
    image() {
      const fond = carte.getCanvas();
      const rapport = fond.width / fond.clientWidth;
      const toile = document.createElement('canvas');
      toile.width = fond.width; toile.height = fond.height;
      const g = toile.getContext('2d');
      g.drawImage(fond, 0, 0);
      for (const d of disques.values()) {
        const p = carte.project(d.lngLat);
        const x = p.x * rapport, y = p.y * rapport, r = (d.taille / 2) * rapport;
        const ep = Math.max(5, d.taille * 0.2) * rapport, rayon = r - rapport - ep / 2;
        g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill();
        let angle = -Math.PI / 2;
        d.parts.forEach((n, k) => {
          if (!n) return;
          const fin = angle + (n / d.total) * 2 * Math.PI;
          g.beginPath(); g.arc(x, y, rayon, angle, fin); g.strokeStyle = TEINTES[k]; g.lineWidth = ep; g.stroke();
          angle = fin;
        });
        g.strokeStyle = '#1C1D21'; g.lineWidth = 1.1 * rapport;
        g.beginPath(); g.arc(x, y, r - 0.6 * rapport, 0, 2 * Math.PI); g.stroke();
        g.beginPath(); g.arc(x, y, rayon - ep / 2, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill(); g.stroke();
        g.fillStyle = '#1C1D21'; g.font = `${12 * rapport}px "Host Grotesk", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(abrege(d.total), x, y);
      }
      return toile.toDataURL('image/jpeg', 0.9);
    }
  };
}
