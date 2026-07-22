// Modèle métier de la revue d'impact, issu de l'outil Excel DD/Agences.

// type: 'taux' (pondération) | 'volume' (somme) - règle de consolidation
// fourchette: false = indicateur imposé (CDALb, DPO, DEMAR), pas de Min/Max local
export const INDICATEURS = [
  { id:"DYN",        label:"DYN",        nom:"Dynamisation de l'accompagnement",                 domaine:"acco", type:"taux",   pct:true,  fourchette:true  },
  { id:"SATIS_ACCO", label:"Satis Acco", nom:"Satisfaction relative à l'accompagnement",         domaine:"acco", type:"taux",   pct:true,  fourchette:true  },
  { id:"F_TAE",      label:"F-TAE",      nom:"Accès à l'emploi 6 mois après formation « emploi direct »", domaine:"acco", type:"taux", pct:true, fourchette:true },
  { id:"DELD",       label:"DELD",       nom:"Demandeurs d'emploi de longue durée",              domaine:"acco", type:"volume", pct:false, fourchette:true, sensInverse:true },
  { id:"F_PRIO",     label:"F-PRIO",     nom:"Part des publics prioritaires dans les entrants en formation", domaine:"acco", type:"taux", pct:true, fourchette:true },
  { id:"TAE",        label:"TAE",        nom:"Taux d'accès à l'emploi",                          domaine:"acco", type:"taux",   pct:true,  fourchette:true  },
  { id:"TPED",       label:"TPED",      nom:"Taux de présence en emploi durable",               domaine:"acco", type:"taux",   pct:true,  fourchette:true  },
  { id:"INTENSIF",   label:"Acco intensif", nom:"Entrées en accompagnement intensif",           domaine:"acco", type:"volume", pct:false, fourchette:true  },
  { id:"IMMERSIONS", label:"Immersions", nom:"Nombre d'immersions",                              domaine:"acco", type:"volume", pct:false, fourchette:true  },
  { id:"ENT_PLUS",   label:"ENT+",       nom:"Part des établissements ayant recours à France Travail", domaine:"pro", type:"taux", pct:true, fourchette:true },
  { id:"TPO",        label:"TPO",        nom:"Taux de pourvoi des offres",                       domaine:"pro",  type:"taux",   pct:true,  fourchette:true  },
  { id:"SATIS_ENT",  label:"Satis Ent",  nom:"Satisfaction des entreprises",                     domaine:"pro",  type:"taux",   pct:true,  fourchette:true  },
  { id:"PROSPEC",    label:"Prospections", nom:"Prospections / fidélisation",                    domaine:"pro",  type:"volume", pct:false, fourchette:true  },
  { id:"TP",         label:"TP",         nom:"Taux de trop-perçus",                              domaine:"ind",  type:"taux",   pct:true,  fourchette:true, sensInverse:true },
  { id:"SATIS_IND",  label:"Satis Ind",  nom:"Satisfaction relative à l'indemnisation",          domaine:"ind",  type:"taux",   pct:true,  fourchette:true  },
  { id:"CDALB",      label:"CDALb",      nom:"Conformité du traitement de la demande d'allocation", domaine:"ind", type:"taux", pct:true,  fourchette:false },
  { id:"DPO",        label:"DPO",        nom:"Délai de pourvoi des offres (jours)",              domaine:"pro",  type:"taux",   pct:false, fourchette:false, sensInverse:true },
  { id:"DEMAR",      label:"DEMAR",      nom:"DE ayant signé un contrat d'engagement",           domaine:"acco", type:"taux",   pct:true,  fourchette:false },
  { id:"IQVCT",      label:"IQVCT",      nom:"Indice de qualité de vie et des conditions de travail", domaine:"perf", type:"taux", pct:true, fourchette:true, objectifSimple:true },
  { id:"ENGAGEMENT", label:"Engagement", nom:"Indice d'engagement des collaborateurs",           domaine:"perf", type:"taux",   pct:true,  fourchette:true, objectifSimple:true },
  { id:"ABSENTEISME",label:"Absentéisme",nom:"Taux d'absentéisme",                                domaine:"perf", type:"taux",   pct:true,  fourchette:true, objectifSimple:true, sensInverse:true },
];

