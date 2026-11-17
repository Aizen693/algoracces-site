// Veille privée : tout ce qui parle à la base de données.
// On réutilise le client Supabase déjà ouvert par shared/site-auth.js (window.algorAuth.supabase),
// donc la session de l'abonné. Le cloisonnement n'est PAS fait ici : il est fait en base
// par les politiques RLS (chaque requête ne voit que les lignes du compte connecté).

const TAILLE_PAQUET = 500;   // lignes envoyées par requête

// Attend que site-auth.js ait créé le client (10 secondes au plus).
export async function client() {
  for (let i = 0; i < 40; i++) {
    const c = window.algorAuth && window.algorAuth.supabase;
    if (c) return c;
    await new Promise((ok) => setTimeout(ok, 250));
  }
  return null;
}

// Rend { session, abonne } : qui est connecté, et a-t-il l'abonnement.
// Même règle que la base : plan premium, ou membre de l'équipe.
export async function compte(c) {
  const { data } = await c.auth.getSession();
  const session = data && data.session;
  if (!session) return { session: null, abonne: false };
  const { data: profil } = await c.from('profiles').select('role, plan').eq('id', session.user.id).maybeSingle();
  const abonne = !!profil && (profil.plan === 'premium' || profil.role === 'admin' || profil.role === 'editor');
  return { session, abonne };
}

// Traduit une erreur de la base en phrase lisible.
export function messageErreur(erreur) {
  const t = (erreur && (erreur.message || '')) + ' ' + (erreur && (erreur.hint || ''));
  if (t.includes('PLAFOND_BASES')) return 'Vous avez atteint le plafond de 3 bases. Supprimez une base pour en créer une nouvelle.';
  if (t.includes('PLAFOND_LIGNES')) return 'Cette base dépasserait 20 000 lignes. Réduisez le fichier, ou choisissez de remplacer le contenu.';
  if (t.includes('PLAFOND_VUES')) return 'Vous avez atteint le plafond de 20 vues pour cette base.';
  if (erreur && erreur.code === '23505') return 'Une entrée identique existe déjà dans cette base.';
  if (erreur && (erreur.code === '42501' || erreur.code === 'PGRST301')) return 'Cette action est réservée aux abonnés.';
  return 'Le service est indisponible pour le moment. Réessayez dans un instant.';
}

// Les bases du compte, avec leur nombre de lignes.
export async function listerBases(c) {
  const { data, error } = await c.from('veille_privee_bases')
    .select('id, nom, colonnes, cree_le, maj_le, veille_privee_lignes(count)')
    .order('cree_le', { ascending: true });
  if (error) throw error;
  return data.map((b) => ({ id: b.id, nom: b.nom, colonnes: b.colonnes, cree_le: b.cree_le, maj_le: b.maj_le,
    lignes: (b.veille_privee_lignes && b.veille_privee_lignes[0] && b.veille_privee_lignes[0].count) || 0 }));
}

