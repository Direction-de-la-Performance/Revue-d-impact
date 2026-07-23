import { INDICATEURS, DOMAINES, TRAME, AMBITIONS_PAR_DOMAINE, MAX_CHARS, fmtVal } from "./model.js";
import { initFirebase, waitForAuthReady, signInShared, signOutShared, isAdmin, getReferentiel, loadSaisie, saveSaisie, loadSaisies, loadHistorique, loadResultats, saveResultats, deleteResultats, deleteSaisieComplete, loadCibles, saveCibles, DEMO } from "./store.js";
import { consolider, poidsRegions, moyennePairs, valeurAmbition } from "./consolidation.js";
import { genererRapportPDF } from "./rapport.js";
import { CAMPAGNE, ANNEE_BILAN } from "./config.js";

const IND = Object.fromEntries(INDICATEURS.map(i => [i.id, i]));
const ANNEE_A2 = String(Number(ANNEE_BILAN) - 1);
const $ = s => document.querySelector(s);
const app = $("#app");
let REF = null;

// ---- Contexte de navigation (structure sélectionnée) ----
const ctx = JSON.parse(localStorage.getItem("ctx") || '{"niveau":"","code":"","nom":""}');
function setCtx(niveau, code, nom, extra = {}) {
  Object.assign(ctx, { niveau, code, nom }, extra);
  localStorage.setItem("ctx", JSON.stringify(ctx));
  renderCtx();
}
function renderCtx() {
  const lbl = { NAT:"Direction Générale", REG:"Direction Régionale", DD:"Direction Départementale", APE:"Agence" };
  $("#ctx-structure").innerHTML = ctx.code
    ? `<div class="ctx-line" id="ctx-changer" title="Cliquer pour changer de structure"><span class="ctx-niveau">${esc(lbl[ctx.niveau] || "")}</span><b>${esc(ctx.nom)}</b></div>
       <div class="ctx-line">${DEMO ? '<span class="badge badge--jaune">mode démo</span>' : '<button class="btn btn--secondary" id="btn-logout" style="padding:2px 10px;font-size:11px">Se déconnecter</button>'}</div>`
    : (DEMO ? '<span class="badge badge--jaune">mode démo - données locales</span>' : "");
  $("#btn-logout")?.addEventListener("click", async (e) => { e.stopPropagation(); await signOutShared(); location.reload(); });
  $("#ctx-changer")?.addEventListener("click", () => nav("accueil"));
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); }
function toastErreur(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show", "toast--erreur"); setTimeout(() => t.classList.remove("show", "toast--erreur"), 7000); }
const MSG_ERREUR_SAISIE = "Une erreur est survenue lors de l'enregistrement. Vos données n'ont peut-être pas été sauvegardées : contactez l'administrateur du site pour vérifier vos données ou procéder à une restauration si nécessaire.";

// Bandeau flottant : territoire sélectionné + page + (optionnel) bloc actif.
function stickyBarHtml(page, bloc) {
  return `<div class="sticky-context">
    ${ctx.code ? `<span>📍 <b>${esc(ctx.nom)}</b></span><span class="sep">·</span>` : ""}
    <span>${esc(page)}</span>
    ${bloc ? `<span class="sep">·</span><span id="bloc-actif">${esc(bloc)}</span>` : ""}
  </div>`;
}

// ---- Router ----
const views = { accueil: viewAccueil, resultats: viewResultats, revue: viewRevue };
let scrollCleanup = null;
let vueActuelle = "accueil";
let formModifie = false;

function demanderSauvegardeAvantDeQuitter(onQuitter) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
  <div class="modal-card" style="max-width:480px">
    <div class="modal-card__header"><h2>Modifications non enregistrées</h2></div>
    <div class="modal-card__body"><p>Votre remontée contient des modifications qui n'ont pas été enregistrées. Voulez-vous les enregistrer avant de continuer ?</p></div>
    <div class="modal-card__footer">
      <button class="btn btn--secondary" id="quitter-sans-save">Quitter sans enregistrer</button>
      <button class="btn btn--primary" id="revenir-save">Enregistrer mes modifications</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#quitter-sans-save").addEventListener("click", () => { overlay.remove(); formModifie = false; onQuitter(); });
  overlay.querySelector("#revenir-save").addEventListener("click", () => {
    overlay.remove();
    const bloc = [...document.querySelectorAll("details.fold")].find(d => d.dataset.bloc?.startsWith("Ambitions"));
    if (bloc) bloc.open = true;
    const email = document.querySelector("#email-auteur");
    if (email) { email.scrollIntoView({ behavior: "smooth", block: "center" }); email.focus(); }
  });
}

function nav(v) {
  const executerNav = () => {
    if (scrollCleanup) { scrollCleanup(); scrollCleanup = null; }
    vueActuelle = v;
    document.querySelectorAll(".step").forEach(b => b.classList.toggle("active", b.dataset.view === v));
    app.innerHTML = '<div class="card">Chargement…</div>';
    views[v]().catch(e => { app.innerHTML = `<div class="card">Erreur : ${esc(e.message)}</div>`; console.error(e); });
  };
  if (vueActuelle === "revue" && v !== "revue" && formModifie) {
    demanderSauvegardeAvantDeQuitter(executerNav);
  } else {
    executerNav();
  }
}
document.querySelectorAll(".step").forEach(b => b.addEventListener("click", () => nav(b.dataset.view)));

// Génère le rapport PDF pour la structure actuellement sélectionnée (rassemble lui-même
// toutes les données nécessaires) — réutilisable depuis n'importe quelle page.
async function telechargerRapport(bouton) {
  const libelleInitial = bouton.textContent;
  bouton.disabled = true; bouton.textContent = "Génération…";
  try {
    const [resA1, resA2, saisie, cibles] = await Promise.all([
      getRes(ANNEE_BILAN, ctx.code),
      getRes(ANNEE_A2, ctx.code),
      loadSaisie(ctx.code),
      loadCibles(),
    ]);
    const estConsolidable = ctx.niveau !== "APE";
    let unites = [];
    if (estConsolidable) ({ unites } = await chargerUnitesConsolidation());
    let poidsPropre = null;
    if (ctx.niveau === "APE") poidsPropre = REF.agences.find(a => a.code === ctx.code)?.poids || null;
    else if (ctx.niveau === "DD") poidsPropre = REF.dds.find(d => d.code === ctx.code)?.poids || null;
    else if (ctx.niveau === "REG") poidsPropre = { _global: poidsRegions(REF)[ctx.region] || 0 };
    await genererRapportPDF({ ctx, indicateurs: INDICATEURS, resA1, resA2, cibles, saisie, estConsolidable, unites, poidsPropre });
  } catch (e) {
    console.error(e);
    toastErreur("Impossible de générer le rapport PDF pour le moment. Réessayez, ou contactez l'administrateur du site si le problème persiste.");
  }
  bouton.disabled = false; bouton.textContent = libelleInitial;
}

function demanderConfirmation(titre, message, texteBouton, onConfirmer) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
  <div class="modal-card" style="max-width:480px">
    <div class="modal-card__header"><h2>${esc(titre)}</h2></div>
    <div class="modal-card__body"><p>${message}</p></div>
    <div class="modal-card__footer">
      <button class="btn btn--secondary" id="conf-annuler">Annuler</button>
      <button class="btn btn--primary" id="conf-ok">${esc(texteBouton)}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#conf-annuler").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#conf-ok").addEventListener("click", () => { overlay.remove(); onConfirmer(); });
}

