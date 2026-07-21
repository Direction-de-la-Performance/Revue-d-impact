# Revue d'impact — France Travail (Direction de la Performance)

Application web remplaçant le classeur Excel « Revue d'impact DD/Agences ». Trois étapes :
1. **Diagnostic** — repères de résultats N-1 à chaque maille (DG, DR, DD, Agence).
2. **Remontée** — saisie des réussites, difficultés, stratégies et ambitions Min/Max par domaine.
3. **Consolidation** — agrégation pondérée Agences → DD → Région → National, compilation des réussites/difficultés, comparaison aux cibles financeurs.

## Architecture
- **Front** (`docs/`) : site statique (HTML/CSS/JS), design system France Travail, publié via **GitHub Pages**. Ne contient **aucune donnée** — uniquement le code de l'application.
- **Données** : entièrement dans **Firebase Firestore** (auth anonyme). Collections :
  - `ref_agences`, `ref_dds` — référentiel (agences, DD, pondérations) ;
  - `saisies/{campagne}_{code}` — remontées par structure ;
  - `resultats/{annee}_{code}` — résultats N-1 ;
  - `cibles_financeurs/{campagne}` — cibles nationales.

**Aucune donnée confidentielle n'est commitée sur GitHub.** Le fichier `data-confidentielle/referentiel.json` reste local (voir `.gitignore`) et sert uniquement à l'import ponctuel dans Firestore.

## Mise en route (sans terminal)
1. Créer un projet Firebase (console web) : activer **Firestore**.
2. **Authentication > Sign-in method** → activer le fournisseur **Adresse e-mail/Mot de passe**.
3. **Authentication > Users** → **Add user** → renseigner exactement :
   - Email : `acces.reseau@revue-impact.ft` (doit correspondre à `ACCES_EMAIL` dans `docs/js/config.js`)
   - Mot de passe : `Impact_FT`
4. Renseigner `docs/js/config.js` (firebaseConfig) via l'éditeur GitHub (icône crayon). Sans configuration, l'app tourne en **mode démo** avec des données factices (`docs/js/demo-data.js`), sans mot de passe.
5. Copier le contenu de `firestore.rules` dans **Firestore Database > Règles** (console Firebase) → Publier.
6. Importer le référentiel : ouvrir `docs/admin-import-referentiel.html` sur le site publié, saisir le mot de passe, sélectionner le fichier local `data-confidentielle/referentiel.json`, cliquer Importer.
7. Importer les résultats N-1 : ouvrir `docs/admin-import.html`, saisir le mot de passe, charger le CSV correspondant.
8. Activer GitHub Pages : Settings > Pages > Source = Deploy from a branch > Branch = main, dossier = **/docs**.

## Accès des utilisateurs
Chaque visiteur du site doit saisir le mot de passe `Impact_FT` à l'ouverture. Techniquement, ce mot de passe correspond à un **compte Firebase unique et partagé** (`acces.reseau@revue-impact.ft`) : tout le monde se connecte avec les mêmes identifiants. Pour changer le mot de passe : Firebase Console > Authentication > Users > sélectionner le compte > **Reset password**.

## Sécurité — point d'attention important
Le mot de passe protège l'accès de tout visiteur non informé, mais reste un **secret partagé unique** : il ne permet pas de savoir qui a fait quoi, et doit être changé si une personne quitte le périmètre autorisé. Pour une traçabilité individuelle, remplacer ce compte unique par une connexion nominative (ex. Google Sign-In restreint à un domaine, ou un compte par utilisateur) et durcir `firestore.rules` avec des rôles (custom claims).
- Retirer les pages `admin-import.html` et `admin-import-referentiel.html` du dossier `docs/` une fois les imports terminés (ou les protéger par un rôle dédié).

## Points d'attention fonctionnels
- Poids région → national approximé par la part d'agences (dénominateurs nationaux absents du fichier source).
- CDALb, DPO, DEMAR : objectifs imposés, sans fourchette locale (conforme au cadrage).
