// Configuration Firebase du projet.
// Renseigner les valeurs depuis la console Firebase (Paramètres du projet > Vos applications > Web).
// Tant que apiKey est vide, l'application fonctionne en MODE DÉMO (stockage local navigateur).
export const firebaseConfig = {
  apiKey: "AIzaSyCoyi-T8ayowpaGnAU8PE90wuDz0qcMo7o",
  authDomain: "revue-impact-ft.firebaseapp.com",
  projectId: "revue-impact-ft",
  storageBucket: "revue-impact-ft.firebasestorage.app",
  messagingSenderId: "394234504329",
  appId: "1:394234504329:web:081d809188166e884f9258"
};

export const CAMPAGNE = "2026"; // millésime des ambitions
export const ANNEE_BILAN = "2025"; // année du diagnostic

// Accès partagé : un compte Firebase unique sert de "porte d'entrée" pour tous les
// utilisateurs, qui ne saisissent que le mot de passe (l'email ci-dessous est un
// identifiant technique, jamais montré à l'écran). Ce compte doit être créé une fois
// dans Firebase Console > Authentication > Users, avec exactement cet email et ce mot
// de passe (voir README).
export const ACCES_EMAIL = "acces.reseau@revue-impact.ft";