// ---- Vue Accueil ----
async function viewAccueil() {
  const regions = REF.regions;
  app.innerHTML = `
  ${stickyBarHtml("Accueil")}
  <div class="card card--accent">
    <h1>Revue d'impact : campagne ${CAMPAGNE}</h1>
    <p>La revue d'impact instaure un <b>dialogue de performance ascendant</b> : chaque niveau (Agence, Direction Départementale, Direction Régionale, Direction Générale) échange sur ses résultats, ses réussites et ses difficultés, puis définit des <b>objectifs SMART</b> pour l'année suivante. Les ambitions des agences sont consolidées par pondération jusqu'au niveau national, puis comparées aux objectifs des financeurs. En cas d'écart, un dialogue de réajustement s'engage.</p>
    <div class="grid grid-3" style="margin-top:16px">
      <div class="card" style="margin:0"><h3>Résultats et ambitions</h3><p class="muted">Repères ${ANNEE_BILAN}, atteinte des objectifs, évolution, comparaison aux pairs et à la cible nationale ${CAMPAGNE}.</p></div>
      <div class="card" style="margin:0"><h3>Revue d'impact</h3><p class="muted">Remontée des réussites, difficultés et ambitions ${CAMPAGNE}, et consolidation ascendante.</p></div>
    </div>
  </div>
  <div class="card">
    <h2>Sélectionner votre structure</h2>
    <div class="help"><b>Aide à la lecture.</b> La structure sélectionnée détermine la maille des deux onglets suivants. Les fourchettes proposées doivent rester raisonnables : ± 0,5 pt sur TAE, ± 2 pts sur DYN ou SATIS. CDALb, DPO et DEMAR sont fixés nationalement, sans fourchette locale.</div>
    <div class="grid grid-3">
      <div class="field"><label for="sel-niveau">Niveau</label>
        <select id="sel-niveau">
          <option value="">-</option>
          <option value="NAT">Direction Générale (national)</option>
          <option value="REG">Direction Régionale</option>
          <option value="DD">Direction Départementale</option>
          <option value="APE">Agence</option>
        </select></div>
      <div class="field" id="f-region" hidden><label for="sel-region">Région</label><select id="sel-region"></select></div>
      <div class="field" id="f-dd" hidden><label for="sel-dd">Direction Départementale</label><select id="sel-dd"></select></div>
      <div class="field" id="f-ape" hidden><label for="sel-ape">Agence</label><select id="sel-ape"></select></div>
    </div>
    <button class="btn btn--primary" id="btn-go">Accéder aux résultats</button>
    <button class="btn btn--secondary" id="btn-go-revue">Aller à la revue d'impact</button>
    <button class="btn btn--secondary" id="btn-go-pdf">Télécharger le rapport PDF</button>
  </div>
  <div class="card">
    <h2>Cadrage général ${CAMPAGNE}</h2>
    <p>L'ambition est d'établir un dialogue ascendant et de valoriser la performance collective, en favorisant la coopération plutôt que la compétition. Orientations stratégiques : renforcer l'accompagnement personnalisé (660 000 entrées en accompagnement intensif, dont 30 % de bénéficiaires du RSA), intensifier la relation entreprise (500 000 prospections), sécuriser financièrement les usagers, améliorer la performance sociale et intégrer la démarche RSE.</p>
  </div>
  ${isAdmin() ? `
  <div class="card card--accent">
    <h2>Administration</h2>
    <p class="muted">Visible uniquement par le compte administrateur.</p>
    <div class="grid grid-3">
      <a class="card" style="margin:0;text-decoration:none;color:inherit;display:block" href="admin-import-referentiel.html">
        <h3>Référentiel</h3><p class="muted">Importer ou mettre à jour les agences, DD et pondérations.</p>
      </a>
      <a class="card" style="margin:0;text-decoration:none;color:inherit;display:block" href="admin-import.html">
        <h3>Résultats N-1</h3><p class="muted">Importer les résultats chiffrés de l'année de bilan.</p>
      </a>
      <a class="card" style="margin:0;text-decoration:none;color:inherit;display:block" href="admin-import-saisies.html">
        <h3>Remontées existantes</h3><p class="muted">Importer des remontées déjà saisies (bilan, ambitions).</p>
      </a>
    </div>
    <div class="help" style="margin-top:16px">Les deux actions ci-dessous portent sur la <b>structure actuellement sélectionnée</b>${ctx.code ? ` (<b>${esc(ctx.nom)}</b>)` : ""} et ses unités directement rattachées (une seule maille en-dessous). Sélectionnez d'abord une structure si besoin.</div>
    <div class="toolbar">
      <button class="btn btn--secondary" id="btn-donnees-fictives">Générer des données fictives</button>
      <button class="btn btn--secondary" id="btn-reset-donnees">Réinitialiser les données</button>
    </div>
  </div>` : ""}`;

  const selN = $("#sel-niveau"), selR = $("#sel-region"), selD = $("#sel-dd"), selA = $("#sel-ape");
  selR.innerHTML = '<option value="">-</option>' + regions.map(r => `<option>${esc(r)}</option>`).join("");
  selN.addEventListener("change", () => {
    $("#f-region").hidden = !["REG","DD","APE"].includes(selN.value);
    $("#f-dd").hidden = !["DD","APE"].includes(selN.value);
    $("#f-ape").hidden = selN.value !== "APE";
  });
  selR.addEventListener("change", () => {
    const dds = REF.dds.filter(d => d.region === selR.value);
    selD.innerHTML = '<option value="">-</option>' + dds.map(d => `<option value="${esc(d.code)}">${esc(d.nom)}</option>`).join("");
    selA.innerHTML = "";
  });
  selD.addEventListener("change", () => {
    const apes = REF.agences.filter(a => a.codeDD === selD.value);
    selA.innerHTML = '<option value="">-</option>' + apes.map(a => `<option value="${esc(a.code)}">${esc(a.nom)}</option>`).join("");
  });
  if (ctx.niveau) { selN.value = ctx.niveau; selN.dispatchEvent(new Event("change")); }
  if (ctx.region) { selR.value = ctx.region; selR.dispatchEvent(new Event("change")); }
  if (ctx.niveau === "DD") selD.value = ctx.code;
  if (ctx.niveau === "APE") { selD.value = ctx.codeDD || ""; selD.dispatchEvent(new Event("change")); selA.value = ctx.code; }

  const validerSelection = () => {
    const n = selN.value;
    if (!n) { toast("Sélectionner un niveau."); return false; }
    if (n === "NAT") setCtx("NAT", "NATIONAL", "France Travail - national");
    else if (n === "REG") { if (!selR.value) { toast("Sélectionner une région."); return false; } setCtx("REG", "REG_" + selR.value, selR.value, { region: selR.value }); }
    else if (n === "DD") {
      const d = REF.dds.find(x => x.code === selD.value); if (!d) { toast("Sélectionner une DD."); return false; }
      setCtx("DD", d.code, d.nom, { region: d.region });
    } else {
      const a = REF.agences.find(x => x.code === selA.value); if (!a) { toast("Sélectionner une agence."); return false; }
      setCtx("APE", a.code, a.nom, { region: a.region, codeDD: a.codeDD });
    }
    return true;
  };

  $("#btn-go").addEventListener("click", () => { if (validerSelection()) nav("resultats"); });
  $("#btn-go-revue").addEventListener("click", () => { if (validerSelection()) nav("revue"); });
  $("#btn-go-pdf").addEventListener("click", () => { if (validerSelection()) telechargerRapport($("#btn-go-pdf")); });

  $("#btn-donnees-fictives")?.addEventListener("click", () => {
    if (!ctx.code) return toast("Sélectionner d'abord une structure.");
    demanderConfirmation(
      "Générer des données fictives",
      `Cela va créer des résultats et une remontée fictifs pour <b>${esc(ctx.nom)}</b> et ses unités directement rattachées, en <b>écrasant toute donnée déjà existante</b> à ces mêmes codes. Les <b>cibles nationales</b> (communes à tout le site) seront également écrasées par des valeurs fictives. Continuer ?`,
      "Générer",
      async () => { try { await genererDonneesFictives(); nav("resultats"); } catch (e) { console.error(e); toastErreur(MSG_ERREUR_SAISIE); } }
    );
  });
  $("#btn-reset-donnees")?.addEventListener("click", () => {
    if (!ctx.code) return toast("Sélectionner d'abord une structure.");
    demanderConfirmation(
      "Réinitialiser les données",
      `Cela va <b>supprimer définitivement</b> les résultats et la remontée (avec son historique) de <b>${esc(ctx.nom)}</b> et de ses unités directement rattachées. Cette action est irréversible. Continuer ?`,
      "Réinitialiser",
      async () => { try { await reinitialiserDonnees(); nav("accueil"); } catch (e) { console.error(e); toastErreur(MSG_ERREUR_SAISIE); } }
    );
  });
}

// ---- Résultats N-1 (démo déterministe si absent) ----
const BASE_RES = { DYN:.76, SATIS_ACCO:.79, F_TAE:.74, DELD:800, F_PRIO:.66, TAE:.46, TPED:.16, INTENSIF:950, IMMERSIONS:480, ENT_PLUS:.25, TPO:.85, SATIS_ENT:.83, PROSPEC:640, TP:.062, SATIS_IND:.81, CDALB:.90, DPO:31, DEMAR:.92, IQVCT:.75, ENGAGEMENT:.74, ABSENTEISME:.065 };
function demoResultats(code) {
  let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 9973;
  const out = {};
  for (const [k, v] of Object.entries(BASE_RES)) {
    const j = ((h = (h * 7 + 13) % 9973) / 9973 - .5); // -0,5..0,5
    out[k] = IND[k]?.pct ? +(v * (1 + j * .12)).toFixed(3) : Math.round(v * (1 + j * .5));
  }
  return out;
}
async function getRes(annee, code) {
  return (await loadResultats(annee, code)) || (DEMO ? demoResultats(annee === ANNEE_BILAN ? code : code + "_A2") : null);
}