export async function creerBase(c, nom, colonnes) {
  const { data, error } = await c.from('veille_privee_bases').insert({ nom, colonnes }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function renommerBase(c, id, nom) {
  const { error } = await c.from('veille_privee_bases').update({ nom }).eq('id', id);
  if (error) throw error;
}

export async function enregistrerColonnes(c, id, colonnes) {
  const { error } = await c.from('veille_privee_bases').update({ colonnes }).eq('id', id);
  if (error) throw error;
}

// Supprimer une base supprime réellement ses lignes et ses vues (cascade en base).
export async function supprimerBase(c, id) {
  const { error } = await c.from('veille_privee_bases').delete().eq('id', id);
  if (error) throw error;
}

// Mise à jour en mode « remplacer », première moitié : retirer de la base les lignes
// qui ne sont plus dans le nouveau fichier. empreintesGardees = Set des empreintes du fichier.
// Les lignes communes aux deux ne sont jamais effacées : si la connexion coupe en route,
// rien de ce que le client voulait garder n'est perdu, il suffit de relancer l'import.
// Rend le nombre de lignes retirées.
export async function retirerLignesAbsentes(c, baseId, empreintesGardees) {
  // 1. Lire les empreintes présentes, par pages de 1000 (plafond de l'API par requête).
  const aRetirer = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await c.from('veille_privee_lignes').select('id, empreinte')
      .eq('base_id', baseId).order('id', { ascending: true }).range(debut, debut + 999);
    if (error) throw error;
    for (const l of data) if (!empreintesGardees.has(l.empreinte)) aRetirer.push(l.id);
    if (data.length < 1000) break;
  }
  // 2. Les effacer par paquets (une adresse de requête ne peut pas porter 20 000 identifiants).
  for (let i = 0; i < aRetirer.length; i += 200) {
    const { error } = await c.from('veille_privee_lignes').delete().eq('base_id', baseId).in('id', aRetirer.slice(i, i + 200));
    if (error) throw error;
  }
  return aRetirer.length;
}

// Envoie les entrées par paquets. Une entrée déjà présente dans la base (même empreinte)
// est ignorée : c'est la détection des doublons à la mise à jour.
// suivi(faites, total) est appelé après chaque paquet. Rend { ajoutees, dejaPresentes }.
export async function envoyerLignes(c, baseId, entrees, suivi) {
  let ajoutees = 0;
  for (let i = 0; i < entrees.length; i += TAILLE_PAQUET) {
    const paquet = entrees.slice(i, i + TAILLE_PAQUET).map((e) => ({ ...e, base_id: baseId }));
    const { data, error } = await c.from('veille_privee_lignes')
      .upsert(paquet, { onConflict: 'base_id,empreinte', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    ajoutees += data.length;
    if (suivi) suivi(Math.min(i + TAILLE_PAQUET, entrees.length), entrees.length);
  }
  return { ajoutees, dejaPresentes: entrees.length - ajoutees };
}

// Lit une page de lignes d'une base, les plus récentes d'abord.
export async function lireLignes(c, baseId, debut, nombre) {
  const { data, error } = await c.from('veille_privee_lignes')
    .select('id, titre, date_evt, lieu, pays, lat, lon, precision_geo, categorie, source, url, description, gravite, libres')
    .eq('base_id', baseId)
    .order('date_evt', { ascending: false, nullsFirst: false }).order('id', { ascending: true })
    .range(debut, debut + nombre - 1);
  if (error) throw error;
  return data;
}

// Lit TOUTES les lignes d'une base, par pages de 1000 (plafond de l'API par requête).
// suivi(lues) est appelé après chaque page.
export async function lireToutesLignes(c, baseId, suivi) {
  const toutes = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await c.from('veille_privee_lignes')
      .select('id, titre, date_evt, lieu, pays, lat, lon, precision_geo, categorie, source, url, description, gravite, libres')
      .eq('base_id', baseId).order('id', { ascending: true }).range(debut, debut + 999);
    if (error) throw error;
    toutes.push(...data);
    if (suivi) suivi(toutes.length);
    if (data.length < 1000) break;
  }
  return toutes;
}

// ------------------------------------------------------------ Entrées à la main
const CHAMPS_LIGNE = 'id, titre, date_evt, lieu, pays, lat, lon, precision_geo, categorie, source, url, description, gravite, libres';

export async function ajouterLigne(c, baseId, entree) {
  const { data, error } = await c.from('veille_privee_lignes').insert({ ...entree, base_id: baseId }).select(CHAMPS_LIGNE).single();
  if (error) throw error;
  return data;
}

export async function modifierLigne(c, id, entree) {
  const { data, error } = await c.from('veille_privee_lignes').update(entree).eq('id', id).select(CHAMPS_LIGNE).single();
  if (error) throw error;
  return data;
}

export async function supprimerLigne(c, id) {
  const { error } = await c.from('veille_privee_lignes').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------ Vues enregistrées
export async function listerVues(c, baseId) {
  const { data, error } = await c.from('veille_privee_vues').select('id, nom, filtres').eq('base_id', baseId).order('cree_le', { ascending: true });
  if (error) throw error;
  return data;
}

export async function creerVue(c, baseId, nom, filtres) {
  const { data, error } = await c.from('veille_privee_vues').insert({ base_id: baseId, nom, filtres }).select('id, nom, filtres').single();
  if (error) throw error;
  return data;
}

export async function supprimerVue(c, id) {
  const { error } = await c.from('veille_privee_vues').delete().eq('id', id);
  if (error) throw error;
}

// Date à laquelle les bases du compte connecté seront effacées (12 mois après la fin de l'abonnement).
// Rend une date au format AAAA-MM-JJ, ou null si le compte est abonné ou si la date n'est pas connue.
export async function echeance(c) {
  const { data, error } = await c.rpc('veille_privee_echeance');
  if (error || !data) return null;
  return String(data).slice(0, 10);
}
