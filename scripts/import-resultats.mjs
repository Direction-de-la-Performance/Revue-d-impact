// Import des résultats N-1 dans Firestore (collection "resultats").
// Usage : node scripts/import-resultats.mjs resultats.csv 2025
// CSV attendu : code;DYN;SATIS_ACCO;F_TAE;DELD;F_PRIO;TAE;TPED;INTENSIF;IMMERSIONS;ENT_PLUS;TPO;SATIS_ENT;PROSPEC;TP;SATIS_IND;CDALB;DPO;DEMAR
// Prérequis : npm i firebase-admin ; variable GOOGLE_APPLICATION_CREDENTIALS vers la clé de service.
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [file, annee] = process.argv.slice(2);
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const lines = readFileSync(file, "utf8").trim().split(/\r?\n/);
const head = lines[0].split(";");
for (const line of lines.slice(1)) {
  const cols = line.split(";");
  const code = cols[0];
  const doc = {};
  head.slice(1).forEach((h, i) => { const v = parseFloat(cols[i + 1]?.replace(",", ".")); if (!isNaN(v)) doc[h] = v; });
  await db.collection("resultats").doc(`${annee}_${code}`).set(doc);
  console.log(code);
}
