import { INDICATEURS, DOMAINES, TRAME, AMBITIONS_PAR_DOMAINE, MAX_CHARS, fmtVal } from "./model.js";
import { initFirebase, waitForAuthReady, signInShared, signOutShared, isAdmin, getReferentiel, loadSaisie, saveSaisie, loadSaisies, loadHistorique, loadResultats, loadCibles, saveCibles, DEMO } from "./store.js";
import { consolider, compilerTextes, poidsRegions, moyennePairs } from "./consolidation.js";
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
    ? `<b>${esc(ctx.nom)}</b>${lbl[ctx.niveau] || ""}${DEMO ? ' · <span class="badge badge--jaune">mode démo</span>' : ' · <button class="btn btn--secondary" id="btn-logout" style="padding:2px 10px;font-size:11px">Se déconnecter</button>'}`
    : (DEMO ? '<span class="badge badge--jaune">mode démo — données locales</span>' : "");
  $("#btn-logout")?.addEventListener("click", async () => { await signOutShared(); location.reload(); });
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); }

// ---- Router ----
const views = { accueil: viewAccueil, resultats: viewResultats, revue: viewRevue };
function nav(v) {
  document.querySelectorAll(".step").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  app.innerHTML = '<div class="card">Chargement…</div>';
  views[v]().catch(e => { app.innerHTML = `<div class="card">Erreur : ${esc(e.message)}</div>`; console.error(e); });
}
document.querySelectorAll(".step").forEach(b => b.addEventListener("click", () => nav(b.dataset.view)));

