# Revue d'impact — France Travail (Direction de la Performance)

Application web remplaçant le classeur Excel « Revue d'impact DD/Agences ». Trois onglets :
1. **Accueil** — sélection de la structure (agence, DD, région, national).
2. **Résultats et ambitions** — pour chaque indicateur : résultat A-1, taux d'atteinte de l'objectif A-1, évolution vs A-2, écart à la moyenne pondérée des agences les plus proches (maille agence uniquement), cible nationale de la campagne, ambition saisie par la structure.
3. **Revue d'impact** — remontée des réussites, difficultés et ambitions (fourchettes Min/Max), historisée à chaque enregistrement ; et, à partir du niveau Direction Départementale, consolidation pondérée ascendante.

## Traçabilité des remontées
La remontée n'étant pas nominative de bout en bout (mot de passe partagé), **chaque enregistrement d'une remontée est historisé** dans la collection `saisies_historique`, avec horodatage et **email de l'auteur demandé à chaque sauvegarde**. Seul le **compte administrateur** (mot de passe `Admin_ImpactFT`) peut consulter cet historique et restaurer une version antérieure ; les autres utilisateurs ne voient pas ce panneau. Techniquement, cette distinction repose sur l'email associé au compte connecté (`ADMIN_EMAIL` dans `docs/js/config.js`), vérifié aussi bien côté application que côté règles Firestore.

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
   Puis **Add user** une seconde fois pour le compte administrateur :
   - Email : `admin@revue-impact.ft` (doit correspondre à `ADMIN_EMAIL` dans `docs/js/config.js`)
   - Mot de passe : `Admin_ImpactFT`
4. Renseigner `docs/js/config.js` (firebaseConfig) via l'éditeur GitHub (icône crayon). Sans configuration, l'app tourne en **mode démo** avec des données factices (`docs/js/demo-data.js`), sans mot de passe.
5. Copier le contenu de `firestore.rules` dans **Firestore Database > Règles** (console Firebase) → Publier.
6. Importer le référentiel : ouvrir `docs/admin-import-referentiel.html` sur le site publié, saisir le mot de passe, sélectionner le fichier local `data-confidentielle/referentiel.json`, cliquer Importer.
7. Importer les remontées déjà saisies (bilan, ambitions, ressources extraits du classeur Excel) : ouvrir `docs/admin-import-saisies.html`, saisir le mot de passe, sélectionner `data-confidentielle/saisies_2026.json`, cliquer Importer.
8. Importer les résultats N-1 : ouvrir `docs/admin-import.html`, saisir le mot de passe, charger le CSV correspondant.
   Pour afficher le **taux d'atteinte de l'objectif A-1**, ajouter en plus une colonne `<INDICATEUR>_OBJ` par indicateur concerné (ex. `TAE_OBJ`) contenant l'objectif qui avait été fixé pour cette année — colonne optionnelle, sans elle la cellule affiche « — ».
8. Activer GitHub Pages : Settings > Pages > Source = Deploy from a branch > Branch = main, dossier = **/docs**.

## Accès des utilisateurs
Chaque visiteur du site doit saisir le mot de passe `Impact_FT` à l'ouverture. Techniquement, ce mot de passe correspond à un **compte Firebase unique et partagé** (`acces.reseau@revue-impact.ft`) : tout le monde se connecte avec les mêmes identifiants. Le même écran de connexion accepte aussi le mot de passe `Admin_ImpactFT` (compte `admin@revue-impact.ft`), qui donne en plus accès à l'historique des versions et à la restauration. Pour changer un mot de passe : Firebase Console > Authentication > Users > sélectionner le compte concerné > **Reset password**.

## Sécurité — point d'attention important
Le mot de passe protège l'accès de tout visiteur non informé, mais reste un **secret partagé unique** : il ne permet pas de savoir qui a fait quoi, et doit être changé si une personne quitte le périmètre autorisé. Pour une traçabilité individuelle, remplacer ce compte unique par une connexion nominative (ex. Google Sign-In restreint à un domaine, ou un compte par utilisateur) et durcir `firestore.rules` avec des rôles (custom claims).
- Retirer les pages `admin-import*.html` du dossier `docs/` une fois les imports terminés (ou les protéger par un rôle dédié).

## Points d'attention fonctionnels
- Poids région → national approximé par la part d'agences (dénominateurs nationaux absents du fichier source).
- CDALb, DPO, DEMAR : objectifs imposés, sans fourchette locale (conforme au cadrage).
