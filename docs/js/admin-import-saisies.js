// Import des remontées réelles déjà saisies (extraites du classeur Excel) dans Firestore.
// Fichier attendu : saisies_2026.json : { "CODE_AGENCE": { qualitatif, ambitions, ressources, nomStructure }, ... }
// N'écrase jamais une remontée déjà modifiée en ligne (option "fusionner" par défaut).
// Ces données réelles étant réutilisées d'un exercice antérieur à des fins de démonstration,
// l'auteur est explicitement marqué "Données fictives" (visible dans l'historique des versions).
import { firebaseConfig, ACCES_EMAIL, CAMPAGNE, ANNEE_BILAN } from "./config.js";

const ANNEE_A2 = String(Number(ANNEE_BILAN) - 1);
const AUTEUR_FICTIF = "Données fictives (reprise d'un exercice antérieur réel)";

const $ = s => document.querySelector(s);
const log = m => { $("#log").textContent += m + "\n"; $("#log").scrollTop = $("#log").scrollHeight; };

// Résultats fictifs déterministes (même logique que le reste de l'application) : permet
// d'avoir un "Résultat" et une "Évolution" à afficher en face des ambitions réelles reprises.
const BASE_RES = { DYN:.76, SATIS_ACCO:.79, F_TAE:.74, DELD:800, F_PRIO:.66, TAE:.46, TPED:.16, INTENSIF:950, IMMERSIONS:480, ENT_PLUS:.25, TPO:.85, SATIS_ENT:.83, PROSPEC:640, TP:.062, SATIS_IND:.81, CDALB:.90, DPO:31, DEMAR:.92, IQVCT:.75, ENGAGEMENT:.74, ABSENTEISME:.065 };
const PCT_IDS = new Set(["DYN","SATIS_ACCO","F_TAE","F_PRIO","TAE","TPED","ENT_PLUS","TPO","SATIS_ENT","TP","SATIS_IND","CDALB","DEMAR","IQVCT","ENGAGEMENT","ABSENTEISME"]);
function demoResultats(seed) {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 9973;
  const out = {};
  for (const [k, v] of Object.entries(BASE_RES)) {
    const j = ((h = (h * 7 + 13) % 9973) / 9973 - .5);
    out[k] = PCT_IDS.has(k) ? +(v * (1 + j * .12)).toFixed(3) : Math.round(v * (1 + j * .5));
    if (PCT_IDS.has(k)) out[`${k}_OBJ`] = v;
  }
  return out;
}

async function run() {
  if (!firebaseConfig.apiKey) return log("⚠ docs/js/config.js n'est pas encore renseigné (apiKey vide).");
  const file = $("#file").files[0];
  if (!file) return log("⚠ Sélectionner le fichier saisies_2026.json.");
  const ecraser = $("#ecraser").checked;
  const genererResultats = $("#gen-resultats").checked;
  const marquerFictif = $("#marquer-fictif").checked;

  const data = JSON.parse(await file.text());
  const codes = Object.keys(data);
  log(`${codes.length} structure(s) détectée(s). Connexion à Firebase…`);

  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const fs = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const auth = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const app = appMod.initializeApp(firebaseConfig);
  const pwd = prompt("Mot de passe d'accès :");
  if (!pwd) return log("⚠ Import annulé (mot de passe requis).");
  try { await auth.signInWithEmailAndPassword(auth.getAuth(app), ACCES_EMAIL, pwd); }
  catch (e) { return log("⚠ Mot de passe incorrect."); }
  const db = fs.getFirestore(app);

  let importes = 0, ignores = 0, resultatsGeneres = 0;
  for (const code of codes) {
    const docId = `${CAMPAGNE}_${code}`;
    const ref = fs.doc(db, "saisies", docId);
    if (!ecraser) {
      const existant = await fs.getDoc(ref);
      if (existant.exists()) { log(`… ${code} déjà présent, ignoré (cochez "écraser" pour forcer).`); ignores++; continue; }
    }
    const contenu = { ...data[code], code, campagne: CAMPAGNE, updatedAt: new Date().toISOString() };
    if (marquerFictif) contenu.auteur = AUTEUR_FICTIF;
    await fs.setDoc(ref, contenu, { merge: !ecraser });

    // Historisation explicite (cohérent avec le reste de l'application).
    const histId = `${docId}_${contenu.updatedAt.replace(/[:.]/g, "-")}`;
    await fs.setDoc(fs.doc(db, "saisies_historique", histId), { code, campagne: CAMPAGNE, auteur: contenu.auteur || null, timestamp: contenu.updatedAt, data: contenu });

    if (genererResultats) {
      await fs.setDoc(fs.doc(db, "resultats", `${ANNEE_BILAN}_${code}`), demoResultats(code));
      await fs.setDoc(fs.doc(db, "resultats", `${ANNEE_A2}_${code}`), demoResultats(code + "_A2"));
      resultatsGeneres++;
    }
    log(`✓ ${code}`);
    importes++;
  }
  log(`Terminé : ${importes} importée(s), ${ignores} ignorée(s)${genererResultats ? `, résultats fictifs générés pour ${resultatsGeneres}` : ""}.`);
}

$("#btn-run").addEventListener("click", () => { $("#log").textContent = ""; run(); });
