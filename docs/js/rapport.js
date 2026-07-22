// Génération du rapport PDF : une page "Résultats et ambitions" (tous les indicateurs, toutes
// les colonnes) puis une page par domaine de la Revue d'impact (sans les ambitions chiffrées,
// déjà présentes en page 1). Pages de dimension fixe (A4 portrait) : le contenu qui ne rentre
// pas est tronqué dans le PDF (le texte complet reste consultable dans l'outil).
import { DOMAINES, TRAME, fmtVal } from "./model.js";
import { consolider, valeurAmbition } from "./consolidation.js";
import { CAMPAGNE, ANNEE_BILAN } from "./config.js";

const ANNEE_A2 = String(Number(ANNEE_BILAN) - 1);
const MARGE = 14;
const LARGEUR = 210, HAUTEUR = 297; // A4 portrait, mm
const BAS_PAGE = HAUTEUR - MARGE;
const LARGEUR_UTILE = LARGEUR - 2 * MARGE;

// Palette (alignée sur les tokens du design system France Travail)
const COL = {
  navy: [13, 20, 64],
  indigo: [41, 51, 120],
  gris: [120, 120, 120],
  grisClair: [246, 246, 248],
  vert: [27, 127, 59],
  rouge: [217, 36, 36],
  noir: [20, 20, 20],
  domaine: { violet: [126, 88, 160], bleu: [64, 107, 222], jaune: [180, 130, 0], vert: [27, 127, 59], rouge: [217, 36, 36] },
};

function texteEcart(i, amb, c) {
  if (!c) return { texte: "-", couleur: COL.gris };
  const v = valeurAmbition(amb);
  if (v == null) return { texte: "non saisi", couleur: COL.gris };
  const diff = v - c.valeur;
  const eps = i.pct ? 0.0005 : 0.5;
  if (Math.abs(diff) <= eps) return { texte: "aligné", couleur: COL.vert };
  const txt = i.pct ? (diff * 100).toFixed(1).replace(".", ",") + " pt" : Math.round(diff).toLocaleString("fr-FR");
  return { texte: (diff > 0 ? "+" : "") + txt, couleur: COL.rouge };
}
function valeurAtteinte(i, v1, objectif) {
  if (v1 == null || !objectif) return { texte: "-", couleur: COL.gris };
  const ratio = v1 / objectif;
  const favorable = i.sensInverse ? ratio <= 1 : ratio >= 1;
  return { texte: `${(ratio * 100).toFixed(0)} %`, couleur: favorable ? COL.vert : COL.rouge };
}
function valeurEvolution(i, v1, v2) {
  if (v1 == null || v2 == null) return { texte: "-", couleur: COL.gris };
  const delta = v1 - v2;
  const favorable = i.sensInverse ? delta <= 0 : delta >= 0;
  const txt = i.pct ? (delta * 100).toFixed(1).replace(".", ",") + " pt" : Math.round(delta).toLocaleString("fr-FR");
  return { texte: (delta > 0 ? "+" : "") + txt, couleur: favorable ? COL.vert : COL.rouge };
}

function setCouleur(doc, rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

function enTete(doc, ctx, sousTitre, sousTitreCouleur) {
  setCouleur(doc, COL.navy);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(`Revue d'impact ${CAMPAGNE}`, MARGE, 18);
  setCouleur(doc, COL.indigo);
  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text(ctx.nom, MARGE, 25);
  setCouleur(doc, sousTitreCouleur || COL.gris);
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text(sousTitre, MARGE, 31);
  setCouleur(doc, COL.noir);
  doc.setDrawColor(...COL.navy); doc.setLineWidth(0.6);
  doc.line(MARGE, 34, LARGEUR - MARGE, 34);
  return 42;
}

function piedDePage(doc, page, total) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  setCouleur(doc, COL.gris);
  doc.text(`France Travail - Direction de la Performance - page ${page}/${total}`, MARGE, HAUTEUR - 8);
  setCouleur(doc, COL.noir);
}

// Écrit un en-tête de colonne sur 1 ou 2 lignes (pour des colonnes étroites).
function enteteColonne(doc, texte, x, largeur, y) {
  const lignes = doc.splitTextToSize(texte, largeur - 1);
  doc.text(lignes.slice(0, 2), x, y);
}

