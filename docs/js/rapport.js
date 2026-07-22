// Génération du rapport PDF : une page "Résultats et ambitions" puis une page par domaine
// de la Revue d'impact (sans les ambitions chiffrées, déjà présentes en page 1).
// Pages de dimension fixe (A4 portrait) : le contenu qui ne rentre pas est tronqué dans le
// PDF (le texte complet reste consultable dans l'outil).
import { DOMAINES, TRAME, fmtVal } from "./model.js";
import { consolider } from "./consolidation.js";
import { CAMPAGNE, ANNEE_BILAN } from "./config.js";

const MARGE = 14;
const LARGEUR = 210, HAUTEUR = 297; // A4 portrait, mm
const BAS_PAGE = HAUTEUR - MARGE;
const LARGEUR_UTILE = LARGEUR - 2 * MARGE;

function texteEcart(i, amb, c) {
  if (!c) return "-";
  if (!amb || amb.min == null || amb.min === "" || amb.max == null || amb.max === "") return "non saisi";
  const midAmb = (parseFloat(amb.min) + parseFloat(amb.max)) / 2;
  const midCons = (c.min + c.max) / 2;
  const diff = midAmb - midCons;
  const eps = i.pct ? 0.0005 : 0.5;
  if (Math.abs(diff) <= eps) return "aligné";
  const txt = i.pct ? (diff * 100).toFixed(1).replace(".", ",") + " pt" : Math.round(diff).toLocaleString("fr-FR");
  return (diff > 0 ? "+" : "") + txt;
}

function enTete(doc, ctx, sousTitre) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(`Revue d'impact ${CAMPAGNE}`, MARGE, 18);
  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text(ctx.nom, MARGE, 25);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(sousTitre, MARGE, 31);
  doc.setTextColor(0);
  doc.setDrawColor(200); doc.setLineWidth(0.3);
  doc.line(MARGE, 34, LARGEUR - MARGE, 34);
  return 42;
}

function piedDePage(doc, page, total) {
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`France Travail - Direction de la Performance - page ${page}/${total}`, MARGE, HAUTEUR - 8);
  doc.setTextColor(0);
}

// ---- Page 1 : Résultats et ambitions ----
function pageResultats(doc, ctx, indicateurs, resA1, saisie, estConsolidable, unites) {
  let y = enTete(doc, ctx, "Résultats et ambitions");
  const colX = estConsolidable ? [MARGE, MARGE + 62, MARGE + 96, MARGE + 130, MARGE + 162] : [MARGE, MARGE + 90, MARGE + 130];
  const headers = estConsolidable
    ? ["Indicateur", `Résultat ${ANNEE_BILAN}`, `Ambition ${CAMPAGNE}`, "Consolidé", "Écart"]
    : ["Indicateur", `Résultat ${ANNEE_BILAN}`, `Ambition ${CAMPAGNE}`];

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  headers.forEach((h, i) => doc.text(h, colX[i], y));
  y += 2; doc.setDrawColor(0); doc.line(MARGE, y, LARGEUR - MARGE, y); y += 4.5;
  doc.setFont("helvetica", "normal");

  for (const i of indicateurs) {
    if (y > BAS_PAGE - 6) break; // page fixe : liste tronquée si elle dépasse
    const v1 = resA1 ? resA1[i.id] : null;
    const amb = saisie?.ambitions?.[i.id];
    const ambTxt = amb && amb.min != null && amb.min !== "" ? `${fmtVal(i, amb.min)} - ${fmtVal(i, amb.max)}` : "-";
    doc.text(doc.splitTextToSize(i.label, colX[1] - colX[0] - 2)[0] || i.label, colX[0], y);
    doc.text(v1 != null ? fmtVal(i, v1) : "-", colX[1], y);
    doc.text(ambTxt, colX[2], y);
    if (estConsolidable) {
      const c = i.fourchette ? consolider(i.id, unites) : null;
      doc.text(c ? `${fmtVal(i, c.min)} - ${fmtVal(i, c.max)}` : "-", colX[3], y);
      doc.text(i.fourchette ? texteEcart(i, amb, c) : "n/a", colX[4], y);
    }
    y += 6;
  }
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Résultats seront enrichis de données à mi-parcours pour mesurer l'avancement de la campagne.", MARGE, BAS_PAGE - 2);
  doc.setTextColor(0);
}

// ---- Pages suivantes : une par domaine (Bilan, Stratégie, Leviers, Ressources ; sans les ambitions) ----
function pageDomaine(doc, ctx, domaineDef, saisie) {
  let y = enTete(doc, ctx, domaineDef.nom);
  const q = saisie?.qualitatif?.[domaineDef.id] || {};
  const r = saisie?.ressources?.[domaineDef.id] || {};
  const t = TRAME[domaineDef.id];

  const ecrireItem = (label, texte, maxLignes = 4) => {
    if (y > BAS_PAGE - 10) return false; // plus de place : on arrête d'ajouter des items
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(label, MARGE, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const texteAffiche = (texte || "").trim() || "(non renseigné)";
    let lignes = doc.splitTextToSize(texteAffiche, LARGEUR_UTILE);
    const placeRestante = Math.floor((BAS_PAGE - y) / 4.2);
    const maxAffichable = Math.max(1, Math.min(maxLignes, placeRestante));
    if (lignes.length > maxAffichable) {
      lignes = lignes.slice(0, maxAffichable);
      const derniere = lignes[maxAffichable - 1];
      lignes[maxAffichable - 1] = derniere.slice(0, Math.max(0, derniere.length - 3)) + "...";
    }
    doc.text(lignes, MARGE, y);
    y += lignes.length * 4.2 + 4;
    return true;
  };

  ecrireItem("Réussites (bilan " + ANNEE_BILAN + ")", q.reussites, 6);
  ecrireItem("Axes d'amélioration (bilan " + ANNEE_BILAN + ")", q.axes, 6);
  for (const item of t.strategie) { if (!ecrireItem(item.label, q[item.id])) break; }
  for (const item of t.leviers) { if (!ecrireItem(item.label, q[item.id])) break; }
  if (t.ressources.length && y < BAS_PAGE - 10) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Ressources", MARGE, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    for (const item of t.ressources) {
      if (y > BAS_PAGE - 6) break;
      doc.text(`${item.label} : ${r[item.id] ?? "-"}`, MARGE, y);
      y += 5;
    }
  }
}

export async function genererRapportPDF({ ctx, indicateurs, resA1, saisie, estConsolidable, unites }) {
  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const totalPages = 1 + DOMAINES.length;
  pageResultats(doc, ctx, indicateurs, resA1, saisie, estConsolidable, unites);
  piedDePage(doc, 1, totalPages);

  DOMAINES.forEach((d, idx) => {
    doc.addPage();
    pageDomaine(doc, ctx, d, saisie);
    piedDePage(doc, idx + 2, totalPages);
  });

  const nomFichier = `revue-impact-${CAMPAGNE}-${ctx.code}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
  doc.save(nomFichier);
}