// ---- Données fictives (admin uniquement) ----
// Détermine le périmètre de codes concernés par la structure actuellement sélectionnée :
// elle-même, et ses unités directement rattachées (une seule maille en-dessous).
function perimetreDonneesFictives() {
  const codes = [ctx.code];
  if (ctx.niveau === "DD") REF.agences.filter(a => a.codeDD === ctx.code).forEach(a => codes.push(a.code));
  else if (ctx.niveau === "REG") REF.dds.filter(d => d.region === ctx.region).forEach(d => codes.push(d.code));
  else if (ctx.niveau === "NAT") REF.regions.forEach(r => codes.push("REG_" + r));
  return codes;
}
function saisieFictive(code) {
  const res = demoResultats(code);
  const ambitions = {};
  for (const i of INDICATEURS.filter(x => x.fourchette)) {
    const base = res[i.id];
    ambitions[i.id] = { valeur: i.pct ? +(base * 1.03).toFixed(3) : Math.round(base * 1.05) };
  }
  return {
    ambitions,
    qualitatif: { acco: { reussites: "(Donnée fictive) Progression de la dynamisation de l'accompagnement sur le territoire.", axes: "(Donnée fictive) Poursuivre l'effort sur l'accompagnement intensif." } },
    ressources: {},
  };
}
function resultatsFictifs(code) {
  const res = demoResultats(code);
  // Ajoute un objectif A-1 par indicateur (nécessaire pour le "Taux d'atteinte"), basé sur la
  // valeur nominale (non bruitée) de l'indicateur, pour obtenir des taux d'atteinte réalistes.
  for (const i of INDICATEURS) {
    if (BASE_RES[i.id] != null) res[`${i.id}_OBJ`] = BASE_RES[i.id];
  }
  return res;
}
async function genererDonneesFictives() {
  const codes = perimetreDonneesFictives();
  for (const code of codes) {
    await saveResultats(ANNEE_BILAN, code, resultatsFictifs(code));
    await saveResultats(ANNEE_A2, code, demoResultats(code + "_A2"));
    const s = saisieFictive(code);
    s.nomStructure = code === ctx.code ? ctx.nom : (REF.agences.find(a => a.code === code)?.nom || REF.dds.find(d => d.code === code)?.nom || code.replace("REG_", ""));
    await saveSaisie(code, s, "Données fictives (démo)");
  }
  // Cibles nationales (financeurs) : une seule cible, commune à toutes les structures.
  const cibles = {};
  for (const i of INDICATEURS.filter(x => x.fourchette)) cibles[i.id] = BASE_RES[i.id];
  await saveCibles(cibles);
  toast(`Résultats ${ANNEE_BILAN}/${ANNEE_A2} et remontées fictifs générés pour ${codes.length} structure(s), ainsi que les cibles nationales.`);
}
async function reinitialiserDonnees() {
  const codes = perimetreDonneesFictives();
  for (const code of codes) {
    await deleteResultats(ANNEE_BILAN, code);
    await deleteResultats(ANNEE_A2, code);
    await deleteSaisieComplete(code);
  }
  toast(`Données réinitialisées pour ${codes.length} structure(s).`);
}

