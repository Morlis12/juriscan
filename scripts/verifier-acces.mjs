/**
 * AGL JuriCompliance — Diagnostic de l'accès (à lancer avant et après déploiement).
 *
 * Répond à une seule question : « qui va pouvoir se connecter, et où sont les
 * mots de passe ? ». N'affiche JAMAIS de secret ni de condensat — uniquement
 * des presence/absence et des comptages.
 *
 *   npm run acces:verifier
 */

import { existsSync, readFileSync } from "node:fs";
import { chargerEnvLocal } from "./lib/env-local.mjs";

chargerEnvLocal();
import { join } from "node:path";

const RACINE = process.cwd();
const FICHIER = "acces.local.json";

let ok = 0;
let ko = 0;
const ligne = (intitule, etat, detail) => {
  const marque = etat === "ok" ? "✅" : etat === "ko" ? "❌" : "⚠ ";
  if (etat === "ok") ok += 1;
  if (etat === "ko") ko += 1;
  process.stdout.write(`  ${marque} ${intitule}${detail ? ` — ${detail}` : ""}\n`);
};

process.stdout.write("\nAGL JuriCompliance — diagnostic de l'accès\n\n");

/* 1. Base de données */
const avecBase = Boolean(process.env.DATABASE_URL);
ligne(
  "Base de données",
  avecBase ? "ok" : "info",
  avecBase ? "DATABASE_URL définie (les comptes y seront lus)" : "non définie → mode fichier serveur / variables d'env",
);

if (avecBase) {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const colonnes = await prisma.$queryRawUnsafe(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'User'",
      );
      const noms = new Set(
        colonnes.map((c) => String(c.column_name ?? c.COLUMN_NAME ?? "").toLowerCase()),
      );
      const manquantes = ["motdepassehash", "typecompte", "actif"].filter((c) => !noms.has(c));
      ligne(
        "Colonnes d'accès dans la table User",
        manquantes.length === 0 ? "ok" : "ko",
        manquantes.length === 0
          ? "présentes"
          : `manquantes : ${manquantes.join(", ")} → npm run db:push`,
      );
      const comptes = await prisma.user.count({ where: { motDePasseHash: { not: null } } });
      if (comptes > 0) {
        ligne("Comptes en base", "ok", `${comptes} compte(s)`);
      } else {
        // Base vide : l'application retombe sur le fichier serveur
        // (même règle que chargerComptes) — pas bloquant en local.
        let repli = 0;
        try {
          const brut = JSON.parse(readFileSync(join(RACINE, FICHIER), "utf8"));
          if (Array.isArray(brut.comptes)) repli = brut.comptes.length;
        } catch {
          repli = 0;
        }
        ligne(
          "Comptes en base",
          repli > 0 ? "info" : "ko",
          repli > 0
            ? `aucun — repli fichier serveur (${repli} accès)`
            : "aucun → npm run acces:init puis import",
        );
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch (e) {
    ligne("Connexion à la base", "ko", e instanceof Error ? e.message.slice(0, 90) : "échec");
  }
}

/* 2. Fichier serveur */
const chemin = join(RACINE, FICHIER);
if (existsSync(chemin)) {
  let brut = null;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch {
    ligne("Fichier acces.local.json", "ko", "JSON illisible");
  }
  if (brut) {
    const comptes = Array.isArray(brut.comptes) ? brut.comptes : [];
    const parBU = new Set(comptes.map((c) => c.bu));
    ligne("Fichier acces.local.json", "ok", `${comptes.length} accès · ${parBU.size} direction(s)`);
    const sansHash = comptes.filter((c) => typeof c.motDePasseHash !== "string" || !c.motDePasseHash.startsWith("scrypt$"));
    ligne("Tous les comptes ont un condensat scrypt", sansHash.length === 0 ? "ok" : "ko", sansHash.length === 0 ? "" : `${sansHash.length} sans hash`);
    const provisoires = comptes.filter((c) => c.provisoire === true).length;
    ligne(
      "Mots de passe définitifs",
      provisoires === 0 ? "ok" : "info",
      provisoires === 0 ? "aucun mot de passe provisoire" : `${provisoires} encore provisoire(s) → à changer par leurs titulaires`,
    );
  }
} else {
  ligne("Fichier acces.local.json", "info", "absent (normal sur Vercel : utiliser JURISCAN_COMPTES)");
}

/* 3. Variables d'environnement (chemin Vercel) */
const env = process.env.JURISCAN_COMPTES;
if (env) {
  try {
    const comptes = JSON.parse(env);
    ligne("JURISCAN_COMPTES", Array.isArray(comptes) && comptes.length > 0 ? "ok" : "ko", `${comptes.length} compte(s)`);
  } catch {
    ligne("JURISCAN_COMPTES", "ko", "JSON invalide — la connexion échouera");
  }
} else {
  ligne("JURISCAN_COMPTES", "info", "non définie (obligatoire si le fichier local n'est pas déployé)");
}

const secret = process.env.SESSION_SECRET;
if (secret) {
  ligne(
    "SESSION_SECRET",
    secret.length >= 32 ? "ok" : "ko",
    secret.length >= 32 ? "définie" : `trop court (${secret.length} caractères, 32 minimum)`,
  );
} else {
  ligne("SESSION_SECRET", "ko", "absente → un secret est généré à la volée : les sessions tombent à chaque redémarrage");
}

process.stdout.write(`\n${ko === 0 ? "Diagnostic OK" : `${ko} point(s) bloquant(s)`} — ${ok} contrôle(s) au vert.\n\n`);
process.exit(ko === 0 ? 0 : 1);
