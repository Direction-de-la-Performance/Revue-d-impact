// Import des résultats N-1 depuis un CSV, entièrement côté navigateur.
// Nécessite : authentification anonyme + règles Firestore autorisant l'écriture (déjà en place).
import { firebaseConfig, ACCES_EMAIL, ADMIN_EMAIL, ANNEE_BILAN } from "./config.js";

const COLS = ["DYN","SATIS_ACCO","F_TAE","DELD","F_PRIO","TAE","TPED","INTENSIF","IMMERSIONS","ENT_PLUS","TPO","SATIS_ENT","PROSPEC","TP","SATIS_IND","CDALB","DPO","DEMAR"];

const $ = s => document.querySelector(s);
const log = m => { $("#log").textContent += m + "\n"; $("#log").scrollTop = $("#log").scrollHeight; };

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(";").map(h => h.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(";");
    const code = cols[0]?.trim();
    if (!code) continue;
    const doc = {};
    head.slice(1).forEach((h, i) => {
      const raw = (cols[i + 1] || "").trim().replace(",", ".");
      const v = parseFloat(raw);
      if (!isNaN(v) && (COLS.includes(h) || h.endsWith("_OBJ"))) doc[h] = v;
    });
    rows.push({ code, doc });
  }
  return rows;
}

async function run() {
  const file = $("#file").files[0];
  const text = file ? await file.text() : $("#csv").value;
  const annee = $("#annee").value.trim();
  if (!annee) return log(`⚠ Indiquer l'année (ex. ${ANNEE_BILAN}).`);
  if (!text.trim()) return log("⚠ Aucun contenu CSV.");
  if (!firebaseConfig.apiKey) return log("⚠ public/js/config.js n'est pas encore renseigné (apiKey vide).");

  const rows = parseCSV(text);
  log(`${rows.length} ligne(s) détectée(s). Connexion à Firebase…`);

  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const fs = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const auth = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const app = appMod.initializeApp(firebaseConfig);
  const pwd = prompt("Mot de passe d'accès :");
  if (!pwd) return log("⚠ Import annulé (mot de passe requis).");
  try { await auth.signInWithEmailAndPassword(auth.getAuth(app), ACCES_EMAIL, pwd); }
  catch (e1) {
    try { await auth.signInWithEmailAndPassword(auth.getAuth(app), ADMIN_EMAIL, pwd); }
    catch (e2) { return log("⚠ Mot de passe incorrect."); }
  }
  const db = fs.getFirestore(app);

  let ok = 0, err = 0;
  for (const { code, doc } of rows) {
    try {
      await fs.setDoc(fs.doc(db, "resultats", `${annee}_${code}`), doc, { merge: true });
      ok++; log(`✓ ${code}`);
    } catch (e) { err++; log(`✗ ${code} : ${e.message}`); }
  }
  log(`Terminé : ${ok} importé(s), ${err} erreur(s).`);
}

$("#btn-run").addEventListener("click", () => { $("#log").textContent = ""; run(); });
$("#annee").value = ANNEE_BILAN;