// ---- Vue Accueil ----
async function viewAccueil() {
  const regions = REF.regions;
  app.innerHTML = `
  <div class="card card--accent">
    <h1>Revue d'impact — campagne ${CAMPAGNE}</h1>
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
          <option value="">—</option>
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
  </div>` : ""}`;

  const selN = $("#sel-niveau"), selR = $("#sel-region"), selD = $("#sel-dd"), selA = $("#sel-ape");
  selR.innerHTML = '<option value="">—</option>' + regions.map(r => `<option>${esc(r)}</option>`).join("");
  selN.addEventListener("change", () => {
    $("#f-region").hidden = !["REG","DD","APE"].includes(selN.value);
    $("#f-dd").hidden = !["DD","APE"].includes(selN.value);
    $("#f-ape").hidden = selN.value !== "APE";
  });
  selR.addEventListener("change", () => {
    const dds = REF.dds.filter(d => d.region === selR.value);
    selD.innerHTML = '<option value="">—</option>' + dds.map(d => `<option value="${esc(d.code)}">${esc(d.nom)}</option>`).join("");
    selA.innerHTML = "";
  });
  selD.addEventListener("change", () => {
    const apes = REF.agences.filter(a => a.codeDD === selD.value);
    selA.innerHTML = '<option value="">—</option>' + apes.map(a => `<option value="${esc(a.code)}">${esc(a.nom)}</option>`).join("");
  });
  if (ctx.niveau) { selN.value = ctx.niveau; selN.dispatchEvent(new Event("change")); }
  if (ctx.region) { selR.value = ctx.region; selR.dispatchEvent(new Event("change")); }
  if (ctx.niveau === "DD") selD.value = ctx.code;
  if (ctx.niveau === "APE") { selD.value = ctx.codeDD || ""; selD.dispatchEvent(new Event("change")); selA.value = ctx.code; }

  $("#btn-go").addEventListener("click", () => {
    const n = selN.value;
    if (!n) return toast("Sélectionner un niveau.");
    if (n === "NAT") setCtx("NAT", "NATIONAL", "France Travail — national");
    else if (n === "REG") { if (!selR.value) return toast("Sélectionner une région."); setCtx("REG", "REG_" + selR.value, selR.value, { region: selR.value }); }
    else if (n === "DD") {
      const d = REF.dds.find(x => x.code === selD.value); if (!d) return toast("Sélectionner une DD.");
      setCtx("DD", d.code, d.nom, { region: d.region });
    } else {
      const a = REF.agences.find(x => x.code === selA.value); if (!a) return toast("Sélectionner une agence.");
      setCtx("APE", a.code, a.nom, { region: a.region, codeDD: a.codeDD });
    }
    nav("resultats");
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

// ---- Avancement des remontées (complet / partiel / vide) ----
const ALL_AMBITION_IDS = [...new Set(Object.values(AMBITIONS_PAR_DOMAINE).flat())];
function statutSaisie(saisie) {
  if (!saisie || !saisie.ambitions) return "empty";
  let filled = 0;
  for (const id of ALL_AMBITION_IDS) {
    const a = saisie.ambitions[id];
    if (a && a.min !== undefined && a.min !== null && a.min !== "" && a.max !== undefined && a.max !== null && a.max !== "") filled++;
  }
  if (filled === 0) return "empty";
  if (filled === ALL_AMBITION_IDS.length) return "complete";
  return "partial";
}
async function statutDD(codeDD) {
  const agences = REF.agences.filter(a => a.codeDD === codeDD);
  if (!agences.length) return "empty";
  const map = await loadSaisies(agences.map(a => a.code));
  const statuts = agences.map(a => statutSaisie(map[a.code]));
  if (statuts.every(s => s === "complete")) return "complete";
  if (statuts.every(s => s === "empty")) return "empty";
  return "partial";
}
async function statutRegion(region) {
  const dds = REF.dds.filter(d => d.region === region);
  if (!dds.length) return "empty";
  const statuts = await Promise.all(dds.map(d => statutDD(d.code)));
  if (statuts.every(s => s === "complete")) return "complete";
  if (statuts.every(s => s === "empty")) return "empty";
  return "partial";
}
function carteAvancement(label, total, counts) {
  if (!total) return "";
  return `<div class="card">
    <h2>Avancement des remontées <span class="muted">(par ${esc(label)})</span></h2>
    <div class="grid grid-3">
      <div class="kpi"><div class="kpi__label"><span class="badge badge--vert">Complètes</span></div><div class="kpi__val">${counts.complete}</div><div class="muted">sur ${total} ${esc(label)}</div></div>
      <div class="kpi"><div class="kpi__label"><span class="badge badge--jaune">Partielles</span></div><div class="kpi__val">${counts.partial}</div><div class="muted">sur ${total} ${esc(label)}</div></div>
      <div class="kpi"><div class="kpi__label"><span class="badge badge--rouge">Vides</span></div><div class="kpi__val">${counts.empty}</div><div class="muted">sur ${total} ${esc(label)}</div></div>
    </div>
  </div>`;
}
async function calculerAvancement() {
  const counts = { complete: 0, partial: 0, empty: 0 };
  if (ctx.niveau === "DD") {
    const agences = REF.agences.filter(a => a.codeDD === ctx.code);
    const map = await loadSaisies(agences.map(a => a.code));
    agences.forEach(a => counts[statutSaisie(map[a.code])]++);
    return carteAvancement("agences", agences.length, counts);
  }
  if (ctx.niveau === "REG") {
    const dds = REF.dds.filter(d => d.region === ctx.region);
    const statuts = await Promise.all(dds.map(d => statutDD(d.code)));
    statuts.forEach(s => counts[s]++);
    return carteAvancement("directions départementales", dds.length, counts);
  }
  if (ctx.niveau === "NAT") {
    const statuts = await Promise.all(REF.regions.map(r => statutRegion(r)));
    statuts.forEach(s => counts[s]++);
    return carteAvancement("régions", REF.regions.length, counts);
  }
  return "";
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

  let rows = "";
  for (const i of INDICATEURS) {
    const v1 = resA1 ? resA1[i.id] : null;
    const v2 = resA2 ? resA2[i.id] : null;
    const objectif = resA1 ? resA1[`${i.id}_OBJ`] : null;

    let atteinteCell = "—";
    if (v1 != null && objectif) {
      const ratio = v1 / objectif;
      const favorable = i.sensInverse ? ratio <= 1 : ratio >= 1;
      atteinteCell = `<span class="${favorable ? "ecart-pos" : "ecart-neg"}">${(ratio * 100).toFixed(0)} %</span>`;
    }

    let evolCell = "—";
    if (v1 != null && v2 != null) {
      const delta = v1 - v2;
      const favorable = i.sensInverse ? delta <= 0 : delta >= 0;
      const deltaTxt = i.pct ? (delta * 100).toFixed(1).replace(".", ",") + " pt" : Math.round(delta).toLocaleString("fr-FR");
      evolCell = `<span class="${favorable ? "ecart-pos" : "ecart-neg"}">${delta > 0 ? "+" : ""}${deltaTxt}</span>`;
    }

    let pairsCell = "—";
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

    rows += `<tr>
      <td><b>${esc(i.label)}</b>${i.sensInverse ? ' <span class="muted" title="Une baisse est une amélioration">▼</span>' : ""}<br><span class="muted">${esc(i.nom)}</span></td>
      <td class="num">${v1 != null ? fmtVal(i, v1) : "—"}</td>
      <td class="num">${atteinteCell}</td>
      <td class="num">${evolCell}</td>
      <td class="num">${ctx.niveau === "APE" ? pairsCell : '<span class="muted">n/a</span>'}</td>
      <td class="num">${cible != null ? fmtVal(i, cible) : "—"}</td>
      <td class="num">${amb && (amb.min != null || amb.max != null) ? `${fmtVal(i, amb.min)} – ${fmtVal(i, amb.max)}` : "—"}</td>
    </tr>`;
  }

  const avancementHtml = await calculerAvancement();

  app.innerHTML = `
  <h1>Résultats et ambitions — ${esc(ctx.nom)}</h1>
  <div class="help"><b>Aide à la lecture.</b> <b>Résultat ${ANNEE_BILAN}</b> : dernier résultat connu. <b>Taux d'atteinte</b> : résultat rapporté à l'objectif qui avait été fixé pour ${ANNEE_BILAN} (si renseigné). <b>Évolution</b> : écart avec le résultat ${ANNEE_A2}. <b>Écart aux pairs</b> (agences uniquement) : écart à la moyenne pondérée des autres agences de la même Direction Départementale. <b>Cible nationale ${CAMPAGNE}</b> : objectif fixé par les financeurs. <b>Ambition ${CAMPAGNE}</b> : fourchette saisie dans l'onglet Revue d'impact.
    <br><br><b>Ces résultats seront enrichis de données à mi-parcours pour mesurer l'avancement de la campagne ${CAMPAGNE}.</b>
  </div>
  ${avancementHtml}
  ${!resA1 ? `<div class="card">Aucun résultat ${ANNEE_BILAN} chargé pour cette structure.</div>` : ""}
  <div class="card">
    <div style="overflow-x:auto"><table>
      <thead><tr>
        <th>Indicateur</th>
        <th class="num">Résultat ${ANNEE_BILAN}</th>
        <th class="num">Taux d'atteinte objectif ${ANNEE_BILAN}</th>
        <th class="num">Évolution / ${ANNEE_A2}</th>
        <th class="num">Écart aux pairs</th>
        <th class="num">Cible nationale ${CAMPAGNE}</th>
        <th class="num">Ambition ${CAMPAGNE}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>
  <div class="toolbar"><span class="spacer"></span><button class="btn btn--primary" id="to-revue">Aller à la revue d'impact</button></div>`;
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

