# Revue d'impact — France Travail (Direction de la Performance)

Application web remplaçant le classeur Excel « Revue d'impact DD/Agences ». Trois étapes :
1. **Diagnostic** — repères de résultats N-1 à chaque maille (DG, DR, DD, Agence).
2. **Remontée** — saisie des réussites, difficultés, stratégies et ambitions Min/Max par domaine (Accompagnement, FT Pro, Indemnisation, Performance sociale, Efficience).
3. **Consolidation** — agrégation pondérée Agences → DD → Région → National (taux : moyenne pondérée par les dénominateurs ; volumes : somme), compilation des réussites/difficultés, comparaison aux cibles financeurs et mise en évidence des écarts déclenchant le dialogue de réajustement.

## Architecture
- **Front** : site statique (HTML/CSS/JS modules), design system France Travail (Marianne, tokens officiels), déployé sur **GitHub Pages** (dossier `docs/`, branche `main`).
- **Données** : **Firebase Firestore** (auth anonyme). Collections :
  - `saisies/{campagne}_{code}` — remontées par structure ;
  - `resultats/{annee}_{code}` — résultats N-1 ;
  - `cibles_financeurs/{campagne}` — cibles nationales.
- **Référentiel** : `docs/assets/referentiel.json` — 839 agences, 104 DD, 18 régions et **pondérations par indicateur**, extraits du classeur Excel source.

## Mise en route (sans terminal)
1. Créer un projet Firebase, activer **Firestore** et l'**authentification anonyme** (console web Firebase).
2. Renseigner `docs/js/config.js` (firebaseConfig) directement via l'éditeur GitHub (icône crayon sur le fichier). Sans configuration, l'app tourne en **mode démo** (localStorage, résultats N-1 simulés).
3. Copier le contenu de `firestore.rules` dans Firestore Database > Règles (console Firebase) → Publier.
4. Importer les résultats N-1 via `docs/admin-import.html` (page ouverte dans le navigateur, aucun terminal requis).
5. Activer GitHub Pages : Settings > Pages > Source = Deploy from a branch > Branch = main, dossier = /docs.

## Points d'attention
- Poids région → national approximé par la part d'agences (dénominateurs nationaux absents du fichier source) — remplacer par les vrais dénominateurs dès disponibilité.
- CDALb, DPO, DEMAR : objectifs imposés, sans fourchette locale (conforme au cadrage).
- Sécurité : les règles Firestore sont volontairement ouvertes aux utilisateurs authentifiés (y compris anonymes, via `admin-import.html`) ; restreindre l'écriture des cibles au rôle Direction de la Performance (custom claims) et retirer `admin-import.html` avant la mise en production.
