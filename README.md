# AGL — AGL JuriCompliance

Veille réglementaire AGL : l'IA extrait les textes (PDF / image), la **centrale**
assigne aux BU, chaque **BU pilote sa conformité** en vase clos, et **chaque
modification est tracée** (SCD type 2, historique consultable).

Prototype fonctionnel **Next.js + Tailwind v4 + Prisma/PostgreSQL**, pensé dès la
première ligne pour une migration native vers **Microsoft Power Pages** et
**Dataverse** (logique métier découplée, schéma portable, mapping documenté —
voir `src/lib/dataverse/tables.ts`).

## Fonctionnalités

- **Pilotage juridique** (`/dashboard`) : filtres BU / date / type / workflow +
  recherche, KPI, texte groupés par `numeroOrdre`, taux moyen et **pourcentage de
  chaque BU** dans le graphique « Niveau de conformité par texte » (détail
  déplié sous la moyenne pour les textes multi-BU). **Clic sur une barre → vue
  immersive du texte juridique** (`src/components/VueTexteImmersive.tsx`) : article,
  libellé applicable, transcription brute (taille réglable, copie), lien officiel,
  résumé IA, métadonnées et conformité par direction. Le texte complet est chargé
  en tâche de fond via `GET /api/veille/[id]` ; navigation ← / → entre les textes,
  Échap referme, focus restitué à la barre d'origine, défilement de page verrouillé.
