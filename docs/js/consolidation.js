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

function getAmb(saisie, indId) {
  const a = saisie?.ambitions?.[indId];
  if (!a) return null;
  const min = parseFloat(a.min), max = parseFloat(a.max);
  if (isNaN(min) && isNaN(max)) return null;
  return { min: isNaN(min) ? null : min, max: isNaN(max) ? null : max };
}

// Consolide une liste d'unités { poids: {IND:w}, saisie } pour un indicateur.
// Retourne { min, max, couverture } — couverture = part des poids ayant une saisie.
export function consolider(indId, unites) {
  const ind = IND_BY_ID[indId];
  const wKey = POIDS_KEY[indId] || indId;
  if (ind.type === "volume") {
    let min = 0, max = 0, n = 0;
    for (const u of unites) {
      const a = getAmb(u.saisie, indId);
      if (!a) continue;
      min += a.min ?? a.max ?? 0;
      max += a.max ?? a.min ?? 0;
      n++;
    }
    return n ? { min, max, couverture: n / unites.length } : null;
  }
  let sMin = 0, sMax = 0, wTot = 0, wSaisi = 0;
  for (const u of unites) {
    const w = u.poids?.[wKey] ?? 0;
    wTot += w;
    const a = getAmb(u.saisie, indId);
    if (!a || !w) continue;
    sMin += (a.min ?? a.max) * w;
    sMax += (a.max ?? a.min) * w;
    wSaisi += w;
  }
  if (!wSaisi) return null;
  return { min: sMin / wSaisi, max: sMax / wSaisi, couverture: wTot ? wSaisi / wTot : 0 };
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