// ---- Avancement des remontées (complet / partiel / vide) ----
const ALL_AMBITION_IDS = [...new Set(Object.values(AMBITIONS_PAR_DOMAINE).flat())];
function statutSaisie(saisie) {
  if (!saisie || !saisie.ambitions) return "empty";
  let filled = 0;
  for (const id of ALL_AMBITION_IDS) {
    if (valeurAmbition(saisie.ambitions[id]) != null) filled++;
  }
  if (filled === 0) return "empty";
  if (filled === ALL_AMBITION_IDS.length) return "complete";
  return "partial";
}
function showListeModal(titre, noms) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
  <div class="modal-card" style="max-width:480px">
    <div class="modal-card__header"><h2>${esc(titre)}</h2></div>
    <div class="modal-card__body">${noms.length ? `<ul>${noms.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : '<p class="muted">Aucune structure dans cette catégorie.</p>'}</div>
    <div class="modal-card__footer"><button class="btn btn--secondary" id="liste-fermer">Fermer</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#liste-fermer").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}
let listesAvancement = { complete: [], partial: [], empty: [] };
const LIBELLE_STATUT = { complete: "Complètes", partial: "Partielles", empty: "Vides" };

function carteAvancement(label, total, counts) {
  if (!total) return "";
  const bouton = (statut) => `<button type="button" class="kpi__val kpi__val--lien" data-avancement="${statut}">${counts[statut]}</button>`;
  return `<div class="card">
    <h2>Avancement des remontées <span class="muted">(par ${esc(label)})</span></h2>
    <p class="muted" style="margin-top:-8px">Cliquer sur un nombre pour voir le détail des structures concernées.</p>
    <div class="grid grid-3">
      <div class="kpi"><div class="kpi__label"><span class="badge badge--vert">Complètes</span></div>${bouton("complete")}<div class="muted">sur ${total} ${esc(label)}</div></div>
      <div class="kpi"><div class="kpi__label"><span class="badge badge--jaune">Partielles</span></div>${bouton("partial")}<div class="muted">sur ${total} ${esc(label)}</div></div>
      <div class="kpi"><div class="kpi__label"><span class="badge badge--rouge">Vides</span></div>${bouton("empty")}<div class="muted">sur ${total} ${esc(label)}</div></div>
    </div>
  </div>`;
}
// Avancement : basé sur la remontée PROPRE de chaque unité directe (l'agence à la maille DD,
// la DD à la maille régionale, la région à la maille nationale) — pas sur ses propres unités
// rattachées, sans quoi une remontée partielle saisie directement au niveau intermédiaire
// n'était jamais prise en compte.
async function calculerAvancement() {
  const counts = { complete: 0, partial: 0, empty: 0 };
  listesAvancement = { complete: [], partial: [], empty: [] };
  const classer = (nom, statut) => { counts[statut]++; listesAvancement[statut].push(nom); };

  if (ctx.niveau === "DD") {
    const agences = REF.agences.filter(a => a.codeDD === ctx.code);
    const map = await loadSaisies(agences.map(a => a.code));
    agences.forEach(a => classer(a.nom, statutSaisie(map[a.code])));
    return carteAvancement("agences", agences.length, counts);
  }
  if (ctx.niveau === "REG") {
    const dds = REF.dds.filter(d => d.region === ctx.region);
    const map = await loadSaisies(dds.map(d => d.code));
    dds.forEach(d => classer(d.nom, statutSaisie(map[d.code])));
    return carteAvancement("directions départementales", dds.length, counts);
  }
  if (ctx.niveau === "NAT") {
    const codes = REF.regions.map(r => "REG_" + r);
    const map = await loadSaisies(codes);
    REF.regions.forEach(r => classer(r, statutSaisie(map["REG_" + r])));
    return carteAvancement("régions", REF.regions.length, counts);
  }
  return "";
}

// ---- Unités enfants + remontées consolidées (partagé entre Résultats et Revue d'impact) ----
// Optimisation : les remontées manquantes d'un niveau intermédiaire sont reconstruites en
// regroupant TOUS les appels réseau nécessaires par palier (DD puis agences), au lieu d'un
// aller-retour Firestore par unité, déterminant pour la maille nationale (~839 agences).
async function chargerUnitesConsolidation() {
  let unites = [], titreEnfants = "";
  if (ctx.niveau === "DD") {
    unites = REF.agences.filter(a => a.codeDD === ctx.code).map(a => ({ code: a.code, nom: a.nom, poids: a.poids }));
    titreEnfants = "agences";
  } else if (ctx.niveau === "REG") {
    unites = REF.dds.filter(d => d.region === ctx.region).map(d => ({ code: d.code, nom: d.nom, poids: d.poids }));
    titreEnfants = "directions départementales";
  } else if (ctx.niveau === "NAT") {
    const pr = poidsRegions(REF);
    unites = REF.regions.map(r => ({ code: "REG_" + r, nom: r, poids: Object.fromEntries(INDICATEURS.map(i => [i.id, pr[r] || 0])) }));
    titreEnfants = "régions";
  } else {
    return { unites: [], titreEnfants: "" };
  }

  const saisies = await loadSaisies(unites.map(u => u.code));
  unites.forEach(u => { if (saisies[u.code]) u.saisie = saisies[u.code]; });

  if (ctx.niveau === "REG") {
    const sansSaisie = unites.filter(u => !u.saisie);
    const agencesParDD = new Map();
    let toutesAgences = [];
    for (const u of sansSaisie) {
      const apes = REF.agences.filter(a => a.codeDD === u.code).map(a => ({ code: a.code, poids: a.poids }));
      agencesParDD.set(u.code, apes);
      toutesAgences.push(...apes);
    }
    const subA = toutesAgences.length ? await loadSaisies(toutesAgences.map(a => a.code)) : {};
    toutesAgences.forEach(a => { if (subA[a.code]) a.saisie = subA[a.code]; });
    for (const u of sansSaisie) {
      const apes = agencesParDD.get(u.code);
      const amb = {};
      for (const i of INDICATEURS) { const c = consolider(i.id, apes); if (c) amb[i.id] = { valeur: c.valeur }; }
      if (Object.keys(amb).length) u.saisie = { ambitions: amb, _indirect: true };
    }
  } else if (ctx.niveau === "NAT") {
    const regionsSansSaisie = unites.filter(u => !u.saisie);
    const ddsParRegion = new Map();
    let toutesDD = [];
    for (const u of regionsSansSaisie) {
      const dds = REF.dds.filter(d => d.region === u.nom).map(d => ({ code: d.code, poids: d.poids }));
      ddsParRegion.set(u.nom, dds);
      toutesDD.push(...dds);
    }
    const subDD = toutesDD.length ? await loadSaisies(toutesDD.map(d => d.code)) : {};
    toutesDD.forEach(d => { if (subDD[d.code]) d.saisie = subDD[d.code]; });

    const ddsSansSaisie = toutesDD.filter(d => !d.saisie);
    const agencesParDD = new Map();
    let toutesAgences = [];
    for (const d of ddsSansSaisie) {
      const apes = REF.agences.filter(a => a.codeDD === d.code).map(a => ({ code: a.code, poids: a.poids }));
      agencesParDD.set(d.code, apes);
      toutesAgences.push(...apes);
    }
    const subA = toutesAgences.length ? await loadSaisies(toutesAgences.map(a => a.code)) : {};
    toutesAgences.forEach(a => { if (subA[a.code]) a.saisie = subA[a.code]; });

    for (const d of ddsSansSaisie) {
      const apes = agencesParDD.get(d.code);
      const amb = {};
      for (const i of INDICATEURS) { const c = consolider(i.id, apes); if (c) amb[i.id] = { valeur: c.valeur }; }
      if (Object.keys(amb).length) d.saisie = { ambitions: amb, _indirect: true };
    }
    for (const u of regionsSansSaisie) {
      const dds = ddsParRegion.get(u.nom);
      const amb = {};
      for (const i of INDICATEURS) { const c = consolider(i.id, dds); if (c) amb[i.id] = { valeur: c.valeur }; }
      if (Object.keys(amb).length) u.saisie = { ambitions: amb, _indirect: true };
    }
  }
  return { unites, titreEnfants };
}

// Écart entre l'ambition propre de la structure et la valeur consolidée de ses unités.
// Badge de complétude affiché dans l'en-tête de chaque bloc pliable.
function badgeCompletude(remplis, total) {
  if (!total) return "";
  const cls = remplis === total ? "badge--vert" : remplis === 0 ? "badge--rouge" : "badge--jaune";
  return `<span class="badge ${cls}" style="margin-left:10px;font-weight:400;font-size:11px">${remplis}/${total}</span>`;
}

function celluleAtteinte(i, v1, objectif) {
  if (v1 == null || !objectif) return "-";
  const ratio = v1 / objectif;
  const favorable = i.sensInverse ? ratio <= 1 : ratio >= 1;
  return `<span class="${favorable ? "ecart-pos" : "ecart-neg"}">${(ratio * 100).toFixed(0)} %</span>`;
}
function celluleEvolution(i, v1, v2) {
  if (v1 == null || v2 == null) return "-";
  const delta = v1 - v2;
  const favorable = i.sensInverse ? delta <= 0 : delta >= 0;
  const deltaTxt = i.pct ? (delta * 100).toFixed(1).replace(".", ",") + " pt" : Math.round(delta).toLocaleString("fr-FR");
  return `<span class="${favorable ? "ecart-pos" : "ecart-neg"}">${delta > 0 ? "+" : ""}${deltaTxt}</span>`;
}

function celluleEcartConsolide(i, amb, c) {
  if (!c) return '<span class="muted">-</span>';
  const v = valeurAmbition(amb);
  if (v == null) return '<span class="muted">non saisi</span>';
  const diff = v - c.valeur;
  const eps = i.pct ? 0.0005 : 0.5;
  if (Math.abs(diff) <= eps) return '<span class="badge badge--vert">aligné</span>';
  const txt = i.pct ? (diff * 100).toFixed(1).replace(".", ",") + " pt" : Math.round(diff).toLocaleString("fr-FR");
  return `<span class="ecart-neg">${diff > 0 ? "+" : ""}${txt}</span>`;
}

// ---- Vue Résultats et ambitions ----
async function viewResultats() {
  if (!ctx.code) { nav("accueil"); return toast("Sélectionner d'abord une structure."); }

  const [resA1, resA2, saisie, cibles] = await Promise.all([
    getRes(ANNEE_BILAN, ctx.code),
    getRes(ANNEE_A2, ctx.code),
    loadSaisie(ctx.code),
    loadCibles(),
  ]);

  // Écart aux pairs : uniquement à la maille agence, pairs = autres agences de la même DD.
  let pairsResultats = null;
  if (ctx.niveau === "APE" && ctx.codeDD) {
    const pairsRef = REF.agences.filter(a => a.codeDD === ctx.codeDD && a.code !== ctx.code);
    const resPairs = await Promise.all(pairsRef.map(a => getRes(ANNEE_BILAN, a.code)));
    pairsResultats = pairsRef.map((a, i) => ({ poids: a.poids, valeur: resPairs[i] }));
  }

  // Consolidation des unités enfants : uniquement à partir de la maille DD.
  const estConsolidable = ctx.niveau !== "APE";
  let unites = [], titreEnfants = "";
  if (estConsolidable) ({ unites, titreEnfants } = await chargerUnitesConsolidation());
  const nbSaisi = unites.filter(u => u.saisie && !u.saisie._indirect).length;

  let rows = "";
  for (const i of INDICATEURS) {
    const v1 = resA1 ? resA1[i.id] : null;
    const v2 = resA2 ? resA2[i.id] : null;
    const objectif = resA1 ? resA1[`${i.id}_OBJ`] : null;

    const atteinteCell = celluleAtteinte(i, v1, objectif);
    const evolCell = celluleEvolution(i, v1, v2);

    let pairsCell = "-";
    if (ctx.niveau === "APE" && v1 != null && pairsResultats) {
      const pairsAvecValeur = pairsResultats.map(p => ({ poids: p.poids, valeur: p.valeur ? p.valeur[i.id] : null }));
      const moy = moyennePairs(i.id, pairsAvecValeur);
      if (moy != null) {
        const delta = v1 - moy;
        const favorable = i.sensInverse ? delta <= 0 : delta >= 0;
        const deltaTxt = i.pct ? (delta * 100).toFixed(1).replace(".", ",") + " pt" : Math.round(delta).toLocaleString("fr-FR");
        pairsCell = `<span class="${favorable ? "ecart-pos" : "ecart-neg"}">${delta > 0 ? "+" : ""}${deltaTxt}</span>`;
      }
    }

    const cible = cibles?.[i.id];
    const amb = saisie?.ambitions?.[i.id];
    const valAmb = valeurAmbition(amb);
    const c = estConsolidable && i.fourchette ? consolider(i.id, unites) : null;
    const ecartAmbCons = estConsolidable && i.fourchette ? celluleEcartConsolide(i, amb, c) : null;
    const ambCellClass = ecartAmbCons && ecartAmbCons.includes("ecart-neg") ? "ecart-neg" : "";
    const ambitionCell = i.fourchette
      ? (valAmb != null ? fmtVal(i, valAmb) : "-")
      : `<span class="muted" title="Objectif imposé nationalement : aucune remontée d'ambition locale n'est prévue pour cet indicateur.">${cible != null ? fmtVal(i, cible) : "-"}</span>`;

    rows += `<tr>
      <td><b>${esc(i.label)}</b>${i.sensInverse ? ' <span class="muted" title="Une baisse est une amélioration">▼</span>' : ""}${i.aide ? ` <button type="button" class="info-ico" data-info-ind="${i.id}">ⓘ</button>` : ""}<br><span class="muted">${esc(i.nom)}</span></td>
      <td class="num">${v1 != null ? fmtVal(i, v1) : "-"}</td>
      <td class="num">${atteinteCell}</td>
      <td class="num">${evolCell}</td>
      ${ctx.niveau === "APE" ? `<td class="num">${pairsCell}</td>` : ""}
      <td class="num">${cible != null ? fmtVal(i, cible) : "-"}</td>
      <td class="num ${i.fourchette ? ambCellClass : ""}">${ambitionCell}</td>
      ${estConsolidable ? `
      <td class="num">${c ? fmtVal(i, c.valeur) : "-"}</td>
      <td class="num">${c ? Math.round(c.couverture * 100) + " %" : "-"}</td>
      <td class="num">${i.fourchette ? ecartAmbCons : '<span class="muted">n/a</span>'}</td>` : ""}
    </tr>`;
  }

  const avancementHtml = await calculerAvancement();

  app.innerHTML = `
  ${stickyBarHtml("Résultats et ambitions")}
  <h1>Résultats et ambitions : ${esc(ctx.nom)}</h1>
  <div class="help"><b>Aide à la lecture.</b> <b>Résultat ${ANNEE_BILAN}</b> : dernier résultat connu. <b>Taux d'atteinte</b> : résultat rapporté à l'objectif qui avait été fixé pour ${ANNEE_BILAN} (si renseigné). <b>Évolution</b> : écart avec le résultat ${ANNEE_A2}. ${ctx.niveau === "APE" ? "<b>Écart aux pairs</b> : écart à la moyenne pondérée des autres agences de la même Direction Départementale. " : ""}<b>Cible nationale ${CAMPAGNE}</b> : objectif fixé par les financeurs. <b>Ambition ${CAMPAGNE}</b> : valeur saisie par la structure dans l'onglet Revue d'impact.${estConsolidable ? ` <b>Consolidé</b> : moyenne pondérée (taux) ou somme (volumes) des ambitions des ${esc(titreEnfants)} rattachées ; le coefficient de pondération de chaque unité mesure sa contribution aux résultats consolidés de cet échelon (plus il est élevé, plus son résultat pèse dans la moyenne). <b>Couverture</b> = part du poids total effectivement remontée. <b>Écart ambition/consolidé</b> : quand l'ambition saisie par la structure diverge de ce que ses ${esc(titreEnfants)} remontent, le texte apparaît en rouge. Pour aligner l'ambition sur le consolidé, utilisez le bouton dédié dans l'onglet Revue d'impact.` : ""}
    <br><br><b>Ces résultats seront enrichis de données à mi-parcours pour mesurer l'avancement de la campagne ${CAMPAGNE}.</b>
  </div>
  ${avancementHtml}
  ${!resA1 ? `<div class="card">Aucun résultat ${ANNEE_BILAN} chargé pour cette structure.</div>` : ""}
  <div class="card">
    ${estConsolidable ? `<div class="toolbar"><span class="muted">${nbSaisi}/${unites.length} ${esc(titreEnfants)} remontées</span>
      <div class="progress" style="width:140px"><i style="width:${unites.length ? Math.round(nbSaisi / unites.length * 100) : 0}%"></i></div></div>` : ""}
    <div style="overflow-x:auto"><table>
      <thead><tr>
        <th>Indicateur</th>
        <th class="num">Résultat ${ANNEE_BILAN}${iconAideColonne("resultat")}</th>
        <th class="num">Taux d'atteinte objectif ${ANNEE_BILAN}${iconAideColonne("atteinte")}</th>
        <th class="num">Évolution / ${ANNEE_A2}${iconAideColonne("evolution")}</th>
        ${ctx.niveau === "APE" ? `<th class="num">Écart aux pairs${iconAideColonne("ecartPairs")}</th>` : ""}
        <th class="num">Cible nationale ${CAMPAGNE}${iconAideColonne("cible")}</th>
        <th class="num">Ambition ${CAMPAGNE}${iconAideColonne("ambition")}</th>
        ${estConsolidable ? `<th class="num">Consolidé${iconAideColonne("consolide")}</th><th class="num">Couverture${iconAideColonne("couverture")}</th><th class="num">Écart ambition/consolidé${iconAideColonne("ecartConsolide")}</th>` : ""}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
  <div class="toolbar"><button class="btn btn--secondary" id="btn-pdf">Télécharger le rapport PDF</button><span class="spacer"></span><button class="btn btn--primary" id="to-revue">Aller à la revue d'impact</button></div>`;

  $("#btn-pdf").addEventListener("click", () => telechargerRapport($("#btn-pdf")));

  $("#to-revue").addEventListener("click", () => nav("revue"));
}

