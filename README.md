# AGL — JuriScan AI

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
  déplié sous la moyenne pour les textes multi-BU).
- **Analyse IA multi-actes** (`/dashboard/nouvelle-alerte`) : dépôt PDF/image →
  extraction (IA, clé requise — pas de mode démo) ou saisie manuelle. « 1 document »
  = « N textes » (un JO = des dizaines d'actes, jamais fusionnés) : navigation
  « Acte X / N », assignation multi-BU **par acte**, enregistrement en N alertes
  (`<racine>-01`, `-02`, … ; actes sans BU ignorés avec motif). PDF longs découpés
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
    api/
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
    ContexteBU.tsx              # BU connectée (localStorage + event même-onglet) + sélecteur
    LogoAGL.tsx                 # logo officiel (next/image)
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
prisma/schema.prisma            # 7 modèles : User, VeilleAlerte, VeilleFiche (+SCD2),
                                # VeilleAction (+SCD2), VeilleFicheVersion,
                                # VeilleActionVersion, VeilleJournal
public/logo-agl.png             # logo officiel AGL (fond #1C3359)
public/exemples/                # fichiers de test d'analyse (53.pdf + image, JO n°53)
scripts/build-info.mjs          # horodate chaque build/dev → src/generated/build-info.ts
                                # (date de l'application, ignoré par Git)
```

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
  **JuriScan BU** (lecture globale, écriture si `departement` == équipe — DJ
  incluse) ; rôle **JuriScan Centrale** (création, assignation, flux,
  réassignation ; écriture bloquée sur la conformité BU).
- Authentification : remplacer le sélecteur prototype par l'utilisateur
  **Entra ID** (Web Roles → BU) ; `src/lib/acces.ts` (`lireAuteur`) est le seul
  point à basculer (en-têtes `x-bu-connectee`/`x-user-email` → JWT).
- Dates : `createdon` (= assignation), `modifiedon` (= dernière modif),
  `VeilleJournal` (validation / renvoi / rejet / approbation) — voir § Jalons.
- Logo : téléverser `public/logo-agl.png` comme « Site Logo » du portail
  (Content Snippet `Site Logo Url`) ; en-têtes portail en `#1C3359` plein pour
  la fusion (voir `src/components/LogoAGL.tsx`).

## Support

`JuriScan-AI-Presentation.pptx` (racine) : présentation du prototype.