// ---- Page 1 : Résultats et ambitions (tous les indicateurs, toutes les colonnes) ----
function pageResultats(doc, ctx, indicateurs, resA1, resA2, cibles, saisie, estConsolidable, unites, poidsPropre) {
  let y = enTete(doc, ctx, "Résultats et ambitions", COL.indigo);

  const largeurs = [40, 15, 17, 17, 17, 17, 17, 14, 18];
  const colX = []; { let x = MARGE; for (const l of largeurs) { colX.push(x); x += l; } }
  const headers = [
    "Indicateur",
    `Résultat ${ANNEE_BILAN}`,
    `Taux d'atteinte objectif ${ANNEE_BILAN}`,
    `Évolution / ${ANNEE_A2}`,
    `Cible nationale ${CAMPAGNE}`,
    `Ambition ${CAMPAGNE}`,
    "Consolidé",
    "Couverture",
    "Écart ambition / consolidé",
  ];

  doc.setFillColor(...COL.navy);
  doc.rect(MARGE, y - 5, LARGEUR_UTILE, 11, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.8);
  doc.setTextColor(255, 255, 255);
  headers.forEach((h, i) => enteteColonne(doc, h, colX[i] + 1, largeurs[i], y - 1));
  y += 9;
  setCouleur(doc, COL.noir);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.6);

  let ligneImpaire = false;
  for (const i of indicateurs) {
    if (y > BAS_PAGE - 20) break; // page fixe : liste tronquée si elle dépasse (la pondération doit rester visible)
    if (ligneImpaire) { doc.setFillColor(...COL.grisClair); doc.rect(MARGE, y - 4, LARGEUR_UTILE, 6, "F"); }
    ligneImpaire = !ligneImpaire;

    const v1 = resA1 ? resA1[i.id] : null;
    const v2 = resA2 ? resA2[i.id] : null;
    const objectif = resA1 ? resA1[`${i.id}_OBJ`] : null;
    const cible = cibles?.[i.id];
    const amb = saisie?.ambitions?.[i.id];
    const valAmb = valeurAmbition(amb);
    const c = estConsolidable && i.fourchette ? consolider(i.id, unites) : null;
    const atteinte = valeurAtteinte(i, v1, objectif);
    const evolution = valeurEvolution(i, v1, v2);
    const ecart = estConsolidable ? (i.fourchette ? texteEcart(i, amb, c) : { texte: "n/a", couleur: COL.gris }) : { texte: "-", couleur: COL.gris };

    setCouleur(doc, COL.noir);
    doc.text(doc.splitTextToSize(i.label, largeurs[0] - 2)[0] || i.label, colX[0] + 1, y);
    doc.text(v1 != null ? fmtVal(i, v1) : "-", colX[1] + 1, y);
    setCouleur(doc, atteinte.couleur); doc.text(atteinte.texte, colX[2] + 1, y);
    setCouleur(doc, evolution.couleur); doc.text(evolution.texte, colX[3] + 1, y);
    setCouleur(doc, COL.noir); doc.text(cible != null ? fmtVal(i, cible) : "-", colX[4] + 1, y);
    doc.text(valAmb != null ? fmtVal(i, valAmb) : "-", colX[5] + 1, y);
    doc.text(estConsolidable && c ? fmtVal(i, c.valeur) : "-", colX[6] + 1, y);
    doc.text(estConsolidable && c ? Math.round(c.couverture * 100) + " %" : "-", colX[7] + 1, y);
    setCouleur(doc, ecart.couleur); doc.text(ecart.texte, colX[8] + 1, y);
    setCouleur(doc, COL.noir);
    y += 6;
  }

  // Pondération utilisée pour la consolidation (poids propre de cette structure dans le niveau supérieur)
  y += 4;
  doc.setDrawColor(...COL.gris); doc.setLineWidth(0.2);
  doc.line(MARGE, y - 3, LARGEUR - MARGE, y - 3);
  setCouleur(doc, COL.indigo); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("Pondération utilisée pour la consolidation", MARGE, y + 3);
  y += 8;
  setCouleur(doc, COL.gris); doc.setFont("helvetica", "italic"); doc.setFontSize(7);
  doc.text("Ce coefficient mesure la contribution de cette structure aux résultats consolidés de l'échelon supérieur : plus il est élevé, plus son résultat pèse dans la moyenne pondérée.", MARGE, y);
  y += 5;
  setCouleur(doc, COL.noir); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  if (!poidsPropre) {
    setCouleur(doc, COL.gris);
    doc.text("Non applicable à ce niveau (aucune consolidation vers un échelon supérieur).", MARGE, y);
  } else if (poidsPropre._global !== undefined) {
    doc.text(`Poids approximatif de cette région dans la consolidation nationale : ${(poidsPropre._global * 100).toFixed(1)} % (approximé par la part du nombre d'agences).`, MARGE, y);
  } else {
    const parts = indicateurs.filter(i => i.fourchette && poidsPropre[i.id] != null)
      .map(i => `${i.label} : ${(poidsPropre[i.id] * 100).toFixed(1)} %`);
    const ligne = parts.join("   ·   ");
    const lignes = doc.splitTextToSize(ligne, LARGEUR_UTILE);
    doc.text(lignes.slice(0, 3), MARGE, y);
  }
}