// ---- Vue Revue d'impact (remontée + consolidation) ----
async function viewRevue() {
  if (!ctx.code) { nav("accueil"); return toast("Sélectionner d'abord une structure."); }

  app.innerHTML = '<div class="card">Chargement…</div>';
  const wrap = document.createElement("div");
  wrap.appendChild(await renderRemontee());
  if (ctx.niveau !== "APE") wrap.appendChild(await renderConsolidation());
  app.innerHTML = "";
  app.appendChild(wrap);
}

function showDetailModal(titre, lignes) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
  <div class="modal-card" style="max-width:800px">
    <div class="modal-card__header"><h2>${esc(titre)}</h2></div>
    <div class="modal-card__body">
      <table><thead><tr><th style="width:180px">Structure</th><th>Réponse</th></tr></thead><tbody>
      ${lignes.map(l => `<tr><td><b>${esc(l.nom)}</b></td><td>${l.texte ? esc(l.texte).replace(/\n/g, "<br>") : '<span class="muted">(pas de réponse)</span>'}</td></tr>`).join("")}
      </tbody></table>
    </div>
    <div class="modal-card__footer"><button class="btn btn--secondary" id="detail-fermer">Fermer</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#detail-fermer").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}

function showInfoModal(titre, texte) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
  <div class="modal-card" style="max-width:480px">
    <div class="modal-card__header"><h2>${esc(titre)}</h2></div>
    <div class="modal-card__body"><p>${esc(texte)}</p></div>
    <div class="modal-card__footer"><button class="btn btn--secondary" id="info-fermer">Fermer</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#info-fermer").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}

// Explications des colonnes du tableau Résultats/Ambitions (affichées via icône ⓘ cliquable).
const AIDE_COLONNES = {
  resultat: `Résultat ${ANNEE_BILAN} : dernier résultat connu de la structure pour cet indicateur.`,
  atteinte: `Taux d'atteinte : résultat ${ANNEE_BILAN} rapporté à l'objectif qui avait été fixé pour cette même année (s'il a été renseigné à l'import des résultats). Sans objectif renseigné, la cellule affiche "-".`,
  evolution: `Évolution : écart entre le résultat ${ANNEE_BILAN} et le résultat ${ANNEE_A2}. Une évolution favorable s'affiche en vert, défavorable en rouge.`,
  ecartPairs: "Écart aux pairs : écart entre le résultat de l'agence et la moyenne pondérée des autres agences de sa Direction Départementale. N'est calculé qu'à la maille agence.",
  cible: `Cible nationale ${CAMPAGNE} : objectif fixé par les financeurs de France Travail pour la campagne, identique pour toutes les structures.`,
  ambition: `Ambition ${CAMPAGNE} : valeur cible saisie par la structure elle-même dans l'onglet Revue d'impact pour la campagne à venir. Pour CDALb, DPO et DEMAR (objectifs imposés nationalement), aucune remontée locale n'est prévue : la cible nationale est affichée en grisé à la place.`,
  consolide: "Consolidé : moyenne pondérée (indicateurs en taux) ou somme (indicateurs en volume) des ambitions déjà saisies par les unités rattachées à cette structure.",
  couverture: "Couverture : part du poids total des unités rattachées ayant effectivement saisi une ambition. Une couverture faible signifie que le consolidé repose sur peu de remontées et doit être interprété avec prudence.",
  ecartConsolide: "Écart ambition/consolidé : différence entre l'ambition saisie par la structure et la valeur consolidée de ses unités rattachées. Le texte apparaît en rouge en cas de divergence notable.",
};
function iconAideColonne(cle) {
  return AIDE_COLONNES[cle] ? ` <button type="button" class="info-ico" data-info-col="${cle}">ⓘ</button>` : "";
}

