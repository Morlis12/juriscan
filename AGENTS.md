<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# JuriScan AI — Règles de projet

## Contexte
- Projet : JuriScan AI, prototype fonctionnel démarré sur base vierge (Next.js + Tailwind v4).
- Cible : penser chaque ligne pour une migration native vers **Microsoft Power Pages** et **Dataverse**.
- Conséquences : logique métier découplée de Next.js, schéma de données documenté et portable, pas de dépendance bloquante pour Dataverse.

## Règles de build local strict
- Avant toute livraison / commit / push : exécuter obligatoirement `npm run build` en local.
- Le build doit passer sans erreur ni warning bloquant (TypeScript strict, ESLint, Next.js).
- Ne jamais committer si `npm run build` échoue. Corriger d'abord, re-builder, puis committer.
- Commande de référence : `npm run build`.

## Push Git automatique
- Après chaque tâche validée (code + build local OK) : `git add`, `git commit`, `git push` automatiques vers la branche courante.
- Message de commit : concis, en français, préfixé par le périmètre (ex. `fondations: ...`, `db: ...`, `ui: ...`).
- Ne jamais pusher si le build local n'a pas été validé.
- Vérifier `git status` avant chaque commit pour ne pusher que les fichiers voulus (jamais de secrets).

## Conventions Power Pages / Dataverse ready
- Centraliser les types métier dans des modules dédiés (futur `src/lib/dataverse/` ou `src/domain/`).
- Nommer tables/champs en anglais PascalCase/camelCase compatibles Dataverse.
- Documenter chaque entité (rôle, champs, relations) pour faciliter la recréation Dataverse.
- Identité visuelle : Tailwind v4, couleurs AGL `brand-blue` (#1C3359) et `brand-gold` (#B6AD6E) via `@theme` dans `src/app/globals.css`.
