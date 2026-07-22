// Couche d'accès aux données : Firebase Firestore, ou localStorage en mode démo.
import { firebaseConfig, CAMPAGNE, ACCES_EMAIL, ADMIN_EMAIL } from "./config.js";
import { REFERENTIEL_DEMO } from "./demo-data.js";

export const DEMO = !firebaseConfig.apiKey;
let db = null;
let fs = null;      // module firestore
let authMod = null; // module auth
let authInstance = null;
let demoIsAdmin = localStorage.getItem("demoIsAdmin") === "1";

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

// Tente la connexion avec le mot de passe saisi : essaie d'abord le compte utilisateur
// partagé, puis le compte administrateur. isAdmin() reflète ensuite lequel a matché.
export async function signInShared(password) {
  if (DEMO) {
    demoIsAdmin = password === "Admin_ImpactFT";
    localStorage.setItem("demoIsAdmin", demoIsAdmin ? "1" : "0");
    return true;
  }
  try { await authMod.signInWithEmailAndPassword(authInstance, ACCES_EMAIL, password); return true; }
  catch (e) { /* essai suivant */ }
  try { await authMod.signInWithEmailAndPassword(authInstance, ADMIN_EMAIL, password); return true; }
  catch (e) { return false; }
}

export function isAdmin() {
  if (DEMO) return demoIsAdmin;
  return (authInstance?.currentUser?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export async function signOutShared() {
  demoIsAdmin = false;
  localStorage.removeItem("demoIsAdmin");
  if (!DEMO) await authMod.signOut(authInstance);
}

// ---- Référentiel (agences, DD, régions, pondérations), stocké dans Firestore ----
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

// Enregistre la remontée, en conservant l'auteur, et archive une copie horodatée
// dans "saisies_historique" (traçabilité, car la remontée n'est pas nominative de bout en bout).
export async function saveSaisie(code, data, auteur) {
  const id = `${CAMPAGNE}_${code}`;
  const horodatage = new Date().toISOString();
  data.updatedAt = horodatage;
  data.code = code;
  data.campagne = CAMPAGNE;
  data.auteur = auteur || data.auteur || null;

  if (DEMO) {
    localStorage.setItem(lsKey(id), JSON.stringify(data));
    const histKey = `hist_${id}`;
    const hist = JSON.parse(localStorage.getItem(histKey) || "[]");
    hist.unshift({ timestamp: horodatage, auteur: data.auteur, data: JSON.parse(JSON.stringify(data)) });
    localStorage.setItem(histKey, JSON.stringify(hist.slice(0, 50)));
    return;
  }
  await fs.setDoc(fs.doc(db, "saisies", id), data, { merge: true });
  const histId = `${id}_${horodatage.replace(/[:.]/g, "-")}`;
  await fs.setDoc(fs.doc(db, "saisies_historique", histId), {
    code, campagne: CAMPAGNE, auteur: data.auteur, timestamp: horodatage, data,
  });
}

// Historique des versions d'une remontée, la plus récente en premier.
export async function loadHistorique(code) {
  if (DEMO) {
    return JSON.parse(localStorage.getItem(`hist_${CAMPAGNE}_${code}`) || "[]");
  }
  const prefix = `${CAMPAGNE}_${code}_`;
  const q = fs.query(
    fs.collection(db, "saisies_historique"),
    fs.where(fs.documentId(), ">=", prefix),
    fs.where(fs.documentId(), "<=", prefix + "\uf8ff")
  );
  const snaps = await fs.getDocs(q);
  const out = snaps.docs.map(d => d.data());
  out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return out;
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
  // Firestore : requêtes par lot de 30 (limite "in"), lancées en parallèle plutôt que séquentiellement.
  const lots = [];
  for (let i = 0; i < codes.length; i += 30) lots.push(codes.slice(i, i + 30).map(c => `${CAMPAGNE}_${c}`));
  await Promise.all(lots.map(async (lot) => {
    const q = fs.query(fs.collection(db, "saisies"), fs.where(fs.documentId(), "in", lot));
    const snaps = await fs.getDocs(q);
    snaps.forEach(d => { out[d.data().code] = d.data(); });
  }));
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