// Délégation globale : un clic sur une icône ⓘ (indicateur ou colonne) ouvre la modale d'aide correspondante.
document.body.addEventListener("click", (e) => {
  const btnInd = e.target.closest("[data-info-ind]");
  if (btnInd) { const ind = IND[btnInd.dataset.infoInd]; if (ind?.aide) showInfoModal(`${ind.label} — ${ind.nom}`, ind.aide); return; }
  const btnCol = e.target.closest("[data-info-col]");
  if (btnCol) { const txt = AIDE_COLONNES[btnCol.dataset.infoCol]; if (txt) showInfoModal("Aide à la lecture", txt); return; }
  const btnAv = e.target.closest("[data-avancement]");
  if (btnAv) { const statut = btnAv.dataset.avancement; showListeModal(`Structures : ${LIBELLE_STATUT[statut]}`, listesAvancement[statut] || []); }
});

// ---- Bloc Remontée (saisie qualitative + ambitions + historique) ----
async function renderRemontee() {
  const wrap = document.createElement("div");
  const saisie = (await loadSaisie(ctx.code)) || { qualitatif: {}, ambitions: {}, ressources: {} };
  let domaine = "acco";
  let dernierEmail = localStorage.getItem("dernierEmailAuteur") || "";
  formModifie = false;

  // Unités enfants (pour le détail par question), uniquement au-dessus de la maille agence.
  let unitesEnfants = [], labelEnfants = "";
  if (ctx.niveau !== "APE") {
    const r = await chargerUnitesConsolidation();
    unitesEnfants = r.unites;
    labelEnfants = r.titreEnfants;
  }
  // Repères chiffrés (résultat, atteinte, évolution, cible nationale) affichés dans le bloc Ambitions.
  const [resA1, resA2, cibles] = await Promise.all([
    getRes(ANNEE_BILAN, ctx.code),
    getRes(ANNEE_A2, ctx.code),
    loadCibles(),
  ]);
  let scrollHandler = null;

  function render() {
    const t = TRAME[domaine];
    const q = saisie.qualitatif[domaine] || {};
    const r = saisie.ressources[domaine] || {};
    const inds = AMBITIONS_PAR_DOMAINE[domaine].map(id => IND[id]);
    const consolidable = unitesEnfants.length > 0;

    const detailBtn = (item) => unitesEnfants.length
      ? `<button type="button" class="btn btn--secondary" data-detail="${domaine}:${item.id}" style="padding:3px 10px;font-size:11px;margin-left:8px">Détail par ${esc(labelEnfants)}</button>` : "";

    const area = (grp, item) => {
      const v = q[item.id] || "";
      return `<div class="field">
        <label>${esc(item.label)}${detailBtn(item)}</label>
        ${item.q ? `<div class="q">${esc(item.q)}</div>` : ""}
        <textarea maxlength="${MAX_CHARS + 200}" data-q="${item.id}">${esc(v)}</textarea>
        <div class="count ${v.length > MAX_CHARS ? "over" : ""}">${v.length}/${MAX_CHARS}</div>
      </div>`;
    };
    const bloc = (titre, badge, contenu, ouvert) => `<details class="card fold" data-bloc="${esc(titre)}" ${ouvert ? "open" : ""}>
      <summary><span>${esc(titre)}${badge}</span><span class="fold-arrow">▾</span></summary>
      <div class="fold-body">${contenu}</div>
    </details>`;

    // Complétude par bloc
    const bilanRemplis = t.bilan.filter(i => (q[i.id] || "").trim()).length;
    const stratRemplis = t.strategie.filter(i => (q[i.id] || "").trim()).length;
    const levRemplis = t.leviers.filter(i => (q[i.id] || "").trim()).length;
    const ressRemplis = t.ressources.filter(i => r[i.id] !== undefined && r[i.id] !== "").length;
    const ambRemplis = inds.filter(i => valeurAmbition(saisie.ambitions[i.id]) != null).length;

    // Consolidation des ressources d'un domaine (somme des unités enfants)
    const consoliderRessource = (itemId) => {
      let somme = 0, nb = 0;
      for (const u of unitesEnfants) {
        const v = parseFloat(u.saisie?.ressources?.[domaine]?.[itemId]);
        if (!isNaN(v)) { somme += v; nb++; }
      }
      return { somme, nb, total: unitesEnfants.length };
    };

    const emailSaveHtml = () => `
      <div class="field" style="max-width:360px;margin-top:20px"><label for="email-auteur">Votre email (enregistré avec la remontée)</label><input type="email" id="email-auteur" placeholder="prenom.nom@francetravail.fr" value="${esc(dernierEmail)}"></div>
      <div class="toolbar"><span class="spacer"></span><button class="btn btn--primary" id="btn-save">Enregistrer la remontée</button></div>`;

    const ambitionsContenu = () => {
      const rows = inds.map(i => {
        const a = saisie.ambitions[i.id] || {};
        const v1 = resA1 ? resA1[i.id] : null;
        const v2 = resA2 ? resA2[i.id] : null;
        const objectif = resA1 ? resA1[`${i.id}_OBJ`] : null;
        const cible = cibles?.[i.id];
        const c = consolidable ? consolider(i.id, unitesEnfants) : null;
        const ecart = consolidable ? celluleEcartConsolide(i, a, c) : null;
        return `<tr>
          <td><b>${esc(i.label)}</b>${i.aide ? ` <button type="button" class="info-ico" data-info-ind="${i.id}">ⓘ</button>` : ""}<br><span class="muted">${esc(i.nom)}${i.sensInverse ? " (une baisse est une amélioration)" : ""}</span></td>
          <td class="num">${v1 != null ? fmtVal(i, v1) : "-"}</td>
          <td class="num">${celluleAtteinte(i, v1, objectif)}</td>
          <td class="num">${celluleEvolution(i, v1, v2)}</td>
          <td class="num">${cible != null ? fmtVal(i, cible) : "-"}</td>
          <td><input type="number" step="any" placeholder="Ambition" data-amb="${i.id}" value="${esc(a.valeur ?? "")}"></td>
          ${consolidable ? `
          <td class="num">${c ? fmtVal(i, c.valeur) : "-"}</td>
          <td class="num">${c ? Math.round(c.couverture * 100) + " %" : "-"}</td>
          <td class="num">${ecart}</td>` : ""}
        </tr>`;
      }).join("");
      return `
      <div class="q">Les performances des structures comparables permettent d'étalonner vos propositions. Taux en % (ex. 78,5) ; volumes en nombre.</div>
      ${consolidable ? `<div class="toolbar"><span class="muted">La consolidation reprend les ambitions déjà remontées par vos ${esc(labelEnfants)}.</span><span class="spacer"></span><button type="button" class="btn btn--secondary" id="btn-appliquer">Appliquer le consolidé comme ambition</button></div>` : ""}
      <div style="overflow-x:auto"><table>
        <thead><tr>
          <th>Indicateur</th>
          <th class="num">Résultat ${ANNEE_BILAN}${iconAideColonne("resultat")}</th>
          <th class="num">Taux d'atteinte objectif ${ANNEE_BILAN}${iconAideColonne("atteinte")}</th>
          <th class="num">Évolution / ${ANNEE_A2}${iconAideColonne("evolution")}</th>
          <th class="num">Cible nationale ${CAMPAGNE}${iconAideColonne("cible")}</th>
          <th>Votre ambition ${CAMPAGNE}${iconAideColonne("ambition")}</th>
          ${consolidable ? `<th class="num">Consolidé${iconAideColonne("consolide")}</th><th class="num">Couverture${iconAideColonne("couverture")}</th><th class="num">Écart${iconAideColonne("ecartConsolide")}</th>` : ""}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${emailSaveHtml()}`;
    };

    const ressourcesContenu = () => `<div class="grid grid-3">${t.ressources.map(i => {
      const cr = consolidable ? consoliderRessource(i.id) : null;
      return `<div class="field"><label>${esc(i.label)}</label><input type="number" min="0" step="0.5" data-r="${i.id}" value="${esc(r[i.id] ?? "")}">
        ${cr ? `<div class="muted" style="font-size:11px;margin-top:4px">Consolidé (${esc(labelEnfants)}) : ${cr.somme.toLocaleString("fr-FR")} <span class="muted">(${cr.nb}/${cr.total} remontées)</span></div>` : ""}
      </div>`;
    }).join("")}</div>`;

    wrap.innerHTML = `
    <h1>Revue d'impact ${CAMPAGNE} : ${esc(ctx.nom)}</h1>
    ${stickyBarHtml("Revue d'impact", `Bilan ${ANNEE_BILAN}`)}
    <div class="help"><b>Aide à la saisie.</b> Trois blocs par domaine, à déplier selon vos besoins : le <b>bilan ${ANNEE_BILAN}</b> (réussites et axes d'amélioration), la <b>stratégie et les leviers</b>, puis les <b>ambitions chiffrées</b> (une valeur par indicateur, accompagnée du résultat ${ANNEE_BILAN}, du taux d'atteinte, de l'évolution et de la cible nationale pour vous aider à la fixer). Les textes sont limités à ${MAX_CHARS} caractères. Chaque bloc indique son niveau de complétude. ${unitesEnfants.length ? `Le bouton <b>"Détail par ${esc(labelEnfants)}"</b> affiche, pour chaque question, les réponses déjà remontées par vos unités rattachées${consolidable ? `, et le bloc Ambitions propose une consolidation chiffrée avec un bouton pour l'adopter directement` : ""}. ` : ""}<b>La remontée n'étant pas nominative de bout en bout, chaque enregistrement est historisé avec l'email de son auteur</b> ; seul le compte administrateur peut consulter et restaurer les versions antérieures.</div>
    <div class="tabs">${DOMAINES.map(d => `<button class="tab ${d.id === domaine ? "active" : ""}" data-d="${d.id}">${esc(d.nom)}</button>`).join("")}</div>
    ${bloc(`Bilan ${ANNEE_BILAN}`, badgeCompletude(bilanRemplis, t.bilan.length), t.bilan.map(i => area("bilan", i)).join(""), true)}
    ${t.strategie.length ? bloc("Stratégie", badgeCompletude(stratRemplis, t.strategie.length), t.strategie.map(i => area("strategie", i)).join("")) : ""}
    ${t.leviers.length ? bloc("Leviers d'action", badgeCompletude(levRemplis, t.leviers.length), t.leviers.map(i => area("leviers", i)).join("")) : ""}
    ${t.ressources.length ? bloc("Ressources", badgeCompletude(ressRemplis, t.ressources.length), ressourcesContenu()) : ""}
    ${inds.length ? bloc(`Ambitions chiffrées ${CAMPAGNE}`, badgeCompletude(ambRemplis, inds.length), ambitionsContenu()) : `<div class="card">${emailSaveHtml()}</div>`}
    ${isAdmin() ? '<div class="card" id="bloc-historique"><h2>Historique des versions</h2><p class="muted">Chargement de l\'historique…</p></div>' : ""}`;

    wrap.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { collect(); domaine = b.dataset.d; render(); }));
    wrap.querySelectorAll("textarea[data-q]").forEach(ta => ta.addEventListener("input", () => {
      const c = ta.nextElementSibling; c.textContent = `${ta.value.length}/${MAX_CHARS}`;
      c.classList.toggle("over", ta.value.length > MAX_CHARS);
      formModifie = true;
    }));
    wrap.querySelectorAll('input[data-r], input[data-amb], #email-auteur').forEach(inp => inp.addEventListener("input", () => { formModifie = true; }));
    wrap.querySelectorAll("[data-detail]").forEach(btn => btn.addEventListener("click", () => {
      const [dom, itemId] = btn.dataset.detail.split(":");
      const grp = TRAME[dom];
      const item = [...grp.bilan, ...grp.strategie, ...grp.leviers].find(x => x.id === itemId);
      const lignes = unitesEnfants.map(u => ({ nom: u.nom, texte: u.saisie?.qualitatif?.[dom]?.[itemId] || "" }));
      showDetailModal(`${item ? item.label : itemId} : réponses des ${labelEnfants}`, lignes);
    }));
    wrap.querySelector("#btn-appliquer")?.addEventListener("click", async () => {
      collect();
      let applique = 0;
      for (const i of INDICATEURS.filter(x => x.fourchette)) {
        const c = consolider(i.id, unitesEnfants);
        if (c) { saisie.ambitions[i.id] = { valeur: c.valeur }; applique++; }
      }
      if (!applique) return toast("Aucune donnée consolidée disponible pour le moment.");
      let email = localStorage.getItem("dernierEmailAuteur") || "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        email = prompt("Votre email (pour l'historique de cette action) :", email) || "";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Email invalide, action annulée.");
        localStorage.setItem("dernierEmailAuteur", email);
      }
      try {
        saisie.nomStructure = ctx.nom; saisie.niveau = ctx.niveau; saisie.region = ctx.region || null; saisie.codeDD = ctx.codeDD || null;
        await saveSaisie(ctx.code, saisie, email);
        toast(`${applique} ambition(s) alignée(s) sur le consolidé.`);
        formModifie = false;
        render();
      } catch (e) {
        console.error(e);
        toastErreur(MSG_ERREUR_SAISIE);
      }
    });
    wrap.querySelector("#btn-save").addEventListener("click", async () => {
      collect();
      const email = wrap.querySelector("#email-auteur").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Merci de saisir un email valide.");
      localStorage.setItem("dernierEmailAuteur", email);
      try {
        saisie.nomStructure = ctx.nom; saisie.niveau = ctx.niveau; saisie.region = ctx.region || null; saisie.codeDD = ctx.codeDD || null;
        await saveSaisie(ctx.code, saisie, email);
        toast("Remontée enregistrée et historisée.");
        formModifie = false;
        if (isAdmin()) renderHistorique();
      } catch (e) {
        console.error(e);
        toastErreur(MSG_ERREUR_SAISIE);
      }
    });
    if (isAdmin()) renderHistorique();

    // Bandeau flottant : affiche le titre du bloc actuellement visible à l'écran.
    const blocEls = [...wrap.querySelectorAll("details.fold")];
    const stickyBar = wrap.querySelector(".sticky-context");
    const blocLabel = wrap.querySelector("#bloc-actif");
    blocEls.forEach(d => d.addEventListener("toggle", () => { if (d.open) blocLabel.textContent = d.dataset.bloc; }));
    if (scrollHandler) window.removeEventListener("scroll", scrollHandler);
    scrollHandler = () => {
      const barBottom = stickyBar.getBoundingClientRect().bottom;
      let actif = null;
      for (const d of blocEls) {
        if (d.getBoundingClientRect().top <= barBottom + 4) actif = d;
      }
      if (actif) blocLabel.textContent = actif.dataset.bloc;
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });
    scrollCleanup = () => { if (scrollHandler) window.removeEventListener("scroll", scrollHandler); };
  }

  async function renderHistorique() {
    const bloc = wrap.querySelector("#bloc-historique");
    if (!bloc) return;
    const hist = await loadHistorique(ctx.code);
    if (!hist.length) { bloc.innerHTML = "<h2>Historique des versions</h2><p class=\"muted\">Aucune version enregistrée pour le moment.</p>"; return; }
    bloc.innerHTML = `<h2>Historique des versions</h2>
      <div class="help">Visible uniquement par le compte administrateur. Chaque enregistrement est conservé ; une version antérieure peut être restaurée (elle devient la version courante, et cette restauration est elle-même historisée).</div>
      <table><thead><tr><th>Date</th><th>Auteur</th><th></th></tr></thead><tbody>
      ${hist.map((h, idx) => `<tr>
        <td>${new Date(h.timestamp).toLocaleString("fr-FR")}</td>
        <td>${h.auteur?.startsWith("Données fictives") ? '<span class="badge badge--jaune">Donnée fictive</span>' : esc(h.auteur || "-")}</td>
        <td>${idx === 0 ? '<span class="badge badge--vert">version actuelle</span>' : `<button class="btn btn--secondary" data-restore="${idx}" style="padding:4px 12px;font-size:12px">Restaurer cette version</button>`}</td>
      </tr>`).join("")}
      </tbody></table>`;
    bloc.querySelectorAll("[data-restore]").forEach(btn => btn.addEventListener("click", async () => {
      const version = hist[Number(btn.dataset.restore)];
      try {
        await saveSaisie(ctx.code, JSON.parse(JSON.stringify(version.data)), "Administrateur (restauration)");
        toast("Version restaurée.");
        location.reload();
      } catch (e) {
        console.error(e);
        toastErreur(MSG_ERREUR_SAISIE);
      }
    }));
  }

  function collect() {
    const q = {};
    wrap.querySelectorAll("textarea[data-q]").forEach(ta => { if (ta.value.trim()) q[ta.dataset.q] = ta.value; });
    saisie.qualitatif[domaine] = q;
    const r = {};
    wrap.querySelectorAll("input[data-r]").forEach(inp => { if (inp.value !== "") r[inp.dataset.r] = inp.value; });
    saisie.ressources[domaine] = r;
    wrap.querySelectorAll("input[data-amb]").forEach(inp => {
      if (inp.value !== "") saisie.ambitions[inp.dataset.amb] = { valeur: inp.value };
      else delete saisie.ambitions[inp.dataset.amb];
    });
  }
  render();
  return wrap;
}

