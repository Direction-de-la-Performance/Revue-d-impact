// Couche d'accès aux données : Firebase Firestore, ou localStorage en mode démo.
import { firebaseConfig, CAMPAGNE, ACCES_EMAIL } from "./config.js";
import { REFERENTIEL_DEMO } from "./demo-data.js";

export const DEMO = !firebaseConfig.apiKey;
let db = null;
let fs = null;      // module firestore
let authMod = null; // module auth
let authInstance = null;

// Initialise Firebase (sans connecter personne). À appeler une seule fois au démarrage.
export async function initFirebase() {
  if (DEMO) return;
  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  fs = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const app = appMod.initializeApp(firebaseConfig);
  authInstance = authMod.getAuth(app);
  db = fs.getFirestore(app);
}

// Attend que Firebase ait vérifié si une session existante est valide (résiste au rafraîchissement de page).
export function waitForAuthReady() {
  if (DEMO) return Promise.resolve(true);
  return new Promise(resolve => {
    const unsub = authMod.onAuthStateChanged(authInstance, user => { unsub(); resolve(!!user); });
  });
}

// Tente la connexion avec le mot de passe partagé saisi par l'utilisateur.
export async function signInShared(password) {
  if (DEMO) return true;
  try {
    await authMod.signInWithEmailAndPassword(authInstance, ACCES_EMAIL, password);
    return true;
  } catch (e) {
    return false;
  }
}

export async function signOutShared() {
  if (!DEMO) await authMod.signOut(authInstance);
}

// ---- Référentiel (agences, DD, régions, pondérations) — stocké dans Firestore ----
// Collections "ref_agences" et "ref_dds" (docId = code de la structure), alimentées
// une seule fois via docs/admin-import-referentiel.html. Aucune donnée n'est commitée sur GitHub.
let REF = null;
export async function getReferentiel() {
  if (REF) return REF;
  if (DEMO) { REF = REFERENTIEL_DEMO; return REF; }
  const [agSnap, ddSnap] = await Promise.all([
    fs.getDocs(fs.collection(db, "ref_agences")),
    fs.getDocs(fs.collection(db, "ref_dds")),
  ]);
  const agences = agSnap.docs.map(d => ({ code: d.id, ...d.data() }));
  const dds = ddSnap.docs.map(d => ({ code: d.id, ...d.data() }));
  const regions = [...new Set(dds.map(d => d.region))].sort();
  REF = { agences, dds, regions };
  return REF;
}

// ---- Saisies (une par structure et par campagne) ----
// docId = `${CAMPAGNE}_${codeStructure}` ; structure = code agence, code DD, slug région ou "NATIONAL"
const lsKey = id => `revue_${id}`;

export async function loadSaisie(code) {
  const id = `${CAMPAGNE}_${code}`;
  if (DEMO) {
    const raw = localStorage.getItem(lsKey(id));
    return raw ? JSON.parse(raw) : null;
  }
  const snap = await fs.getDoc(fs.doc(db, "saisies", id));
  return snap.exists() ? snap.data() : null;
}

export async function saveSaisie(code, data) {
  const id = `${CAMPAGNE}_${code}`;
  data.updatedAt = new Date().toISOString();
  data.code = code;
  data.campagne = CAMPAGNE;
  if (DEMO) { localStorage.setItem(lsKey(id), JSON.stringify(data)); return; }
  await fs.setDoc(fs.doc(db, "saisies", id), data, { merge: true });
}

export async function loadSaisies(codes) {
  const out = {};
  if (DEMO) {
    for (const c of codes) {
      const raw = localStorage.getItem(lsKey(`${CAMPAGNE}_${c}`));
      if (raw) out[c] = JSON.parse(raw);
    }
    return out;
  }
  // Firestore : requête par lot de 30 (limite "in")
  for (let i = 0; i < codes.length; i += 30) {
    const batch = codes.slice(i, i + 30).map(c => `${CAMPAGNE}_${c}`);
    const q = fs.query(fs.collection(db, "saisies"), fs.where(fs.documentId(), "in", batch));
    const snaps = await fs.getDocs(q);
    snaps.forEach(d => { out[d.data().code] = d.data(); });
  }
  return out;
}

// ---- Résultats N-1 (diagnostic) : collection "resultats", docId = `${ANNEE}_${code}` ----
export async function loadResultats(annee, code) {
  const id = `${annee}_${code}`;
  if (DEMO) {
    const raw = localStorage.getItem(`res_${id}`);
    return raw ? JSON.parse(raw) : null;
  }
  const snap = await fs.getDoc(fs.doc(db, "resultats", id));
  return snap.exists() ? snap.data() : null;
}

// ---- Cibles financeurs (national) ----
export async function loadCibles() {
  if (DEMO) {
    const raw = localStorage.getItem(`cibles_${CAMPAGNE}`);
    return raw ? JSON.parse(raw) : {};
  }
  const snap = await fs.getDoc(fs.doc(db, "cibles_financeurs", CAMPAGNE));
  return snap.exists() ? snap.data() : {};
}

export async function saveCibles(data) {
  if (DEMO) { localStorage.setItem(`cibles_${CAMPAGNE}`, JSON.stringify(data)); return; }
  await fs.setDoc(fs.doc(db, "cibles_financeurs", CAMPAGNE), data, { merge: true });
}
