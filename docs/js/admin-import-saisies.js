// Import des remontées réelles déjà saisies (extraites du classeur Excel) dans Firestore.
// Fichier attendu : saisies_2026.json : { "CODE_AGENCE": { qualitatif, ambitions, ressources, nomStructure }, ... }
// N'écrase jamais une remontée déjà modifiée en ligne (option "fusionner" par défaut).
import { firebaseConfig, ACCES_EMAIL, CAMPAGNE } from "./config.js";

const $ = s => document.querySelector(s);
const log = m => { $("#log").textContent += m + "\n"; $("#log").scrollTop = $("#log").scrollHeight; };

async function run() {
  if (!firebaseConfig.apiKey) return log("⚠ docs/js/config.js n'est pas encore renseigné (apiKey vide).");
  const file = $("#file").files[0];
  if (!file) return log("⚠ Sélectionner le fichier saisies_2026.json.");
  const ecraser = $("#ecraser").checked;

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

  let importes = 0, ignores = 0;
  for (const code of codes) {
    const docId = `${CAMPAGNE}_${code}`;
    const ref = fs.doc(db, "saisies", docId);
    if (!ecraser) {
      const existant = await fs.getDoc(ref);
      if (existant.exists()) { log(`… ${code} déjà présent, ignoré (cochez "écraser" pour forcer).`); ignores++; continue; }
    }
    await fs.setDoc(ref, { ...data[code], code, campagne: CAMPAGNE, updatedAt: new Date().toISOString() }, { merge: !ecraser });
    log(`✓ ${code}`);
    importes++;
  }
  log(`Terminé : ${importes} importée(s), ${ignores} ignorée(s).`);
}

$("#btn-run").addEventListener("click", () => { $("#log").textContent = ""; run(); });
