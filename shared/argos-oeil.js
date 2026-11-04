/* argos-oeil.js : figure d'Argos pour l'en-tête de /argos/ (04/11/2026).
 *
 * Le mythe : Argos Panoptès, le gardien aux cent yeux. À sa mort, Junon pose ses yeux sur la queue du paon.
 * Rendu en gravure sur fond de nuit (DA v5) : un grand œil central, un éventail de cent rayons fins comme des
 * plumes, un œil gravé au bout de chacun. Les yeux s'ouvrent l'un après l'autre au chargement, les pupilles
 * suivent le pointeur, un œil cligne de temps en temps.
 * Dessin entièrement généré : aucune image ni œuvre tierce. Immobile si l'utilisateur réduit les animations.
 * Usage : <canvas class="argos-oeil" aria-hidden="true"></canvas> dans la page, puis ce script.
 */
(function () {
  'use strict';
  var toile = document.querySelector('canvas.argos-oeil');
  if (!toile || !toile.getContext) return;
  var ctx = toile.getContext('2d');
  var calmes = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ENCRE = '242,242,244';            // --on-night
  var NUIT = '#0F1013';                 // --night
  var NB = 100;

  var L = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  var yeux = [], fond = null, regard = { x: 0, y: 0 }, cible = { x: 0, y: 0 }, debut = 0, visible = true, boucle = 0;

  // Hasard reproductible : la gravure est la même à chaque visite.
  var graine = 7;
  function hasard() { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; }

  function trait(a) { return 'rgba(' + ENCRE + ',' + a + ')'; }

  function construire() {
    var r = toile.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    toile.width = L * dpr; toile.height = H * dpr;
    cx = L / 2; cy = H * 0.86; R = Math.min(L * 0.5, H * 0.82);
    graine = 7;
    // Cent yeux sur trois rangs, en éventail de 200 degrés ouvert vers le haut.
    var rangs = [{ n: 22, r: 0.44, t: 0.055 }, { n: 33, r: 0.68, t: 0.045 }, { n: 45, r: 0.93, t: 0.036 }];
    yeux = [];
    var ouverture = Math.PI * 1.11;
    rangs.forEach(function (rg, k) {
      for (var i = 0; i < rg.n; i++) {
        var a = Math.PI + (Math.PI - ouverture) / 2 + ouverture * (i + 0.5) / rg.n + (hasard() - 0.5) * 0.012;
        var rr = R * (rg.r + (hasard() - 0.5) * 0.04);
        yeux.push({
          x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, a: a, rang: k,
          t: R * rg.t * (0.9 + hasard() * 0.2),
          eveil: 0.25 + (k * 0.35) + hasard() * 0.9,          // secondes avant ouverture
          cligne: 4 + hasard() * 14, duree: 0.16,
        });
      }
    });
    dessinerFond();
  }

  // Couche fixe : halo de rayons, plumes hachurées, anneaux. Calculée une fois par taille.
  function dessinerFond() {
    fond = document.createElement('canvas');
    fond.width = toile.width; fond.height = toile.height;
    var f = fond.getContext('2d');
    f.scale(dpr, dpr);
    f.lineCap = 'round';
    // Halo : fines lignes rayonnantes autour du grand œil, comme une gravure de gloire.
    for (var i = 0; i < 180; i++) {
      var a = Math.PI + Math.PI * (i / 179);
      var r0 = R * 0.12, r1 = R * (0.2 + (i % 3) * 0.03);
      f.strokeStyle = trait(0.22);
      f.lineWidth = 0.6;
      f.beginPath(); f.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); f.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); f.stroke();
    }
    // Plumes : un tuyau par œil et des barbes en hachures, plus denses près de l'œil.
    yeux.forEach(function (o) {
      var r0 = R * 0.2, dx = Math.cos(o.a), dy = Math.sin(o.a), px = -dy, py = dx;
      var long = Math.hypot(o.x - cx, o.y - cy) - o.t * 1.3;
      f.strokeStyle = trait(0.32); f.lineWidth = 0.7;
      f.beginPath(); f.moveTo(cx + dx * r0, cy + dy * r0); f.lineTo(cx + dx * long, cy + dy * long); f.stroke();
      f.strokeStyle = trait(0.14); f.lineWidth = 0.5;
      for (var s = r0 + 8; s < long; s += 5.5) {
        var p = (s - r0) / (long - r0), b = (2 + p * p * o.t * 0.9);
        var bx = cx + dx * s, by = cy + dy * s;
        f.beginPath(); f.moveTo(bx, by); f.lineTo(bx + (px + dx * 0.9) * b, by + (py + dy * 0.9) * b); f.stroke();
        f.beginPath(); f.moveTo(bx, by); f.lineTo(bx + (-px + dx * 0.9) * b, by + (-py + dy * 0.9) * b); f.stroke();
      }
      // Ocelle de plume : deux anneaux gravés autour de l'œil.
      f.strokeStyle = trait(0.18); f.lineWidth = 0.6;
      f.beginPath(); f.ellipse(o.x, o.y, o.t * 1.55, o.t * 1.2, o.a + Math.PI / 2, 0, Math.PI * 2); f.stroke();
      f.strokeStyle = trait(0.1);
      f.beginPath(); f.ellipse(o.x, o.y, o.t * 1.9, o.t * 1.5, o.a + Math.PI / 2, 0, Math.PI * 2); f.stroke();
    });
    // Anneaux concentriques du grand œil.
    for (var k = 0; k < 7; k++) {
      f.strokeStyle = trait(0.12 + k * 0.03); f.lineWidth = 0.6;
      f.beginPath(); f.arc(cx, cy, R * (0.13 - k * 0.006), Math.PI, Math.PI * 2); f.stroke();
    }
  }

  // Un œil gravé : paupières en amande, iris hachuré, pupille qui regarde vers le pointeur.
  function oeil(x, y, t, angle, ouvert, gx, gy, grand) {
    if (ouvert <= 0.02) {
      ctx.strokeStyle = trait(0.55); ctx.lineWidth = grand ? 1.1 : 0.8;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(angle) * t, y - Math.sin(angle) * t); ctx.lineTo(x + Math.cos(angle) * t, y + Math.sin(angle) * t); ctx.stroke();
      return;
    }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    var h = t * 0.62 * ouvert;
    ctx.beginPath();
    ctx.moveTo(-t, 0); ctx.quadraticCurveTo(0, -h * 1.6, t, 0); ctx.quadraticCurveTo(0, h * 1.6, -t, 0); ctx.closePath();
    ctx.fillStyle = NUIT; ctx.fill();
    ctx.strokeStyle = trait(0.85); ctx.lineWidth = grand ? 1.3 : 0.8; ctx.stroke();
    ctx.clip();
    // Pupille décalée vers le regard (repère local de l'œil).
    var c = Math.cos(-angle), s = Math.sin(-angle);
    var lx = gx * c - gy * s, ly = gx * s + gy * c;
    var ri = t * 0.5, ox = lx * t * 0.32, oy = ly * h * 0.35;
    ctx.strokeStyle = trait(0.7); ctx.lineWidth = grand ? 0.7 : 0.5;
    var traits = grand ? 48 : 14;
    for (var i = 0; i < traits; i++) {
      var a = (i / traits) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(ox + Math.cos(a) * ri * 0.45, oy + Math.sin(a) * ri * 0.45); ctx.lineTo(ox + Math.cos(a) * ri, oy + Math.sin(a) * ri); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(ox, oy, ri, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(' + ENCRE + ',0.95)';
    ctx.beginPath(); ctx.arc(ox, oy, ri * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = NUIT;
    ctx.beginPath(); ctx.arc(ox - ri * 0.12, oy - ri * 0.12, ri * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function ouverture(o, temps) {
    if (calmes) return 1;
    var e = Math.min(1, Math.max(0, (temps - o.eveil) / 0.45));
    var ouvre = e * e * (3 - 2 * e);
    var phase = (temps - o.eveil) % o.cligne;
    if (temps > o.eveil + 1 && phase < o.duree) ouvre *= Math.abs(Math.cos((phase / o.duree) * Math.PI));
    return ouvre;
  }

  function image(maintenant) {
    var temps = (maintenant - debut) / 1000;
    regard.x += (cible.x - regard.x) * 0.08; regard.y += (cible.y - regard.y) * 0.08;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, toile.width, toile.height);
    ctx.drawImage(fond, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    yeux.forEach(function (o) {
      // Direction du regard vers le pointeur, propre à chaque œil.
      var dx = regard.x - o.x, dy = regard.y - o.y, d = Math.hypot(dx, dy) || 1, f = Math.min(1, d / (R * 0.6));
      oeil(o.x, o.y, o.t, o.a + Math.PI / 2, ouverture(o, temps), dx / d * f, dy / d * f, false);
    });
    var g = { eveil: 0.05, cligne: 9, duree: 0.2 };
    var dx = regard.x - cx, dy = regard.y - (cy - R * 0.02), d = Math.hypot(dx, dy) || 1, f = Math.min(1, d / R);
    oeil(cx, cy - R * 0.02, R * 0.105, 0, ouverture(g, temps), dx / d * f, dy / d * f, true);
    if (!calmes && visible) boucle = requestAnimationFrame(image);
  }

  function relancer() { cancelAnimationFrame(boucle); boucle = requestAnimationFrame(image); }

  construire();
  cible.x = regard.x = cx; cible.y = regard.y = cy - R * 0.6;
  debut = performance.now();
  if (calmes) image(debut + 1e6); else relancer();

  window.addEventListener('pointermove', function (e) {
    var r = toile.getBoundingClientRect();
    cible.x = e.clientX - r.left; cible.y = e.clientY - r.top;
  }, { passive: true });
  var minuteur = 0;
  window.addEventListener('resize', function () {
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { construire(); if (calmes) image(debut + 1e6); }, 150);
  });
  // Hors de l'écran, l'animation s'arrête.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entrees) {
      visible = entrees[0].isIntersecting;
      if (visible && !calmes) relancer();
    }).observe(toile);
  }
})();
