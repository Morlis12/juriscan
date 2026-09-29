/**
 * Chargement de `.env` puis `.env.local` pour les scripts CLI.
 *
 * Next.js charge ces fichiers tout seul au démarrage de l'application, mais pas
 * les scripts `npm run …` : sans cela, le diagnostic dirait « SESSION_SECRET
 * absente » alors qu'elle est définie, et l'export proposerait le mauvais secret.
 * On lit donc les fichiers nous-mêmes (sans dépendance).
 *
 * Précédence (comme Next.js) : variables d'environnement réelles >
 * `.env.local` > `.env`. Les variables déjà présentes dans `process.env`
 * ne sont jamais écrasées.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function lireFichierEnv(chemin) {
  const valeurs = new Map();
  if (!existsSync(chemin)) return valeurs;
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const texte = ligne.trim();
    if (!texte || texte.startsWith("#")) continue;
    const i = texte.indexOf("=");
    if (i < 1) continue;
    const cle = texte.slice(0, i).trim();
    let valeur = texte.slice(i + 1).trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"')) ||
      (valeur.startsWith("'") && valeur.endsWith("'"))
    ) {
      valeur = valeur.slice(1, -1);
    }
    if (cle) valeurs.set(cle, valeur);
  }
  return valeurs;
}

export function chargerEnvLocal(racine = process.cwd(), fichier = ".env.local") {
  // `.env` d'abord, `.env.local` ensuite (il surcharge `.env`), puis
  // application dans `process.env` sans écraser l'environnement réel.
  const fichiers = [".env", fichier].filter((f, i, arr) => arr.indexOf(f) === i);
  const fusion = new Map();
  for (const nom of fichiers) {
    for (const [cle, valeur] of lireFichierEnv(join(racine, nom))) {
      fusion.set(cle, valeur);
    }
  }
  let charges = 0;
  for (const [cle, valeur] of fusion) {
    if (!(cle in process.env)) {
      process.env[cle] = valeur;
      charges += 1;
    }
  }
  return charges;
}
