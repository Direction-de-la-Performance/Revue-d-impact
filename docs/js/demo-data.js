// Données d'exemple utilisées UNIQUEMENT en mode démo (Firebase non configuré).
// Aucune donnée réelle : sert à tester l'interface avant le raccordement à Firestore.
const IDS = ["DELD","DEMAR","DYN","SATIS_ACCO","DPO","ENT_PLUS","SATIS_ENT","F_PRIO","F_TAE","SATIS_IND","TAE","TPED","TPO","TP"];
const poids = (seed) => Object.fromEntries(IDS.map((k, i) => [k, +(0.05 + ((seed * 7 + i * 3) % 20) / 200).toFixed(4)]));

export const REFERENTIEL_DEMO = {
  regions: ["RÉGION EXEMPLE A", "RÉGION EXEMPLE B"],
  dds: [
    { code: "DEMO_DD1", nom: "DD Exemple 1", region: "RÉGION EXEMPLE A", poids: poids(1) },
    { code: "DEMO_DD2", nom: "DD Exemple 2", region: "RÉGION EXEMPLE A", poids: poids(2) },
    { code: "DEMO_DD3", nom: "DD Exemple 3", region: "RÉGION EXEMPLE B", poids: poids(3) },
  ],
  agences: [
    { code: "DEMO_A1", nom: "Agence Exemple Nord", region: "RÉGION EXEMPLE A", codeDD: "DEMO_DD1", nomDD: "DD Exemple 1", poids: poids(11) },
    { code: "DEMO_A2", nom: "Agence Exemple Sud", region: "RÉGION EXEMPLE A", codeDD: "DEMO_DD1", nomDD: "DD Exemple 1", poids: poids(12) },
    { code: "DEMO_A3", nom: "Agence Exemple Centre", region: "RÉGION EXEMPLE A", codeDD: "DEMO_DD2", nomDD: "DD Exemple 2", poids: poids(13) },
    { code: "DEMO_A4", nom: "Agence Exemple Est", region: "RÉGION EXEMPLE B", codeDD: "DEMO_DD3", nomDD: "DD Exemple 3", poids: poids(14) },
    { code: "DEMO_A5", nom: "Agence Exemple Ouest", region: "RÉGION EXEMPLE B", codeDD: "DEMO_DD3", nomDD: "DD Exemple 3", poids: poids(15) },
  ],
};
