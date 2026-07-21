import { INDICATEURS, DOMAINES, TRAME, AMBITIONS_PAR_DOMAINE, MAX_CHARS, fmtVal } from "./model.js";
import { initFirebase, waitForAuthReady, signInShared, signOutShared, getReferentiel, loadSaisie, saveSaisie, loadSaisies, loadResultats, loadCibles, saveCibles, DEMO } from "./store.js";
import { consolider, compilerTextes, poidsRegions } from "./consolidation.js";
import { CAMPAGNE, ANNEE_BILAN } from "./config.js";

const IND = Object.fromEntries(INDICATEURS.map(i => [i.id, i]));
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
const views = { accueil: viewAccueil, diagnostic: viewDiagnostic, saisie: viewSaisie, consolidation: viewConsolidation };
let current = "accueil";
function nav(v) {
  current = v;
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
      <div class="card" style="margin:0"><span class="badge badge--violet">Étape 1</span><h3>Diagnostic</h3><p class="muted">Repères de résultats ${ANNEE_BILAN} à chaque maille de l'organisation.</p></div>
      <div class="card" style="margin:0"><span class="badge badge--violet">Étape 2</span><h3>Remontée</h3><p class="muted">Saisie des réussites, difficultés et ambitions ${CAMPAGNE} (fourchettes Min/Max).</p></div>
      <div class="card" style="margin:0"><span class="badge badge--violet">Étape 3</span><h3>Consolidation</h3><p class="muted">Agrégation pondérée Agences → DD → Région → National et comparaison aux cibles financeurs.</p></div>
    </div>
  </div>
  <div class="card">
    <h2>Sélectionner votre structure</h2>
    <div class="help"><b>Aide à la lecture.</b> La structure sélectionnée détermine la maille des trois étapes : ses repères au diagnostic, sa grille de saisie, et le périmètre consolidé (ses unités rattachées). Les fourchettes proposées doivent rester raisonnables : ± 0,5 pt sur TAE, ± 2 pts sur DYN ou SATIS. CDALb, DPO et DEMAR sont fixés nationalement, sans fourchette locale.</div>
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
    <button class="btn btn--primary" id="btn-go">Accéder au diagnostic</button>
  </div>
  <div class="card">
    <h2>Cadrage général ${CAMPAGNE}</h2>
    <p>L'ambition est d'établir un dialogue ascendant et de valoriser la performance collective, en favorisant la coopération plutôt que la compétition. Orientations stratégiques : renforcer l'accompagnement personnalisé (660 000 entrées en accompagnement intensif, dont 30 % de bénéficiaires du RSA), intensifier la relation entreprise (500 000 prospections), sécuriser financièrement les usagers, améliorer la performance sociale et intégrer la démarche RSE.</p>
  </div>`;

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
  // Pré-remplissage depuis le contexte
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
    nav("diagnostic");
  });
}

// ---- Résultats N-1 (démo déterministe si absent) ----
const BASE_RES = { DYN:.76, SATIS_ACCO:.79, F_TAE:.74, DELD:800, F_PRIO:.66, TAE:.46, TPED:.16, INTENSIF:950, IMMERSIONS:480, ENT_PLUS:.25, TPO:.85, SATIS_ENT:.83, PROSPEC:640, TP:.062, SATIS_IND:.81, CDALB:.90, DPO:31, DEMAR:.92 };
function demoResultats(code) {
  let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 9973;
  const out = {};
  for (const [k, v] of Object.entries(BASE_RES)) {
    const j = ((h = (h * 7 + 13) % 9973) / 9973 - .5); // -0,5..0,5
    out[k] = IND[k].pct ? +(v * (1 + j * .12)).toFixed(3) : Math.round(v * (1 + j * .5));
  }
  return out;
}
async function getRes(code) {
  return (await loadResultats(ANNEE_BILAN, code)) || (DEMO ? demoResultats(code) : null);
}

// ---- Vue Diagnostic ----
async function viewDiagnostic() {
  if (!ctx.code) { nav("accueil"); return toast("Sélectionner d'abord une structure."); }
  const res = await getRes(ctx.code);
  const saisie = await loadSaisie(ctx.code);
  let html = `
  <h1>Diagnostic — ${esc(ctx.nom)}</h1>
  <div class="help"><b>Aide à la lecture.</b> Repères de résultats ${ANNEE_BILAN} de votre structure. Ils servent de point de départ au dialogue : les ambitions ${CAMPAGNE} traduisent une progression, une stabilisation ou, le cas échéant, une baisse assumée si elle participe d'un retour à des pratiques vertueuses. Les indicateurs sur fond sable (CDALb, DPO, DEMAR) sont fixés nationalement.
    <div class="legend"><span class="l-real">Réalisé ${ANNEE_BILAN}</span><span class="l-amb">Ambition ${CAMPAGNE} saisie (Min – Max)</span></div>
  </div>`;
  if (!res) {
    html += `<div class="card">Aucun résultat ${ANNEE_BILAN} chargé pour cette structure. Importer les données via la collection <code>resultats</code> (voir README).</div>`;
  } else {
    for (const d of DOMAINES) {
      const inds = INDICATEURS.filter(i => i.domaine === d.id);
      if (!inds.length) continue;
      html += `<div class="card"><h2><span class="badge badge--${d.couleur === 'vert' ? 'vert' : d.couleur}">${esc(d.nom)}</span></h2><div class="grid grid-kpi">`;
      for (const i of inds) {
        const amb = saisie?.ambitions?.[i.id];
        html += `<div class="kpi ${i.fourchette ? "" : "kpi--impose"}">
          <div class="kpi__label">${esc(i.label)}${i.sensInverse ? ' <span class="muted" title="Une baisse est une amélioration">▼</span>' : ""}</div>
          <div class="kpi__name">${esc(i.nom)}</div>
          <div class="kpi__val">${fmtVal(i, res[i.id])}</div>
          ${amb && (amb.min || amb.max) ? `<div class="kpi__amb">Ambition : ${fmtVal(i, amb.min)} – ${fmtVal(i, amb.max)}</div>` : ""}
          ${i.fourchette ? "" : '<div class="muted">objectif national imposé</div>'}
        </div>`;
      }
      html += `</div></div>`;
    }
  }
  html += `<div class="toolbar"><span class="spacer"></span><button class="btn btn--primary" id="to-saisie">Passer à la remontée</button></div>`;
  app.innerHTML = html;
  $("#to-saisie").addEventListener("click", () => nav("saisie"));
}

// ---- Vue Saisie ----
async function viewSaisie() {
  if (!ctx.code) { nav("accueil"); return toast("Sélectionner d'abord une structure."); }
  const saisie = (await loadSaisie(ctx.code)) || { qualitatif: {}, ambitions: {}, ressources: {} };
  let domaine = "acco";

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
    app.innerHTML = `
    <h1>Remontée ${CAMPAGNE} — ${esc(ctx.nom)}</h1>
    <div class="help"><b>Aide à la saisie.</b> Trois blocs par domaine : le <b>bilan ${ANNEE_BILAN}</b> (réussites et axes d'amélioration), la <b>stratégie et les leviers</b>, puis les <b>ambitions chiffrées</b> en fourchette Min/Max (± 5 % pour les volumes ; ± 0,5 pt sur TAE, ± 2 pts sur DYN ou SATIS). Les textes sont limités à ${MAX_CHARS} caractères. L'enregistrement alimente directement la consolidation du niveau supérieur.</div>
    <div class="tabs">${DOMAINES.map(d => `<button class="tab ${d.id === domaine ? "active" : ""}" data-d="${d.id}">${esc(d.nom)}</button>`).join("")}</div>
    <div class="card"><h2>Bilan ${ANNEE_BILAN}</h2>${t.bilan.map(i => area("bilan", i)).join("")}</div>
    ${t.strategie.length ? `<div class="card"><h2>Stratégie</h2>${t.strategie.map(i => area("strategie", i)).join("")}</div>` : ""}
    ${t.leviers.length ? `<div class="card"><h2>Leviers d'action</h2>${t.leviers.map(i => area("leviers", i)).join("")}</div>` : ""}
    ${t.ressources.length ? `<div class="card"><h2>Ressources</h2><div class="grid grid-3">${t.ressources.map(i => `
      <div class="field"><label>${esc(i.label)}</label><input type="number" min="0" step="0.5" data-r="${i.id}" value="${esc(r[i.id] ?? "")}"></div>`).join("")}</div></div>` : ""}
    ${inds.length ? `<div class="card"><h2>Ambitions chiffrées ${CAMPAGNE}</h2>
      <div class="q">Les performances des structures comparables permettent d'étalonner vos propositions. Un effort sur un indicateur peut compenser une moindre évolution sur un autre. Taux en % (ex. 78,5) ; volumes en nombre.</div>
      ${inds.map(i => { const a = saisie.ambitions[i.id] || {};
        return `<div class="field"><label>${esc(i.label)} — <span class="muted">${esc(i.nom)}${i.sensInverse ? " (une baisse est une amélioration)" : ""}</span></label>
        <div class="minmax">
          <input type="number" step="any" placeholder="Min" data-amb="${i.id}" data-b="min" value="${esc(a.min ?? "")}">
          <input type="number" step="any" placeholder="Max" data-amb="${i.id}" data-b="max" value="${esc(a.max ?? "")}">
        </div></div>`; }).join("")}</div>` : ""}
    <div class="toolbar"><span class="spacer"></span><button class="btn btn--secondary" id="btn-diag">Retour au diagnostic</button><button class="btn btn--primary" id="btn-save">Enregistrer la remontée</button></div>`;

    document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { collect(); domaine = b.dataset.d; render(); }));
    document.querySelectorAll("textarea[data-q]").forEach(ta => ta.addEventListener("input", () => {
      const c = ta.nextElementSibling; c.textContent = `${ta.value.length}/${MAX_CHARS}`;
      c.classList.toggle("over", ta.value.length > MAX_CHARS);
    }));
    $("#btn-diag").addEventListener("click", () => { collect(); nav("diagnostic"); });
    $("#btn-save").addEventListener("click", async () => {
      collect();
      saisie.nomStructure = ctx.nom; saisie.niveau = ctx.niveau; saisie.region = ctx.region || null; saisie.codeDD = ctx.codeDD || null;
      await saveSaisie(ctx.code, saisie);
      toast("Remontée enregistrée.");
    });
  }
  function collect() {
    const q = {};
    document.querySelectorAll("textarea[data-q]").forEach(ta => { if (ta.value.trim()) q[ta.dataset.q] = ta.value; });
    saisie.qualitatif[domaine] = q;
    const r = {};
    document.querySelectorAll("input[data-r]").forEach(inp => { if (inp.value !== "") r[inp.dataset.r] = inp.value; });
    saisie.ressources[domaine] = r;
    document.querySelectorAll("input[data-amb]").forEach(inp => {
      const id = inp.dataset.amb;
      saisie.ambitions[id] = saisie.ambitions[id] || {};
      saisie.ambitions[id][inp.dataset.b] = inp.value;
    });
  }
  render();
}

// ---- Vue Consolidation ----
async function viewConsolidation() {
  if (!ctx.code) { nav("accueil"); return toast("Sélectionner d'abord une structure."); }
  if (ctx.niveau === "APE") {
    app.innerHTML = `<h1>Consolidation</h1><div class="card">La consolidation s'effectue à partir du niveau Direction Départementale. Votre remontée d'agence alimente la consolidation de <b>${esc(REF.dds.find(d => d.code === ctx.codeDD)?.nom || "votre DD")}</b>.</div>`;
    return;
  }

  // Unités enfants selon le niveau
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
  // Remontée manquante d'un niveau intermédiaire : consolider récursivement ses propres unités
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

  // Compilation qualitative
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

  app.innerHTML = `
  <h1>Consolidation — ${esc(ctx.nom)}</h1>
  <div class="help"><b>Aide à la lecture.</b> Les <b>taux</b> sont consolidés en moyenne pondérée par les poids de chaque unité (dénominateurs des indicateurs, issus du fichier de pondération) ; les <b>volumes</b> (DELD, entrées intensif, immersions, prospections) sont sommés. La colonne « couverture » indique la part du poids total effectivement remontée : une consolidation à faible couverture n'est pas représentative. ${ctx.niveau === "NAT" ? "Le poids d'une région dans le national est approximé par sa part d'agences ; l'écart médian consolidé / cible financeur déclenche le dialogue de réajustement." : ""} Une remontée manquante d'un niveau intermédiaire est remplacée par la consolidation de ses propres unités.</div>
  <div class="card">
    <div class="toolbar"><h2 style="margin:0">Ambitions chiffrées consolidées</h2><span class="spacer"></span>
      <span class="muted">${nbSaisi}/${unites.length} ${titreEnfants} remontées</span>
      <div class="progress" style="width:140px"><i style="width:${unites.length ? Math.round(nbSaisi / unites.length * 100) : 0}%"></i></div>
    </div>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Indicateur</th><th class="num">Min consolidé</th><th class="num">Max consolidé</th><th class="num">Couverture</th>${cibles ? '<th class="num">Cible financeurs</th><th class="num">Écart (médiane − cible)</th>' : ""}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${cibles ? '<div class="toolbar" style="margin-top:12px"><span class="muted">Cibles saisies par la Direction de la Performance (taux en décimal, ex. 0,47 ; volumes en nombre).</span><span class="spacer"></span><button class="btn btn--primary" id="btn-cibles">Enregistrer les cibles</button></div>' : ""}
  </div>
  <h2>Réussites et difficultés remontées</h2>
  ${qualBlocks || '<div class="card muted">Aucune remontée qualitative pour le moment.</div>'}`;

  if (cibles) $("#btn-cibles")?.addEventListener("click", async () => {
    const data = {};
    document.querySelectorAll("input[data-cible]").forEach(i => { if (i.value !== "") data[i.dataset.cible] = i.value; });
    await saveCibles(data);
    toast("Cibles financeurs enregistrées.");
    nav("consolidation");
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
    if (ok) { await afterAuth(); } else { renderLogin(true); }
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