// ---- Bloc Consolidation (progression des remontées + cibles nationales) ----
async function renderConsolidation() {
  const wrap = document.createElement("div");
  const { unites, titreEnfants } = await chargerUnitesConsolidation();
  const nbSaisi = unites.filter(u => u.saisie && !u.saisie._indirect).length;
  const cibles = ctx.niveau === "NAT" ? await loadCibles() : null;

  let cibleRows = "";
  if (cibles !== null) {
    cibleRows = INDICATEURS.filter(i => i.fourchette).map(i => {
      const cv = parseFloat(cibles[i.id]);
      return `<tr><td><b>${esc(i.label)}</b></td><td class="num"><input type="number" step="any" style="max-width:110px;text-align:right" data-cible="${i.id}" value="${isNaN(cv) ? "" : cv}"></td></tr>`;
    }).join("");
  }

  wrap.innerHTML = `
  <h2>Consolidation : ${esc(ctx.nom)}</h2>
  <div class="help">Les ambitions chiffrées consolidées et l'écart à l'ambition propre de la structure sont dans le bloc <b>Ambitions chiffrées</b> ci-dessus. Les réponses de chaque ${esc(titreEnfants).replace(/s$/, "")} à chaque question sont accessibles via le bouton "Détail par ${esc(titreEnfants)}" de la question concernée.
    <br><span class="muted">${nbSaisi}/${unites.length} ${esc(titreEnfants)} remontées</span>
    <div class="progress" style="width:140px;margin-top:4px"><i style="width:${unites.length ? Math.round(nbSaisi / unites.length * 100) : 0}%"></i></div>
  </div>
  ${cibles !== null ? `<div class="card">
    <h3>Cibles nationales ${CAMPAGNE} (financeurs)</h3>
    <p class="muted">Saisies par la Direction de la Performance (taux en décimal, ex. 0,47 ; volumes en nombre). Comparées à l'ambition consolidée dans le bloc Ambitions chiffrées.</p>
    <div style="overflow-x:auto"><table><thead><tr><th>Indicateur</th><th class="num">Cible</th></tr></thead><tbody>${cibleRows}</tbody></table></div>
    <div class="toolbar" style="margin-top:12px"><span class="spacer"></span><button class="btn btn--primary" id="btn-cibles">Enregistrer les cibles</button></div>
  </div>` : ""}`;

  if (cibles !== null) wrap.querySelector("#btn-cibles")?.addEventListener("click", async () => {
    const data = {};
    wrap.querySelectorAll("input[data-cible]").forEach(i => { if (i.value !== "") data[i.dataset.cible] = i.value; });
    try {
      await saveCibles(data);
      toast("Cibles financeurs enregistrées.");
      nav("revue");
    } catch (e) {
      console.error(e);
      toastErreur(MSG_ERREUR_SAISIE);
    }
  });
  return wrap;
}

