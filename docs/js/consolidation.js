// Consolidation ascendante Agences -> DD -> Région -> National.
// Règles :
//  - indicateurs de type "taux"  : moyenne pondérée par les poids issus du fichier de pondération
//    (dénominateurs de chaque indicateur) ; poids agence = part dans la DD, poids DD = part dans la région.
//  - indicateurs de type "volume" (DELD, intensif, immersions, prospections) : somme simple.
//  - région -> national : pondération = part de la région dans la somme nationale des poids DD
//    (approximation en l'absence de dénominateurs nationaux dans le fichier source).
import { INDICATEURS } from "./model.js";

const IND_BY_ID = Object.fromEntries(INDICATEURS.map(i => [i.id, i]));
// Correspondance ambition -> colonne de poids du fichier (les volumes n'en ont pas besoin)
const POIDS_KEY = { INTENSIF: "DEMAR", IMMERSIONS: "TAE", PROSPEC: "ENT_PLUS" };

// Lit la valeur d'une ambition. Compatible avec les anciennes remontées (Min/Max) importées
// avant le passage à la valeur unique : dans ce cas, la moyenne du Min et du Max est utilisée.
export function valeurAmbition(a) {
  if (!a) return null;
  if (a.valeur !== undefined && a.valeur !== null && a.valeur !== "") return parseFloat(a.valeur);
  if (a.min != null && a.min !== "" && a.max != null && a.max !== "") return (parseFloat(a.min) + parseFloat(a.max)) / 2;
  if (a.min != null && a.min !== "") return parseFloat(a.min);
  if (a.max != null && a.max !== "") return parseFloat(a.max);
  return null;
}

function getAmb(saisie, indId) {
  return valeurAmbition(saisie?.ambitions?.[indId]);
}

// Consolide une liste d'unités { poids: {IND:w}, saisie } pour un indicateur.
// Retourne { valeur, couverture } : couverture = part des poids ayant une saisie.
export function consolider(indId, unites) {
  const ind = IND_BY_ID[indId];
  const wKey = POIDS_KEY[indId] || indId;
  if (ind.type === "volume") {
    let total = 0, n = 0;
    for (const u of unites) {
      const v = getAmb(u.saisie, indId);
      if (v == null) continue;
      total += v;
      n++;
    }
    return n ? { valeur: total, couverture: n / unites.length } : null;
  }
  let somme = 0, wTot = 0, wSaisi = 0;
  for (const u of unites) {
    const w = u.poids?.[wKey] ?? 0;
    wTot += w;
    const v = getAmb(u.saisie, indId);
    if (v == null || !w) continue;
    somme += v * w;
    wSaisi += w;
  }
  if (!wSaisi) return null;
  return { valeur: somme / wSaisi, couverture: wTot ? wSaisi / wTot : 0 };
}

// Agrège les textes qualitatifs (réussites / axes) d'une liste de saisies.
export function compilerTextes(saisies, domaine, champ) {
  const out = [];
  for (const s of saisies) {
    const t = s?.qualitatif?.[domaine]?.[champ];
    if (t && t.trim()) out.push({ nom: s.nomStructure || s.code, texte: t.trim() });
  }
  return out;
}

// Poids d'une région dans le national ≈ somme des poids DD ramenée au total (chaque région somme à 1 → uniforme sinon).
export function poidsRegions(referentiel) {
  // approximation : part du nombre d'agences (documentée dans l'aide à la lecture)
  const total = referentiel.agences.length;
  const parRegion = {};
  for (const a of referentiel.agences) parRegion[a.region] = (parRegion[a.region] || 0) + 1;
  const out = {};
  for (const [r, n] of Object.entries(parRegion)) out[r] = n / total;
  return out;
}

// Moyenne pondérée d'un résultat brut (pas une ambition) sur un ensemble de pairs.
// pairs: [{ poids: {IND:w}, valeur: number|null }]
export function moyennePairs(indId, pairs) {
  let somme = 0, poidsTot = 0;
  for (const p of pairs) {
    const w = p.poids?.[indId] ?? 0;
    if (p.valeur == null || !w) continue;
    somme += p.valeur * w;
    poidsTot += w;
  }
  return poidsTot ? somme / poidsTot : null;
}