export const DOMAINES = [
  { id:"acco", nom:"Accompagnement",       couleur:"violet" },
  { id:"pro",  nom:"France Travail Pro",   couleur:"bleu"   },
  { id:"ind",  nom:"Indemnisation",        couleur:"jaune"  },
  { id:"perf", nom:"Performance sociale",  couleur:"vert"   },
  { id:"eff",  nom:"Efficience & coopération", couleur:"rouge" },
];

// Trame qualitative par domaine, reprise de l'outil Excel (questions d'origine, max 1500 caractères)
export const TRAME = {
  acco: {
    bilan: [
      { id:"reussites", label:"Réussites", q:"Quelles ont été vos percées, vos réussites en 2025 ? Quels éléments de votre stratégie territoriale peuvent les expliquer ?" },
      { id:"axes", label:"Axes d'amélioration", q:"Quels sont les axes sur lesquels vous estimez devoir progresser en 2026 ? Comment dépasser les freins rencontrés ?" },
    ],
    strategie: [
      { id:"publics_prio", label:"Stratégie publics prioritaires", q:"Décrivez votre stratégie d'accompagnement par type de public (Jeunes, 50+, DEBOE, QPV, RSA, DELD…) au regard de vos spécificités territoriales." },
      { id:"intensif_fse", label:"Stratégie acco intensif, FSE", q:"Quelle est votre stratégie d'allocation des moyens entre accompagnement intensif et accompagnements « autres » ?" },
      { id:"budget", label:"Stratégie allocation budgétaire", q:"Quelle est votre stratégie globale pour tenir vos enveloppes budgétaires 2026 ?" },
      { id:"ods", label:"Articulation ODS partenariale", q:"Quels partenariats souhaitez-vous développer pour répondre aux besoins des demandeurs d'emploi ? De quoi avez-vous besoin ?" },
      { id:"rh", label:"Stratégie globale RH", q:"Quels sont vos besoins en accompagnement RH et développement de compétences ? Quelles priorités de performance sociale ?" },
    ],
    leviers: [
      { id:"immersion", label:"Ambition d'immersions", q:"Quelle stratégie en matière d'immersion et comment cela se traduit-il en volume ?" },
      { id:"formations", label:"Priorisation des formations", q:"Quelle stratégie pour réussir l'adéquation emplois à pourvoir / compétences disponibles (Attirer / Former / Recruter) ?" },
      { id:"prestations", label:"Stratégie d'entrée en prestation", q:"Quelles prestations développer ou réduire, en vous appuyant sur le réseau partenarial ?" },
      { id:"demar", label:"Actions DEMAR", q:"Quelle organisation pour mobiliser au plus vite le service le plus adapté aux besoins du demandeur d'emploi ?" },
      { id:"efficience", label:"Efficience", q:"Quelle stratégie d'allocation et de redéploiement des ressources ? Quelles actions renforcer, déprioriser ou arrêter ?" },
      { id:"cooperation", label:"Coopération", q:"Quelles actions pour développer l'entraide (entre équipes, agences, DT, territoires, plateformes…) ?" },
    ],
    ressources: [
      { id:"etp_intensif", label:"ETP mobilisés en portefeuilles intensifs" },
      { id:"etp_autre", label:"ETP dédiés à l'accompagnement « autre »" },
    ],
  },
  pro: {
    bilan: [
      { id:"reussites", label:"Réussites", q:"Quelles ont été vos percées, vos réussites en 2025 sur la relation entreprise ?" },
      { id:"axes", label:"Axes d'amélioration", q:"Quels sont vos axes prioritaires 2026 sur le volet entreprise ?" },
    ],
    strategie: [
      { id:"prospection", label:"Stratégie de prospection / fidélisation", q:"Ambition nationale : 500 000 prospections en 2026 (+25 %). Quelle stratégie (approche sectorielle, grands comptes, task force) ?" },
      { id:"intermediation", label:"Stratégie d'intermédiation", q:"Quelle stratégie pour optimiser le pourvoi des offres (MER, MEC, PDP, MRS) ?" },
      { id:"rh", label:"Stratégie globale RH", q:"Quels besoins en accompagnement RH pour optimiser la relation entreprise ?" },
    ],
    leviers: [
      { id:"aller_vers", label:"Aller vers l'entreprise (ODS partenariale)", q:"Quelles prestations développer ou réduire en 2026 en vous appuyant sur le réseau partenarial ?" },
      { id:"adaptation", label:"Actions d'adaptation à l'emploi (POEI…)", q:"Quelle stratégie d'adaptation à l'emploi au regard des écarts emplois / compétences ?" },
      { id:"tfe", label:"Task force entreprise / partenaires", q:"Comment travailler en coordination avec les task-force entreprise ?" },
      { id:"mrs", label:"Mobilisation de la MRS", q:"Comment la MRS peut-elle promouvoir des profils différents ? Quelle stratégie de ciblage ?" },
      { id:"evenements", label:"Mobilisation des événements", q:"Quelle stratégie de mobilisation des événements (fréquence, mutualisation, ciblage…) ?" },
    ],
    ressources: [ { id:"etp_cde", label:"Nombre d'ETP CDE" } ],
  },
  ind: {
    bilan: [
      { id:"reussites", label:"Réussites", q:"Quelles réussites 2025 en matière d'indemnisation ?" },
      { id:"axes", label:"Axes d'amélioration", q:"Quels axes de progrès 2026 (réitération, proactivité, traitement de la charge…) ?" },
    ],
    strategie: [
      { id:"bon_droit", label:"Payer le bon droit au bon moment", q:"Quelle organisation pour sécuriser la conformité et les délais ?" },
      { id:"non_recours", label:"Lutte contre le non-recours", q:"Quelles actions de proactivité vers les demandeurs d'emploi ?" },
      { id:"tp", label:"Recouvrer et anticiper les trop-perçus", q:"Quelle stratégie de prévention et de recouvrement des TP ?" },
    ],
    leviers: [], ressources: [],
  },
  perf: {
    bilan: [
      { id:"reussites", label:"Réussites", q:"Quelles réussites 2025 en matière de performance sociale (QVCT, engagement, absentéisme) ?" },
      { id:"axes", label:"Axes d'amélioration", q:"Quelles priorités 2026 (prévention absentéisme, QVCT, développement de compétences, IA, loi LPE) ?" },
    ],
    strategie: [
      { id:"qvct", label:"Actions QVCT / engagement", q:"Quelles actions pour prévenir l'absentéisme et renforcer l'engagement et la coopération ?" },
      { id:"competences", label:"Développement de compétences", q:"Quel accompagnement au développement de compétences (transformation, efficience, IA) ?" },
    ],
    leviers: [], ressources: [],
  },
  eff: {
    bilan: [
      { id:"reussites", label:"Réussites", q:"Quels gains d'efficience et coopérations réussies en 2025 ?" },
      { id:"axes", label:"Axes d'amélioration", q:"Quels redéploiements et mutualisations prioriser en 2026 ?" },
    ],
    strategie: [
      { id:"efficience", label:"Démarche efficience", q:"Quelle stratégie d'allocation et de redéploiement des ressources en fonction des gains prévus ?" },
      { id:"cooperation", label:"Démarche coopération", q:"Quelles actions d'entraide entre équipes, agences, DT, territoires, plateformes ?" },
    ],
    leviers: [], ressources: [],
  },
};

export const MAX_CHARS = 1500;

// Ambitions chiffrées rattachées à chaque domaine (ordre d'affichage)
export const AMBITIONS_PAR_DOMAINE = {
  acco: ["DYN","SATIS_ACCO","F_TAE","DELD","F_PRIO","TAE","TPED","INTENSIF","IMMERSIONS"],
  pro:  ["ENT_PLUS","TPO","SATIS_ENT","PROSPEC"],
  ind:  ["TP","SATIS_IND"],
  perf: ["IQVCT","ENGAGEMENT","ABSENTEISME"], eff: [],
};

export function fmtVal(ind, v) {
  if (v == null || v === "" || isNaN(v)) return "-";
  const n = Number(v);
  if (ind.pct) return (n <= 1 ? n * 100 : n).toFixed(1).replace(".", ",") + " %";
  return n.toLocaleString("fr-FR");
}
