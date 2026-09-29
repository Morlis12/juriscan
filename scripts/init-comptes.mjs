/**
 * AGL JuriCompliance — Création des accès (`npm run acces:init`).
 *
 * Génère, pour chaque direction :
 * - un accès partagé `DIRECTION` (un mot de passe par direction) ;
 * - un compte nominatif `PERSONNE` (traçabilité individuelle dans le journal) ;
 * plus deux comptes nominatifs pour la centrale (veille réglementaire).
 *
 * Les mots de passe ne sont écrits qu'en clair dans la sortie console, à la
 * création : le fichier ne contient que des condensats scrypt. Le fichier
 * `acces.local.json` est ignoré par Git.
 *
 * Usage :
 *   npm run acces:init            # crée les comptes manquants (sans écraser)
 *   npm run acces:init -- --force # réinitialise tout (nouveaux mots de passe)
 *   npm run acces:init -- --mdp=x # impose le même mot de passe partout (recette)
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargerEnvLocal } from "./lib/env-local.mjs";

chargerEnvLocal();
import { DEPARTEMENTS, DEPARTEMENT_CODES } from "../src/domain/veille.ts";
import { hacherMotDePasse, motDePasseProvisoire } from "../src/lib/mots-de-passe.ts";

const FICHIER = "acces.local.json";
const RACINE = process.cwd();

const args = process.argv.slice(2);
const force = args.includes("--force");
const mdpImpose = (args.find((a) => a.startsWith("--mdp=")) || "").split("=")[1] || null;

/* Noms lisibles par direction (aucune donnée sensible, tout est dans le README). */
const PERSONNES = {
  CENTRAL_VRG: { email: "veille@agl.ci", nom: "Veille réglementaire générale" },
  DJ: { email: "juridique@agl.ci", nom: "Direction Juridique" },
  DAF: { email: "administratif-financier@agl.ci", nom: "Direction Administrative et Financière" },
  DRH: { email: "rh@agl.ci", nom: "Direction des Ressources Humaines" },
  PATR_IMMO: { email: "patrimoine-immobilier@agl.ci", nom: "Patrimoine Immobilier" },
  DQHSE: { email: "qualite-hse@agl.ci", nom: "Direction Qualité, Hygiène, Sécurité, Environnement" },
  DIR_COMM_MARK: { email: "commercial-marketing@agl.ci", nom: "Direction Commerciale & Marketing" },
  DILS: { email: "immobilier-logistique@agl.ci", nom: "Immobilier, Logistique et Services" },
};

const existant = existsSync(join(RACINE, FICHIER))
  ? JSON.parse(readFileSync(join(RACINE, FICHIER), "utf8"))
  : { secretSession: randomBytes(32).toString("base64url"), comptes: [] };

if (force) {
  existant.comptes = [];
  existant.secretSession = randomBytes(32).toString("base64url");
}

const dejaLa = new Set(
  (Array.isArray(existant.comptes) ? existant.comptes : []).map((c) => c.email),
);

const lignes = [];

for (const bu of DEPARTEMENT_CODES) {
  const personne = PERSONNES[bu] ?? {
    email: `${bu.toLowerCase().replace(/_/g, "-")}@agl.ci`,
    nom: DEPARTEMENTS[bu],
  };
  const acces = [
    {
      email: `direction-${bu.toLowerCase().replace(/_/g, "-")}@agl.ci`,
      nom: `${DEPARTEMENTS[bu]} — accès partagé`,
      type: "DIRECTION",
    },
    { ...personne, type: "PERSONNE" },
  ];
  if (bu === "CENTRAL_VRG") {
    acces.push({
      email: "veille-generale@agl.ci",
      nom: "Veille réglementaire — agent de permanence",
      type: "PERSONNE",
    });
  }
  for (const compte of acces) {
    const mdp = mdpImpose ?? motDePasseProvisoire();
    if (dejaLa.has(compte.email)) {
      lignes.push({ ...compte, bu, mdp: "(mot de passe conservé)" });
      continue;
    }
    existant.comptes.push({
      ...compte,
      bu,
      motDePasseHash: hacherMotDePasse(mdp),
      actif: true,
      provisoire: true,
    });
    dejaLa.add(compte.email);
    lignes.push({ ...compte, bu, mdp });
  }
}

writeFileSync(join(RACINE, FICHIER), `${JSON.stringify(existant, null, 2)}\n`, "utf8");

const largeur = Math.max(...lignes.map((l) => l.email.length));
process.stdout.write(
  `\nAGL JuriCompliance — accès par direction\n` +
    `=======================================\n` +
    `Les mots de passe ci-dessous ne sont affichés QU'ICI, une seule fois.\n` +
    `Conservez-les : ils ne sont stockés que sous forme de condensats scrypt.\n\n`,
);
for (const l of lignes) {
  process.stdout.write(
    `${l.email.padEnd(largeur + 2)} ${l.type.padEnd(9)} ${l.bu.padEnd(16)} ${l.mdp}\n`,
  );
}
process.stdout.write(
  `\nFichier écrit : ${FICHIER} (ignoré par Git — ne jamais le committer).\n` +
    `Secret de session : ${existant.secretSession.slice(0, 8)}… (dans le même fichier)\n` +
    `Connexion : http://localhost:3000/connexion\n` +
    `Base de données : ${process.env.DATABASE_URL ? "définie — les comptes y seront prioritairement utilisés" : "non définie — mode fichier serveur"}\n` +
    (force ? "\n⚠ Réinitialisation : tous les anciens mots de passe sont invalides.\n" : "\n"),
);