// ---- Popup CGU (affichée à la connexion, hors compte administrateur) ----
const CGU_TEXTE = `
<h3>Pourquoi cet outil ?</h3>
<p>La revue d'impact instaure un dialogue de performance ascendant entre les agences, les Directions Départementales, les Directions Régionales et la Direction Générale. Chaque niveau échange sur ses résultats, ses réussites et ses difficultés, puis définit des objectifs SMART pour la campagne à venir. Cet outil remplace le classeur Excel utilisé jusqu'ici : il centralise la consultation des résultats, la saisie des remontées et leur consolidation pondérée jusqu'au niveau national.</p>

<h3>Comment ça marche ?</h3>
<p>Trois onglets : <b>Accueil</b> pour sélectionner votre structure (agence, DD, région ou national) ; <b>Résultats et ambitions</b> pour consulter les repères chiffrés de l'année précédente, le taux d'atteinte des objectifs, l'évolution et la comparaison aux pairs ou à la cible nationale ; <b>Revue d'impact</b> pour saisir votre bilan qualitatif et vos ambitions chiffrées, et pour consulter la consolidation de votre périmètre.</p>

<h3>Conditions d'utilisation</h3>
<p>En accédant à cet outil, vous reconnaissez et acceptez ce qui suit :</p>
<ul>
<li>L'accès est réservé aux agents du réseau France Travail habilités par la Direction de la Performance dans le cadre de l'exercice annuel de revue d'impact.</li>
<li>Le mot de passe d'accès est personnel à votre périmètre d'habilitation et ne doit pas être partagé en dehors des personnes autorisées à l'utiliser.</li>
<li>Chaque enregistrement d'une remontée (bilan, stratégie, ambitions chiffrées) est horodaté et associé à l'adresse email que vous renseignez à cet effet. Cette information est conservée dans un historique des versions, consultable uniquement par l'administrateur de l'outil, à des fins de traçabilité et de fiabilité des données.</li>
<li>Les données saisies (résultats, ambitions, commentaires qualitatifs) sont à usage interne et destinées exclusivement au pilotage de la performance de France Travail. Elles ne doivent pas être communiquées à l'extérieur du réseau.</li>
<li>Les informations affichées (résultats, cibles, pondérations) sont fournies à titre de repère pour le dialogue de performance ; elles ne constituent pas, à elles seules, une évaluation individuelle des agents.</li>
<li>Vous vous engagez à renseigner des informations sincères et à jour, et à signaler à la Direction de la Performance toute anomalie constatée dans les données affichées.</li>
</ul>
<p>L'utilisation de l'outil vaut acceptation pleine et entière des présentes conditions.</p>`;

function showCGU() {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="cgu-titre">
      <div class="modal-card__header"><h2 id="cgu-titre">À propos de cet outil et conditions d'utilisation</h2></div>
      <div class="modal-card__body">${CGU_TEXTE}</div>
      <div class="modal-card__footer">
        <button class="btn btn--secondary" id="cgu-refuse">Refuser</button>
        <button class="btn btn--primary" id="cgu-accepte">J'accepte les conditions générales d'utilisation</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#cgu-accepte").addEventListener("click", () => { overlay.remove(); resolve(true); });
    overlay.querySelector("#cgu-refuse").addEventListener("click", () => { overlay.remove(); resolve(false); });
  });
}

// ---- Écran d'accès (mot de passe partagé) ----
function renderLogin(erreur) {
  document.querySelector(".steps").hidden = true;
  app.innerHTML = `
  <div class="card card--accent" style="max-width:420px;margin:64px auto">
    <h1>Accès à la revue d'impact</h1>
    <p class="muted">Saisissez le mot de passe transmis par la Direction de la Performance.</p>
    ${erreur ? '<div class="help" style="border-left-color:var(--ft-error);background:var(--ft-error-bg)"><b>Mot de passe incorrect.</b> Réessayez.</div>' : ""}
    <div class="field"><label for="pwd">Mot de passe</label><input type="password" id="pwd" autofocus></div>
    <button class="btn btn--primary" id="btn-login" style="width:100%">Accéder</button>
  </div>`;
  const go = async () => {
    const pwd = $("#pwd").value;
    if (!pwd) return;
    $("#btn-login").disabled = true;
    const ok = await signInShared(pwd);
    if (!ok) { renderLogin(true); return; }
    if (!isAdmin()) {
      const accepte = await showCGU();
      if (!accepte) {
        await signOutShared();
        renderLogin(false);
        return;
      }
    }
    await afterAuth();
  };
  $("#btn-login").addEventListener("click", go);
  $("#pwd").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}

async function afterAuth() {
  document.querySelector(".steps").hidden = false;
  REF = await getReferentiel();
  renderCtx();
  nav("accueil");
}

// ---- Démarrage ----
(async () => {
  const fc = document.getElementById("footer-campagne");
  if (fc) fc.textContent = `Campagne des ambitions ${CAMPAGNE} - données internes, diffusion restreinte`;
  document.querySelector(".steps").hidden = true;
  await initFirebase();
  const dejaConnecte = await waitForAuthReady();
  if (dejaConnecte) await afterAuth();
  else renderLogin(false);
})();
