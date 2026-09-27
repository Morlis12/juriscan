/**
 * JuriScan AI — Horodatage du build (fraîcheur de l'application).
 *
 * Exécuté via `npm run prebuild` (avant `dev` et `build`, y compris sur
 * Vercel) : écrit `src/generated/build-info.ts` avec la date-heure locale
 * du build. Le pilotage l'affiche en infobulle de « Dernière mise à jour »
 * pour que l'utilisateur connaisse la fraîcheur de ce qu'il regarde
 * (données affichées + version de l'application).
 * Dossier `src/generated/` ignoré par Git (régénéré à chaque build/dev).
 */
import { mkdirSync, writeFileSync } from "node:fs";

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

const dir = new URL("../src/generated", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("../src/generated/build-info.ts", import.meta.url),
  `/** Fichier généré par \`npm run prebuild\` — ne pas modifier (voir scripts/build-info.mjs). */\nexport const BUILD_DATE_ISO = "${iso}";\n`,
);
console.log(`build-info: ${iso}`);
