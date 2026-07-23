// Import du référentiel (agences, DD, pondérations) dans Firestore, par lots de 400.
// Le fichier référentiel.json n'est JAMAIS commité sur GitHub (voir .gitignore).
import { firebaseConfig, ACCES_EMAIL, ADMIN_EMAIL } from "./config.js";

const $ = s => document.querySelector(s);
const log = m => { $("#log").textContent += m + "\n"; $("#log").scrollTop = $("#log").scrollHeight; };

async function importCollection(fs, db, name, items, keyField = "code") {
  let batch = fs.writeBatch(db), n = 0, total = 0;
  for (const item of items) {
    const { [keyField]: id, ...data } = item;
    batch.set(fs.doc(db, name, String(id)), data);
    n++; total++;
    if (n === 400) { await batch.commit(); log(`  ${name} : ${total}/${items.length}`); batch = fs.writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
  log(`✓ ${name} : ${total} document(s) importé(s).`);
}

async function run() {
  if (!firebaseConfig.apiKey) return log("⚠ docs/js/config.js n'est pas encore renseigné (apiKey vide).");
  const file = $("#file").files[0];
  if (!file) return log("⚠ Sélectionner le fichier referentiel.json.");

  log("Lecture du fichier…");
  const data = JSON.parse(await file.text());
  if (!data.agences || !data.dds) return log("⚠ Fichier invalide : champs 'agences' et 'dds' attendus.");

  log("Connexion à Firebase…");
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

  log(`Import de ${data.dds.length} direction(s) départementale(s)…`);
  await importCollection(fs, db, "ref_dds", data.dds);
  log(`Import de ${data.agences.length} agence(s)…`);
  await importCollection(fs, db, "ref_agences", data.agences);
  log("Terminé. Le référentiel est maintenant servi depuis Firestore.");
}

$("#btn-run").addEventListener("click", () => { $("#log").textContent = ""; run(); });