- **Analyse IA multi-actes** (`/dashboard/nouvelle-alerte`) : dépôt PDF/image →
  extraction (IA, clé requise — pas de mode démo) ou saisie manuelle. « 1 document »
  = « N textes » (un JO = des dizaines d'actes, jamais fusionnés) : navigation
  « Acte X / N », assignation multi-BU **par acte**, enregistrement en N alertes
  (`<racine>-01`, `-02`, … ; actes sans BU ignorés avec motif). **Dépôt multiple** :
  N PDF/images d'un coup, analysés **séquentiellement** (chaque résultat conservé dès
  qu'il arrive, un échec n'annule pas les autres). **Travail jamais perdu** : un
  document scanné reste dans la liste « Documents scannés · conservés » tant qu'il
  n'est pas enregistré — changer d'onglet, quitter la page, revenir le lendemain ou
  déposer un nouveau document ne détruit rien (IndexedDB, repli `localStorage`
  avec version allégée si quota atteint ; voir § Conservation du scan). PDF longs découpés
  en tranches de 5 pages (+1 de chevauchement, fusion/dédoublonnage), sortie JSON
  structurée (schéma zod). Fidélité exigée : articles copiés mot à mot,
  transcription brute complète (`contenu`), références jamais tronquées, rien
  d'inventé ; article, libellé, date d'entrée en vigueur et lien hypertexte
  (URL exacte lue, jamais inventée) valent « N/A » si rien. Robustesse : `response_format: json_object` + consigne JSON strict
  + parseur en 3 temps (direct → réparation antislash/contrôles → sauvetage
  objet par objet) — une tranche en échec n'annule plus le lot (partiel +
  avertissement). Contexte métier AGL CI (transit/logistique) + filtre strict en
  tête du prompt : pages hors sujet ignorées (tableau vide admis), tranches en
  parallèle (×3, 1 retry 429/5xx) pour une analyse rapide et ciblée :
  pertinence `Directe` / `Indirecte` / `Hors périmètre` (jamais de BU suggérée
  hors périmètre ; `applicableAGLCI` décoché par défaut dans ce cas, la centrale
  tranche). Fichiers de test : `public/exemples/` (JO n°53, chargeables depuis
  l'écran). Réponse brute loggée (`GEMINI_RAW_*`, voir logs Vercel).
- **Workflow à double validation** : `ATTENTE_VALIDATION_JURIDIQUE` →
  `ATTENTE_APPROBATION_METIER` → `APPROUVE_METIER` | `REJETE_METIER`
  (approbations BU, rejets à retraiter par la centrale).
- **Cloisonnement strict par BU** : une BU ne modifie que ses assignations
  (DJ incluse, sans exception) ; seule la centrale (`CENTRAL_VRG`) pilote le
  flux. Matrice appliquée côté UI **et** API (401/403). Voir § Accès.
- **Traçabilité SCD type 2** : versions figées (`Veille*Version`) + journal
  lisible (`VeilleJournal`), consultable dans `/dashboard/historique` et sur
  chaque fiche. Voir § Historique.
- **Jalons de dates** : rejets (assignation + rejet), approbations (assignation +
  ancienneté « en attente depuis N jours »), suivi (colonne « Dernière modif » =
  date de l'état affiché). Voir § Jalons.
- **Données démo visibles** : 30 fiches + 5 textes multi-BU (2–3 BU : `AGL-2026-031`
  à `035`) et historique simulé aligné sur le workflow (badges **démo**/**SQL**).
- **Identité AGL** : logo officiel (`public/logo-agl.png`, fond `#1C3359` —
  fusionne avec les en-têtes `bg-brand-blue` pleins), couleurs `brand-blue`
  `#1C3359` / `brand-gold` `#B6AD6E` (`src/app/globals.css`).

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · Prisma 6 + PostgreSQL ·
`ai` · `zod` · `pdf-lib` · appel HTTP OpenRouter (`google/gemini-2.5-flash`) · TypeScript strict · ESLint.

## Démarrage

```bash
npm install
cp .env.example .env   # OBLIGATOIRE : renseigner DATABASE_URL et
                       # OPENROUTER_API_KEY (analyse via OpenRouter,
                       # modèle google/gemini-2.5-flash ; sans clé,
                       # POST /api/analyse répond 500 — aucun mode démo)
npm run db:push        # crée le schéma (7 tables) — ou : npm run db:migrate
npm run dev            # http://localhost:3000 → redirige vers /dashboard
```

| Script | Rôle |
|---|---|
| `npm run dev` | Développement local |
| `npm run build` | `prisma generate && next build` — **obligatoire avant tout commit/push** |
| `npm run start` | Serveur de production |
| `npm run lint` | ESLint |
| `npm run db:generate` / `db:push` / `db:migrate` / `db:studio` | Client Prisma / schéma / migrations / explorateur |
| `npm run pptx` | Régénère `AGL-JuriCompliance-Presentation.pptx` (voir § Support) |
| `npm run acces:init` | Crée les accès par direction + les comptes nominatifs (voir § Accès par direction) |
| `npm run acces:verifier` | Diagnostic de l'accès avant/après déploiement (rien ne sort en clair) |
| `npm run acces:reinitialiser -- <email>` | Réinitialise un mot de passe (affiché une seule fois) |
| `npm run acces:desactiver -- <email>` / `acces:activer` | Révoque / rétablit un accès |
| `npm run acces:exporter` | JSON des accès à coller dans `JURISCAN_COMPTES` (Vercel) |

**Accès obligatoire** : sans session, l'application renvoie vers `/connexion`.
Lancez `npm run acces:init` au premier démarrage (voir § Accès par direction).

Sans `DATABASE_URL` (ou sans clé Gemini), l'appli fonctionne en **mode démo** :
mocks visibles + historique simulé, repli silencieux des appels SQL.

> Règle projet (`AGENTS.md`) : jamais de commit si `npm run build` échoue ;
> commits en français préfixés par périmètre (`bu: …`, `ui: …`, `db: …`) ;
> jamais de secrets versionnés (`.env` ignoré).

## Structure

```
src/
  app/
    page.tsx                    # racine → redirect /dashboard
    layout.tsx                  # layout + métadonnées
    globals.css                 # Tailwind v4, @theme brand-blue/brand-gold
  connexion/page.tsx            # écran de connexion (compte nominatif OU accès de direction)
  compte/page.tsx               # mon compte : identité + changement de mot de passe
  api/
      connexion/route.ts          # POST connexion (cookie signé) · DELETE déconnexion
      session/route.ts            # GET « qui suis-je ? » (déduit du cookie, jamais du client)
      mot-de-passe/route.ts       # changement de mot de passe par l'utilisateur
      analyse/route.ts          # POST extraction IA (Gemini / simulation)
      veille/route.ts           # POST création (centrale) · GET liste
      veille/[id]/route.ts      # GET fiche · PUT édition (groupes) · PATCH workflow/pilotage
      veille/[id]/historique/route.ts  # GET journal + versions d'une fiche
      sauvegarde/route.ts       # POST création (centrale, formulaire nouvelle-alerte)
      historique/route.ts       # GET journal global (?ficheId=&alerteId=&bu=&action=&take=)
    dashboard/
      page.tsx                  # pilotage : filtres, KPI, graphique par BU, tableau groupé
      nouvelle-alerte/page.tsx  # analyse IA + assignation multi-BU (centrale)
      approbations/page.tsx     # file d'approbation BU (cloisonnée)
      rejets/page.tsx           # rejets à retraiter (centrale)
      alertes/[id]/page.tsx     # modification fiche (droits champ par champ + historique)
      historique/page.tsx       # journal consultable (filtres + badges démo/réel)
      memo/page.tsx               # mémo d'utilisation (guide structuré des indicateurs et règles)
  components/
    SessionBU.tsx               # session serveur (qui est-je ?) + pastille d'identité/déconnexion
    LogoAGL.tsx                 # logo officiel (next/image)
    NavOnglets.tsx              # barre de boutons partagée (Tableau de bord · Assignation ·
                                # Approbation · Rejet · Historique · Mémo ; Assignation = CTA or)
    VueTexteImmersive.tsx       # VUE IMMERSIVE DU TEXTE JURIDIQUE (clic sur une barre du
                                # graphique « Niveau de conformité par texte »)
    PreuveFichierInput.tsx      # pièce jointe preuve (PDF/image ≤ 8 Mo, base64)
  data/
    veille-mock.ts              # 30 fiches + 5 textes multi-BU (AGL-2026-031 à 035)
    historique-demo.ts          # journal simulé ancré à aujourd'hui + jalonsDemoPourFiche
  domain/                       # pur, sans Next.js/Prisma — référence portable Dataverse
    veille.ts                   # types, statuts (natures étendues actes JO), workflow, BU
    acces.ts                    # MATRICE D'ACCÈS (centrale vs BU — DJ cloisonnée)
    historique.ts               # entités/actions tracées SCD2, type JournalEntree
    jalons.ts                   # JALONS DE DATES (formatage, ancienneté, début d'attente)
    nouvelle-alerte.ts          # 21 colonnes, formulaire vierge
  lib/                          # serveur (Prisma)
    prisma.ts                   # singleton Prisma
    acces.ts                    # auteur requête (en-têtes x-bu-connectee → futur JWT Entra ID)
    historique.ts               # versionnerFiche/Action + journaliser (transactions SCD2)
    veille-save.ts              # création Alerte + N fiches + journal CREATION
    dataverse/tables.ts         # MAPPING DATAVERSE (7 tables, OptionSets, relations, rôles)
    mots-de-passe.ts           # scrypt : hachage selé, comparaison à temps constant
    comptes.ts                  # comptes (base / fichier / env) + connexion
    session.ts                  # cookie de session signé HMAC (httpOnly)
    acces.ts                    # LECTURE DE L'AUTEUR — session signée uniquement
                                # (plus aucun en-tête x-bu-connectee)
    brouillon-scan.ts           # CONSERVATION DU SCAN (IndexedDB + repli localStorage,
                                # version allégée si quota, migration) — pur navigateur
prisma/schema.prisma            # 7 modèles : User, VeilleAlerte, VeilleFiche (+SCD2),
                                # VeilleAction (+SCD2), VeilleFicheVersion,
                                # VeilleActionVersion, VeilleJournal
public/logo-agl.png             # logo officiel AGL (fond #1C3359)
public/exemples/                # fichiers de test d'analyse (53.pdf + image, JO n°53)
scripts/build-info.mjs          # horodate chaque build/dev → src/generated/build-info.ts
                                # (date de l'application, ignoré par Git)
scripts/build-presentation.mjs  # génère la présentation (6 slides, icônes, transitions,
                                # notes de l'orateur) → AGL-JuriCompliance-Presentation.pptx
scripts/init-comptes.mjs        # npm run acces:init : accès par direction + comptes
scripts/acces-admin.mjs         # administration IT : liste, réinit., activation, export
scripts/verifier-acces.mjs      # npm run acces:verifier : diagnostic d'accès
docs/deploiement-vercel.md      # déploiement Vercel : SESSION_SECRET + JURISCAN_COMPTES
scripts/lib/                     # modules de génération OOXML (zip, formes/icônes, paquet)
```

## Conservation du scan — rien ne se paie deux fois

Un scan IA consomme des tokens : l'écran **Assignation** (`/dashboard/nouvelle-alerte`)
ne perd donc jamais un document scanné. Module `src/lib/brouillon-scan.ts` (pur
navigateur, même code transposable côté portail) :

- **Un lot par document.** `lots[]` (onglet Auto) + saisie clavier (onglet Manuel) ;
  chaque lot porte son nom de fichier, son horodatage, ses actes, sa position et son
  état (`X à assigner` / `prêt`). Un lot ne disparaît **qu'après un enregistrement
  réussi** ou une suppression explicite (confirmation) — jamais automatiquement.
- **Écriture à chaque modification**, en IndexedDB (base `juriscan-juricompliance`,
  magasin `brouillons`, clé `assignation`) : le quota de `localStorage` (~5 Mo) est
  insuffisant pour un JO réel (des dizaines d'actes × transcription brute) et
  l'échec y était **silencieux** — c'est ce qui faisait disparaître les scans.
- **Trois degrades, jamais un silence** : IndexedDB → `localStorage` complet →
  `localStorage` allégé (transcriptions tronquées) → échec explicite affiché en
  bandeau orange. Le mirror `localStorage` sert aussi de filet si la base est vidée.
- **Reprise visible** : bandeau « Reprise : N document(s) vous attendent » au retour,
  avec le nombre d'actes encore sans direction.
- **Enregistrement partiel** : seul le lot enregistré est retiré ; s'il en reste
  d'autres, l'écran ne redirige pas et l'utilisateur enchaîne.
- `beforeunload` : un avertissement de fermeture apparaît tant qu'un acte reste sans
  direction (garde-fou, la conservation est déjà assurée).
- **Migration** : l'ancien brouillon mono-document (`juriscan-nouvelle-alerte-brouillon`)
  est converti en lot au premier chargement — le travail en cours n'est pas perdu.
- Seul le **fichier binaire** n'est pas conservé (trop lourd) : relancer une analyse
  sur le même document suppose de le re-déposer, actes et assignations restent intacts.

## Accès par direction — une vue et un mot de passe par BU

Chaque direction a **sa vue** de l'application et **son propre mot de passe**.
Remplace le sélecteur de BU qui laissait choisir n'importe quelle direction.

### Mise en route (obligatoire avant d'ouvrir l'application)

```bash
npm run acces:init     # crée 8 accès de direction + 9 comptes nominatifs
```

Les mots de passe s'affichent **une seule fois**, dans le terminal. Le fichier
`acces.local.json` (racine, **ignoré par Git**) ne contient que des condensats
scrypt et le secret de session. `-- --force` réinitialise tout, `-- --mdp=…`
impose le même mot de passe (recette uniquement).

### Deux types de comptes, deux types de vue

| Type | Identifiant | Pour qui | Trace dans le journal |
|---|---|---|---|
| `DIRECTION` | `direction-<bu>@agl.ci` | Accès partagé de la direction (agent de permanence) | « la direction » |
| `PERSONNE` | email AGL (`veille@agl.ci`, `juridique@agl.ci`…) | Unagent, les droits suivent sa BU | Son nom et son email |

- **Vue d'une direction** : tableau de bord restreint à ses fiches (le filtre BU
  est calé sur la session, pas de « Toutes les BU »), sa file d'approbation,
  ses KPI. Les onglets **Assignation** et **Rejet**, réservés à la centrale,
  ne lui sont pas proposés.
- **Vue de la centrale** (`CENTRAL_VRG`) : vue générale, assignation, rejets.
- L'API applique exactement la même règle : une session `DJ` reçoit **403** sur
  `POST /api/sauvegarde` (réservé à la centrale) et **401** sans session.

### Comment c'est protégé (et ce qui a changé)

- 🔴 **Avant**, la BU venait de l'en-tête `x-bu-connectee` : `curl -H
  "x-bu-connectee: DJ"` bypassait **tous** les contrôles 401/403. Les accès
  n'étaient réels que dans l'interface.
- 🟢 **Maintenant**, la BU et l'identité sont déduites **exclusivement du cookie
  de session signé par le serveur** (HMAC-SHA256). L'en-tête et le corps JSON ne
  sont plus lus : un cookie forgé est rejeté, un cookie expiré aussi.
- Mots de passe **scrypt** (sel 16 octets aléatoire par compte, comparaison à
  temps constant), jamais en clair, jamais dans Git. Limitation de débit :
  10 tentatives par identifiant par quart d'heure.
- `/dashboard/**` est protégé par `src/app/dashboard/layout.tsx` (redirection
  `/connexion`), chaque route métier par `sessionOuverte(req)` (401).
- Réponse de connexion volontairement neutre (« identifiants invalides ») et
  hachage factice quand le compte est inconnu : impossible d'énumérer les comptes.

### Changer / révoquer un accès

- **Par la personne** : écran `/compte` (bouton « Compte » en haut de l'en-tête). Le
  mot de passe **actuel** est exigé, le nouveau est réécrit dans la source des
  identifiants (base ou `acces.local.json`) et la session cesse d'être « provisoire ».
  12 caractères minimum, 3 types différents, différent de l'ancien.
- **Par l'administrateur IT** (mot de passe perdu, accès à révoquer) :
  `npm run acces:reinitialiser -- <email>` · `npm run acces:desactiver -- <email>` ·
  `npm run acces:activer -- <email>` · `npm run acces:liste`.
  Un accès révoqué ne supprime rien : ses modifications restent dans le journal SCD2,
  rattachées à son email.
- **Sur Vercel**, la source est la variable `JURISCAN_COMPTES` (non modifiable depuis
  l'application : le changement est refusé avec un message explicite) → l'IT régénère
  l'export et redéploie. Voir `docs/deploiement-vercel.md`.
- **Avant / après déploiement** : `npm run acces:verifier` (contrôle la configuration
  d'accès et signale les mots de passe encore provisoires, sans jamais afficher de
  secret).

### Où vivent les identifiants

1. **Base** `User` (si `DATABASE_URL` est défini) : `motDePasseHash`,
   `typeCompte`, `actif`, `motDePasseProvisoire` — après `npm run db:push`.
2. **Fichier serveur** `acces.local.json` (ignoré par Git) : réceptions et démo
   sans base.
3. **Variable d'environnement** `JURISCAN_COMPTES` (JSON) : plateformes sans
   système de fichiers permanent (Vercel). Secret : `SESSION_SECRET`.

Si aucun compte n'est configuré, **aucune connexion n'est possible** et l'écran
de connexion l'explique : pas de repli ouvert.

### Migration Microsoft

`lireSession` (serveur) et `<PastilleSession />` (interface) sont les **deux
seuls points** à remplacer par l'Entra ID / Web Roles de Power Pages. Tout le
reste (droits, filtres par BU, routes) est déjà dans la forme attendue : la BU
arrive du jeton, plus du navigateur.

## Accès — cloisonnement strict par BU

Sélecteur « Connecté : » dans chaque en-tête (prototype `localStorage`, propagé
dans le même onglet ; remplacé par **Entra ID / Web Roles** côté Microsoft —
l'API lira alors le JWT via `src/lib/acces.ts`).

| Action | Centrale (`CENTRAL_VRG`) | BU propriétaire | Autre BU |
|---|---|---|---|
| Créer / assigner des BU | ✅ | ❌ | ❌ |
| Modifier le texte source (12 champs) | ✅ | ❌ (figé) | ❌ |
| Réassigner vers une autre BU | ✅ | ❌ | ❌ |
| Valider vers métier / renvoyer un rejet | ✅ | ❌ | ❌ |
| Ouvrir la fiche en modification | ✅ (texte + réassignation) | ✅ (conformité) | 🔒 lecture seule |
| Approuver / rejeter son assignation | ❌ (aucune fiche) | ✅ | ❌ |
| Conformité : statut, preuves, document, action, responsable, délai, taux | ❌ | ✅ | ❌ |
| Lecture + historique | ✅ | ✅ | ✅ |

Référence : `src/domain/acces.ts` (`peutOuvrirFiche`, `peutPiloterConformite`,
`peutCreerAlerte`, `peutValiderVersMetier`, `peutGererRejet`,
`peutStatuerAssignation`). L'API renvoie `401` (BU manquante) / `403` (interdit,
ex. *« Réservé aux membres DRH (vous êtes DJ) »*) ; le PUT compare les groupes
avant/après et ne versionne que les groupes autorisés et réellement touchés.

## Historique — SCD type 2

- Tables courantes : `version`, `validFrom`, `validTo`, `isCurrent`,
  `modifiedByBU`, `modifiedByEmail` (seule la ligne `isCurrent` s'affiche).
- Chaque PUT/PATCH fige l'ancienne image dans `VeilleFicheVersion` /
  `VeilleActionVersion` (`validTo = now`, `version` incrémentée), en transaction.
- Chaque modification écrit `VeilleJournal` : `entite` (ALERTE/FICHE/ACTION),
  `action` (`CREATION`, `VALIDATION_JURIDIQUE`, `APPROBATION_BU`, `REJET_BU`,
  `RENVOI_BU`, `MODIFICATION_*`, `REASSIGNATION`), `buAuteur`, `emailAuteur`,
  `details`, `champsModifies` (JSON).
- Consultation : `/dashboard/historique` (filtres BU/action/recherche,
  `?fiche=` pour une fiche), section « Historique » de chaque fiche,
  `GET /api/historique` et `GET /api/veille/[id]/historique`.

## Jalons de dates

Aucune colonne ajoutée — réutilisation du modèle SCD2 (tables concernées :
`VeilleFiche`, `VeilleJournal`) :

| Jalon affiché | Source SQL | Source démo |
|---|---|---|
| Assignation à la BU | `VeilleFiche.createdAt` | journal `CREATION` |
| Validation vers métier / renvoi (= début d'attente) | journal `VALIDATION_JURIDIQUE` / `RENVOI_BU` (le plus récent) | simulé |
| Rejet | journal `REJET_BU` (dernier) | simulé |
| Approbation | journal `APPROBATION_BU` (dernier) | simulé |
| Dernière modif (= état affiché) | `VeilleFiche.updatedAt` | dernière entrée du journal de la fiche |
| Application (version affichée) | `BUILD_DATE_ISO` (généré à chaque build/dev, `src/generated/`) | idem |

- `GET /api/veille` joint ces jalons à chaque fiche (`jalons : { valideeLe,
  renvoyeeLe, rejeteeLe, approuveeLe }`, une seule requête journal).
- La pastille « Dernière mise à jour » (barre du haut, extrême droite) affiche
  la plus récente des fiches affichées (date + heure) ; son survol rappelle la
  fraîcheur : ancienneté des données + date de l'application (`BUILD_DATE_ISO`).
- Rejets : « Assignée le … · Rejetée le … (il y a N jours) ».
- Approbations : « Assignée le … · ⏳ En attente depuis N jours (depuis le …) ».
- Suivi des textes : colonne « Dernière modif » par texte (plus récente des
  fiches) + date par BU dans le détail déplié.
- Référence : `src/domain/jalons.ts` (`JalonsFiche`, `formaterDateFR`,
  `dureeDepuis`, `debutAttente`), `jalonsDemoPourFiche` côté démo.

## Migration Microsoft (Power Pages / Dataverse)

- Recréer les **7 tables** + 4 OptionSets (`DepartementCode`,
  `ConformiteStatut`, `FluxStatut`, `PertinenceTransit`) d'après
  `src/lib/dataverse/tables.ts` (`DATAVERSE_TABLES`, `DATAVERSE_OPTION_SETS`,
  `DATAVERSE_RELATIONS`).
- Activer l'**Auditing natif** + recréer `VeilleJournal` (lecture Power Pages) et
  les tables `*Version` (colonnes `validFrom`/`validTo`/`isCurrent`/`version`).
- Sécurité : 1 Business Unit + 1 Team par BU (+ BU « Centrale ») ; rôle
  **AGL JuriCompliance BU** (lecture globale, écriture si `departement` == équipe — DJ
  incluse) ; rôle **AGL JuriCompliance Centrale** (création, assignation, flux,
  réassignation ; écriture bloquée sur la conformité BU).
- Authentification : **Entra ID** (Web Roles → BU). Deux points à basculer —
  `lireSession` (serveur, lecture du JWT) et `<PastilleSession />` (interface).
  Les colonnes `typeCompte`/`actif`/`motDePasseHash` de la table `User` ne sont
  alors plus alimentées : Power Pages assure l'authentification.
- Dates : `createdon` (= assignation), `modifiedon` (= dernière modif),
  `VeilleJournal` (validation / renvoi / rejet / approbation) — voir § Jalons.
- Logo : téléverser `public/logo-agl.png` comme « Site Logo » du portail
  (Content Snippet `Site Logo Url`) ; en-têtes portail en `#1C3359` plein pour
  la fusion (voir `src/components/LogoAGL.tsx`).

## Support

`AGL-JuriCompliance-Presentation.pptx` (racine) : présentation du prototype en
6 slides — couverture, constat, architecture, fonctionnement (double validation
+ cloisonnement BU), garanties (SCD2, fidélité, fraîcheur), perspectives
Power Pages / Dataverse. Icônes vectorielles et transitions (fondu, poussée,
morph) sur chaque slide, notes de l'orateur incluses, identité AGL
(`#1C3359` / `#B6AD6E`, logo officiel).

Régénération après toute évolution du projet : `npm run pptx`
(le `.pptx` est construit par `scripts/build-presentation.mjs`, sans dépendance
externe : OOXML écrit à la main et empaqueté par `scripts/lib/`).