// ---- Bloc Remontée (saisie qualitative + ambitions + historique) ----
async function renderRemontee() {
  const wrap = document.createElement("div");
  const saisie = (await loadSaisie(ctx.code)) || { qualitatif: {}, ambitions: {}, ressources: {} };
  let domaine = "acco";
  let dernierEmail = localStorage.getItem("dernierEmailAuteur") || "";

  function render() {
    const t = TRAME[domaine];
    const q = saisie.qualitatif[domaine] || {};
    const r = saisie.ressources[domaine] || {};
    const inds = AMBITIONS_PAR_DOMAINE[domaine].map(id => IND[id]);
    const area = (grp, item) => {
      const v = q[item.id] || "";
      return `<div class="field">
        <label>${esc(item.label)}</label>
        ${item.q ? `<div class="q">${esc(item.q)}</div>` : ""}
        <textarea maxlength="${MAX_CHARS + 200}" data-q="${item.id}">${esc(v)}</textarea>
        <div class="count ${v.length > MAX_CHARS ? "over" : ""}">${v.length}/${MAX_CHARS}</div>
      </div>`;
    };
    wrap.innerHTML = `
    <h1>Revue d'impact ${CAMPAGNE} — ${esc(ctx.nom)}</h1>
    <div class="help"><b>Aide à la saisie.</b> Trois blocs par domaine : le <b>bilan ${ANNEE_BILAN}</b> (réussites et axes d'amélioration), la <b>stratégie et les leviers</b>, puis les <b>ambitions chiffrées</b> en fourchette Min/Max (± 5 % pour les volumes ; ± 0,5 pt sur TAE, ± 2 pts sur DYN ou SATIS). Les textes sont limités à ${MAX_CHARS} caractères. <b>La remontée n'étant pas nominative de bout en bout, chaque enregistrement est historisé avec l'email de son auteur</b> ; seul le compte administrateur peut consulter et restaurer les versions antérieures.</div>
    <div class="tabs">${DOMAINES.map(d => `<button class="tab ${d.id === domaine ? "active" : ""}" data-d="${d.id}">${esc(d.nom)}</button>`).join("")}</div>
    <div class="card"><h2>Bilan ${ANNEE_BILAN}</h2>${t.bilan.map(i => area("bilan", i)).join("")}</div>
    ${t.strategie.length ? `<div class="card"><h2>Stratégie</h2>${t.strategie.map(i => area("strategie", i)).join("")}</div>` : ""}
    ${t.leviers.length ? `<div class="card"><h2>Leviers d'action</h2>${t.leviers.map(i => area("leviers", i)).join("")}</div>` : ""}
    ${t.ressources.length ? `<div class="card"><h2>Ressources</h2><div class="grid grid-3">${t.ressources.map(i => `
      <div class="field"><label>${esc(i.label)}</label><input type="number" min="0" step="0.5" data-r="${i.id}" value="${esc(r[i.id] ?? "")}"></div>`).join("")}</div></div>` : ""}
    ${inds.length ? `<div class="card"><h2>Ambitions chiffrées ${CAMPAGNE}</h2>
      <div class="q">Les performances des structures comparables permettent d'étalonner vos propositions (voir l'onglet Résultats et ambitions). Taux en % (ex. 78,5) ; volumes en nombre.</div>
      ${inds.map(i => { const a = saisie.ambitions[i.id] || {};
        return `<div class="field"><label>${esc(i.label)} — <span class="muted">${esc(i.nom)}${i.sensInverse ? " (une baisse est une amélioration)" : ""}</span></label>
        <div class="minmax">
          <input type="number" step="any" placeholder="Min" data-amb="${i.id}" data-b="min" value="${esc(a.min ?? "")}">
          <input type="number" step="any" placeholder="Max" data-amb="${i.id}" data-b="max" value="${esc(a.max ?? "")}">
        </div></div>`; }).join("")}</div>` : ""}
    <div class="card">
      <div class="field" style="max-width:360px"><label for="email-auteur">Votre email (enregistré avec la remontée)</label><input type="email" id="email-auteur" placeholder="prenom.nom@francetravail.fr" value="${esc(dernierEmail)}"></div>
      <div class="toolbar"><span class="spacer"></span><button class="btn btn--primary" id="btn-save">Enregistrer la remontée</button></div>
    </div>
    ${isAdmin() ? '<div class="card" id="bloc-historique"><h2>Historique des versions</h2><p class="muted">Chargement de l\'historique…</p></div>' : ""}`;

    wrap.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { collect(); domaine = b.dataset.d; render(); }));
    wrap.querySelectorAll("textarea[data-q]").forEach(ta => ta.addEventListener("input", () => {
      const c = ta.nextElementSibling; c.textContent = `${ta.value.length}/${MAX_CHARS}`;
      c.classList.toggle("over", ta.value.length > MAX_CHARS);
    }));
    wrap.querySelector("#btn-save").addEventListener("click", async () => {
      collect();
      const email = wrap.querySelector("#email-auteur").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Merci de saisir un email valide.");
      localStorage.setItem("dernierEmailAuteur", email);
      saisie.nomStructure = ctx.nom; saisie.niveau = ctx.niveau; saisie.region = ctx.region || null; saisie.codeDD = ctx.codeDD || null;
      await saveSaisie(ctx.code, saisie, email);
      toast("Remontée enregistrée et historisée.");
      if (isAdmin()) renderHistorique();
    });
    if (isAdmin()) renderHistorique();
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
        <td>${esc(h.auteur || "—")}</td>
        <td>${idx === 0 ? '<span class="badge badge--vert">version actuelle</span>' : `<button class="btn btn--secondary" data-restore="${idx}" style="padding:4px 12px;font-size:12px">Restaurer cette version</button>`}</td>
      </tr>`).join("")}
      </tbody></table>`;
    bloc.querySelectorAll("[data-restore]").forEach(btn => btn.addEventListener("click", async () => {
      const version = hist[Number(btn.dataset.restore)];
      await saveSaisie(ctx.code, JSON.parse(JSON.stringify(version.data)), "Administrateur (restauration)");
      toast("Version restaurée.");
      location.reload();
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
      const id = inp.dataset.amb;
      saisie.ambitions[id] = saisie.ambitions[id] || {};
      saisie.ambitions[id][inp.dataset.b] = inp.value;
    });
  }
  render();
  return wrap;
}

// ---- Bloc Consolidation (agences → DD → région → national) ----
async function renderConsolidation() {
  const wrap = document.createElement("div");

  let unites = [], titreEnfants = "";
  if (ctx.niveau === "DD") {
    unites = REF.agences.filter(a => a.codeDD === ctx.code).map(a => ({ code: a.code, nom: a.nom, poids: a.poids }));
    titreEnfants = "agences";
  } else if (ctx.niveau === "REG") {
    unites = REF.dds.filter(d => d.region === ctx.region).map(d => ({ code: d.code, nom: d.nom, poids: d.poids }));
    titreEnfants = "directions départementales";
  } else {
    const pr = poidsRegions(REF);
    unites = REF.regions.map(r => ({ code: "REG_" + r, nom: r, poids: Object.fromEntries(INDICATEURS.map(i => [i.id, pr[r] || 0])) }));
    titreEnfants = "régions";
  }

  const saisies = await loadSaisies(unites.map(u => u.code));
  for (const u of unites) {
    if (saisies[u.code]) { u.saisie = saisies[u.code]; continue; }
    if (ctx.niveau === "REG") {
      const apes = REF.agences.filter(a => a.codeDD === u.code).map(a => ({ code: a.code, poids: a.poids }));
      const sub = await loadSaisies(apes.map(a => a.code));
      apes.forEach(a => a.saisie = sub[a.code]);
      const amb = {};
      for (const i of INDICATEURS) { const c = consolider(i.id, apes); if (c) amb[i.id] = { min: c.min, max: c.max }; }
      if (Object.keys(amb).length) u.saisie = { ambitions: amb, _indirect: true };
    } else if (ctx.niveau === "NAT") {
      const region = u.nom;
      const dds = REF.dds.filter(d => d.region === region).map(d => ({ code: d.code, poids: d.poids }));
      const subDD = await loadSaisies(dds.map(d => d.code));
      for (const d of dds) {
        if (subDD[d.code]) { d.saisie = subDD[d.code]; continue; }
        const apes = REF.agences.filter(a => a.codeDD === d.code).map(a => ({ code: a.code, poids: a.poids }));
        const subA = await loadSaisies(apes.map(a => a.code));
        apes.forEach(a => a.saisie = subA[a.code]);
        const amb = {};
        for (const i of INDICATEURS) { const c = consolider(i.id, apes); if (c) amb[i.id] = { min: c.min, max: c.max }; }
        if (Object.keys(amb).length) d.saisie = { ambitions: amb, _indirect: true };
      }
      const amb = {};
      for (const i of INDICATEURS) { const c = consolider(i.id, dds); if (c) amb[i.id] = { min: c.min, max: c.max }; }
      if (Object.keys(amb).length) u.saisie = { ambitions: amb, _indirect: true };
    }
  }

  const nbSaisi = unites.filter(u => u.saisie).length;
  const cibles = ctx.niveau === "NAT" ? await loadCibles() : null;

  let rows = "";
  for (const i of INDICATEURS.filter(x => x.fourchette)) {
    const c = consolider(i.id, unites);
    let cibleCell = "", ecartCell = "";
    if (cibles) {
      const cv = parseFloat(cibles[i.id]);
      cibleCell = `<td class="num"><input type="number" step="any" style="max-width:110px;text-align:right" data-cible="${i.id}" value="${isNaN(cv) ? "" : cv}"></td>`;
      if (c && !isNaN(cv)) {
        const dedans = cv >= Math.min(c.min, c.max) - 1e-9 && cv <= Math.max(c.min, c.max) + 1e-9;
        const ref = (c.min + c.max) / 2;
        const e = ref - cv;
        const favorable = i.sensInverse ? e <= 0 : e >= 0;
        ecartCell = `<td class="num">${dedans ? '<span class="badge badge--vert">dans la fourchette</span>'
          : `<span class="${favorable ? "ecart-pos" : "ecart-neg"}">${e > 0 ? "+" : ""}${i.pct ? (e * (Math.abs(e) <= 1 ? 100 : 1)).toFixed(1).replace(".", ",") + " pt" : Math.round(e).toLocaleString("fr-FR")}</span> <span class="muted">→ dialogue</span>`}</td>`;
      } else ecartCell = "<td>—</td>";
    }
    rows += `<tr><td><b>${esc(i.label)}</b><br><span class="muted">${esc(i.nom)}${i.type === "volume" ? " · somme" : " · pondéré"}</span></td>
      <td class="num">${c ? fmtVal(i, c.min) : "—"}</td><td class="num">${c ? fmtVal(i, c.max) : "—"}</td>
      <td class="num">${c ? Math.round(c.couverture * 100) + " %" : "0 %"}</td>${cibleCell}${ecartCell}</tr>`;
  }

  const listSaisies = unites.filter(u => u.saisie && !u.saisie._indirect).map(u => ({ ...u.saisie, nomStructure: u.saisie.nomStructure || u.nom }));
  const qualBlocks = DOMAINES.map(d => {
    const re = compilerTextes(listSaisies, d.id, "reussites");
    const ax = compilerTextes(listSaisies, d.id, "axes");
    if (!re.length && !ax.length) return "";
    const li = arr => arr.map(x => `<li><b>${esc(x.nom)}</b> — ${esc(x.texte.slice(0, 400))}${x.texte.length > 400 ? "…" : ""}</li>`).join("");
    return `<div class="card"><h3>${esc(d.nom)}</h3>
      ${re.length ? `<p><span class="badge badge--vert">Réussites</span></p><ul>${li(re)}</ul>` : ""}
      ${ax.length ? `<p><span class="badge badge--rouge">Difficultés / axes d'amélioration</span></p><ul>${li(ax)}</ul>` : ""}</div>`;
  }).join("");

  wrap.innerHTML = `
  <h2>Consolidation — ${esc(ctx.nom)}</h2>
  <div class="help"><b>Aide à la lecture.</b> Les <b>taux</b> sont consolidés en moyenne pondérée par les poids de chaque unité (dénominateurs des indicateurs) ; les <b>volumes</b> sont sommés. La colonne « couverture » indique la part du poids total effectivement remontée. ${ctx.niveau === "NAT" ? "Le poids d'une région dans le national est approximé par sa part d'agences." : ""} Une remontée manquante d'un niveau intermédiaire est remplacée par la consolidation de ses propres unités.</div>
  <div class="card">
    <div class="toolbar"><h3 style="margin:0">Ambitions chiffrées consolidées</h3><span class="spacer"></span>
      <span class="muted">${nbSaisi}/${unites.length} ${titreEnfants} remontées</span>
      <div class="progress" style="width:140px"><i style="width:${unites.length ? Math.round(nbSaisi / unites.length * 100) : 0}%"></i></div>
    </div>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Indicateur</th><th class="num">Min consolidé</th><th class="num">Max consolidé</th><th class="num">Couverture</th>${cibles ? '<th class="num">Cible financeurs</th><th class="num">Écart (médiane − cible)</th>' : ""}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${cibles ? '<div class="toolbar" style="margin-top:12px"><span class="muted">Cibles saisies par la Direction de la Performance (taux en décimal, ex. 0,47 ; volumes en nombre).</span><span class="spacer"></span><button class="btn btn--primary" id="btn-cibles">Enregistrer les cibles</button></div>' : ""}
  </div>
  <h3>Réussites et difficultés remontées</h3>
  ${qualBlocks || '<div class="card muted">Aucune remontée qualitative pour le moment.</div>'}`;

  if (cibles) wrap.querySelector("#btn-cibles")?.addEventListener("click", async () => {
    const data = {};
    wrap.querySelectorAll("input[data-cible]").forEach(i => { if (i.value !== "") data[i.dataset.cible] = i.value; });
    await saveCibles(data);
    toast("Cibles financeurs enregistrées.");
    nav("revue");
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
  document.querySelector(".steps").hidden = true;
  await initFirebase();
  const dejaConnecte = await waitForAuthReady();
  if (dejaConnecte) await afterAuth();
  else renderLogin(false);
})();
