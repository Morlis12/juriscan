/**
 * Chargement de `.env.local` pour les scripts CLI.
 *
 * Next.js charge `.env.local` tout seul au démarrage de l'application, mais pas
 * les scripts `npm run …` : sans cela, le diagnostic dirait « SESSION_SECRET
 * absente » alors qu'elle est définie, et l'export proposerait le mauvais secret.
 * On lit donc le fichier nous-mêmes (sans dépendance).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function chargerEnvLocal(racine = process.cwd(), fichier = ".env.local") {
  const chemin = join(racine, fichier);
  if (!existsSync(chemin)) return 0;
  let charges = 0;
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
    if (!(cle in process.env)) {
      process.env[cle] = valeur;
      charges += 1;
    }
  }
  return charges;
}
