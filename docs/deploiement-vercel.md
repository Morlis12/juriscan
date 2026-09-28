# Déploiement Vercel — accès par direction

⚠️ **Depuis la mise en place de l'authentification, un déploiement sans accès configuré
n'est plus utilisable** : c'est voulu (aucun accès ouvert), mais il faut deux variables
d'environnement. Ce guide prend 10 minutes, une fois.

## 1. Ce qu'il faut définir dans Vercel

*Project Settings → Environment Variables* (pour **Production**, **Preview** et
**Development** si vous voulez tester les aperçus) :

| Variable | Obligatoire | Rôle |
|---|---|---|
| `SESSION_SECRET` | ✅ | Secret de signature des sessions (≥ 32 caractères). **Sans lui, chaque redémarrage invalide toutes les sessions.** |
| `JURISCAN_COMPTES` | ✅ sur Vercel | Les accès, au format JSON (seuls des **condensats scrypt**, jamais de mot de passe en clair). |
| `DATABASE_URL` | si base | Connexion PostgreSQL. Sinon l'application tourne sur les données de démonstration. |
| `OPENROUTER_API_KEY` | si scan | Clé d'analyse IA. Sans elle, `POST /api/analyse` répond 500. |

## 2. Générer les valeurs, en local

```bash
npm run acces:init        # si ce n'est pas déjà fait : crée les accès
npm run acces:verifier    # contrôle la configuration locale
npm run acces:exporter    # affiche le JSON JURISCAN_COMPTES + le secret
```

`acces:exporter` affiche deux choses :

1. le tableau JSON à coller dans `JURISCAN_COMPTES` ;
2. le `secretSession` déjà présent dans `acces.local.json` (reutilisable comme
   `SESSION_SECRET` — ou générez-en un neuf avec
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`).

> Les mots de passe **en clair** ne sont affichés que par `acces:init` et
> `acces:reinitialiser`. Le JSON exporté ne contient que des condensats : il est
> sans danger dans un gestionnaire de secrets, mais reste traité comme une donnée
> sensible.

## 3. Premier test, en ligne de commande

```bash
curl -i https://<votre-domaine>/api/session
# → 200 et {"connecte":false,"nbComptes":17}   les comptes sont bien chargés

curl -i https://<votre-domaine>/api/veille
# → 401                                            session obligatoire, comme prévu

curl -i https://<votre-domaine>/dashboard
# → 307 vers /connexion                            redirection de la garde
```

Puis, dans le navigateur : se connecter avec un accès de direction, vérifier que
les onglets **Assignation** et **Rejet** sont absents, puis se reconnecter avec un
compte de la **Veille Réglementaire Générale** et vérifier qu'ils sont présents.

## 4. Changer un mot de passe

- **Par la personne** : écran `/compte` (bouton « Compte » en haut à droite). L'ancien
  mot de passe est exigé ; le nouveau est réécrit dans `JURISCAN_COMPTES`… ce qui est
  **impossible** : sur Vercel la source est en variable d'environnement, donc
  l'application le refuse explicitement (message 409) et renvoie vers l'administrateur.
  C'est voulu : une variable d'environnement ne se modifie pas depuis l'application.
- **Par l'administrateur IT** :
  ```bash
  npm run acces:reinitialiser -- juridique@agl.ci   # nouveau mot de passe, affiché 1 fois
  ```
  puis coller le nouveau tableau dans `JURISCAN_COMPTES` (Vercel) et redéployer
  (Settings → Redeploy, ou tout push sur la branche). Les mots de passe provisoires
  (issus de `acces:init` / `acces:reinitialiser`) sont marqués comme tels : le
  diagnostic les signale tant qu'ils n'ont pas été changés.

> **Si vous utilisez `DATABASE_URL`**, aucun export n'est nécessaire : les comptes
> vivent dans la table `User` et le changement de mot de passe fonctionne depuis
> l'application. Pensez à `npm run db:push` après le déploiement des nouvelles
> colonnes (`motDePasseHash`, `typeCompte`, `actif`, `motDePasseProvisoire`).

## 5. Révoquer un accès

```bash
npm run acces:desactiver -- <email>   # accès refusé, données et journal conservés
```

Sur Vercel : modifier `JURISCAN_COMPTES` (`"actif": false`) puis redéployer. Avec la
base, `npm run acces:desactiver -- <email>` suffit.

## 6. Récapitulatif des sources d'identifiants

Priorité à la première disponible :

1. **Base** `User` — si `DATABASE_URL` est défini ;
2. **Fichier** `acces.local.json` — développement et réceptions (ignoré par Git) ;
3. **Variable** `JURISCAN_COMPTES` — Vercel et toute plateforme sans fichier persistant.

## 7. Rappel migration Microsoft

Sur Power Pages, les points 1-2 de cette page disparaissent : l'authentification
 devient **Entra ID** (Web Roles → BU). Il n'y a **deux** points à remplacer dans le
code — `lireSession` (serveur) et `<PastilleSession />` (interface) — et rien d'autre :
les droits, les filtres par BU et les contrôles 403 sont déjà dans la forme attendue.
Voir § Accès par direction du `README.md`.