// ---- Pages suivantes : une par domaine (Bilan, Stratégie, Leviers, Ressources ; sans les ambitions) ----
function pageDomaine(doc, ctx, domaineDef, saisie) {
  const couleurTitre = COL.domaine[domaineDef.couleur] || COL.indigo;
  let y = enTete(doc, ctx, domaineDef.nom, couleurTitre);
  const q = saisie?.qualitatif?.[domaineDef.id] || {};
  const r = saisie?.ressources?.[domaineDef.id] || {};
  const t = TRAME[domaineDef.id];

  const ecrireItem = (label, texte, maxLignes = 4) => {
    if (y > BAS_PAGE - 10) return false; // plus de place : on arrête d'ajouter des items
    setCouleur(doc, couleurTitre);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(label, MARGE, y); y += 5;
    setCouleur(doc, COL.noir);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const texteAffiche = (texte || "").trim() || "(non renseigné)";
    if (!texte || !texte.trim()) setCouleur(doc, COL.gris);
    let lignes = doc.splitTextToSize(texteAffiche, LARGEUR_UTILE);
    const placeRestante = Math.floor((BAS_PAGE - y) / 4.2);
    const maxAffichable = Math.max(1, Math.min(maxLignes, placeRestante));
    if (lignes.length > maxAffichable) {
      lignes = lignes.slice(0, maxAffichable);
      const derniere = lignes[maxAffichable - 1];
      lignes[maxAffichable - 1] = derniere.slice(0, Math.max(0, derniere.length - 3)) + "...";
    }
    doc.text(lignes, MARGE, y);
    setCouleur(doc, COL.noir);
    y += lignes.length * 4.2 + 4;
    return true;
  };

  ecrireItem("Réussites (bilan " + ANNEE_BILAN + ")", q.reussites, 6);
  ecrireItem("Axes d'amélioration (bilan " + ANNEE_BILAN + ")", q.axes, 6);
  for (const item of t.strategie) { if (!ecrireItem(item.label, q[item.id])) break; }
  for (const item of t.leviers) { if (!ecrireItem(item.label, q[item.id])) break; }
  if (t.ressources.length && y < BAS_PAGE - 10) {
    setCouleur(doc, couleurTitre);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Ressources", MARGE, y); y += 5;
    setCouleur(doc, COL.noir);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    for (const item of t.ressources) {
      if (y > BAS_PAGE - 6) break;
      doc.text(`${item.label} : ${r[item.id] ?? "-"}`, MARGE, y);
      y += 5;
    }
  }
}

export async function genererRapportPDF({ ctx, indicateurs, resA1, resA2, cibles, saisie, estConsolidable, unites, poidsPropre }) {
  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const totalPages = 1 + DOMAINES.length;
  pageResultats(doc, ctx, indicateurs, resA1, resA2, cibles, saisie, estConsolidable, unites, poidsPropre);
  piedDePage(doc, 1, totalPages);

  DOMAINES.forEach((d, idx) => {
    doc.addPage();
    pageDomaine(doc, ctx, d, saisie);
    piedDePage(doc, idx + 2, totalPages);
  });

  const nomFichier = `revue-impact-${CAMPAGNE}-${ctx.code}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
  doc.save(nomFichier);
}
