/**
 * AGL JuriCompliance — Administration des accès ( côté IT ).
 *
 * Opérations de premier niveau, hors application, quand un mot de passe est
 * perdu ou qu'un accès doit être révoqué. Ne modifie jamais le journal SCD2 :
 * l'historique reste rattaché à l'email de la personne.
 *
 *   npm run acces:liste                        → qui a un accès (sans secret)
 *   npm run acces:reinitialiser -- <email>     → nouveau mot de passe (affiché 1 fois)
 *   npm run acces:desactiver -- <email>        → révoquer un accès
 *   npm run acces:activer -- <email>           → le rétablir
 *   npm run acces:exporter                     → JSON prêt pour Vercel (JURISCAN_COMPTES)
 *
 * Les écritures vont dans la source des identifiants active : base si
 * `DATABASE_URL` est défini, sinon `acces.local.json`. La source est annoncée
 * avant toute écriture.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hacherMotDePasse, motDePasseProvisoire } from "../src/lib/mots-de-passe.ts";

const FICHIER = "acces.local.json";
const RACINE = process.cwd();
const avecBase = Boolean(process.env.DATABASE_URL);

const args = process.argv.slice(2);
const commande = args[0] ?? "liste";
const cible = (args[1] ?? "").trim().toLowerCase();

const lire = () => {
  const chemin = join(RACINE, FICHIER);
  if (!existsSync(chemin)) return null;
  return JSON.parse(readFileSync(chemin, "utf8"));
};

const enregistrer = (donnees) => writeFileSync(join(RACINE, FICHIER), `${JSON.stringify(donnees, null, 2)}\n`, "utf8");

/* ---------- Mode base : via le client Prisma ---------- */

async function avecBaseSql(action) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    return await action(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/* ---------- Opérations ---------- */

async function liste() {
  const comptes = avecBase
    ? await avecBaseSql(async (prisma) =>
        prisma.user.findMany({
          where: { motDePasseHash: { not: null } },
          select: { email: true, firstName: true, lastName: true, departement: true, typeCompte: true, actif: true, dernierAcces: true },
          orderBy: { departement: "asc" },
        })
      )
    : (lire()?.comptes ?? []);
  if (!comptes.length) {
    process.stdout.write("\nAucun compte. Lancez « npm run acces:init ».\n\n");
    return 1;
  }
  process.stdout.write(`\nSource : ${avecBase ? "base (User)" : "fichier acces.local.json"}\n`);
  const largeur = Math.max(...comptes.map((c) => (c.email ?? "").length));
  process.stdout.write(`${"IDENTIFIANT".padEnd(largeur + 2)}${"TYPE".padEnd(10)}${"BU".padEnd(16)}${"ÉTAT"}\n`);
  for (const c of comptes) {
    const type = c.typeCompte ?? c.type ?? "PERSONNE";
    const etat = c.actif === false ? "désactivé" : type === "DIRECTION" ? "accès de direction" : "nominatif";
    process.stdout.write(`${String(c.email).padEnd(largeur + 2)}${type.padEnd(10)}${String(c.departement ?? c.bu ?? "").padEnd(16)}${etat}\n`);
  }
  process.stdout.write(`\n${comptes.length} accès.\n\n`);
  return 0;
}

async function reinitialiser() {
  if (!cible) {
    process.stdout.write("\nUsage : npm run acces:reinitialiser -- <email>\n\n");
    return 1;
  }
  const nouveau = motDePasseProvisoire();
  const hash = hacherMotDePasse(nouveau);
  if (avecBase) {
    const resultat = await avecBaseSql(async (prisma) =>
      prisma.user.updateMany({
        where: { email: cible },
        data: { motDePasseHash: hash, motDePasseProvisoire: true, actif: true },
      }),
    );
    if (!resultat.count) {
      process.stdout.write(`\nAucun compte « ${cible} » dans la base.\n\n`);
      return 1;
    }
  } else {
    const donnees = lire();
    if (!donnees) {
      process.stdout.write("\nAucun fichier acces.local.json — lancez « npm run acces:init ».\n\n");
      return 1;
    }
    const compte = (donnees.comptes ?? []).find((c) => String(c.email).toLowerCase() === cible);
    if (!compte) {
      process.stdout.write(`\nAucun compte « ${cible} » dans ${FICHIER}.\n\n`);
      return 1;
    }
    compte.motDePasseHash = hash;
    compte.provisoire = true;
    compte.actif = true;
    enregistrer(donnees);
  }
  process.stdout.write(
    `\nMot de passe réinitialisé pour ${cible} (${avecBase ? "base" : FICHIER}).\n` +
      `Affiché UNE seule fois — communiquez-le à la personne par un canal sûr :\n\n` +
      `    ${nouveau}\n\n` +
      `La personne devra le changer à sa première connexion (écran « Mon compte »).\n\n`,
  );
  return 0;
}

async function definirActif(actif) {
  if (!cible) {
    process.stdout.write(`\nUsage : npm run acces:${actif ? "activer" : "desactiver"} -- <email>\n\n`);
    return 1;
  }
  if (avecBase) {
    const r = await avecBaseSql(async (prisma) =>
      prisma.user.updateMany({ where: { email: cible }, data: { actif } }),
    );
    if (!r.count) {
      process.stdout.write(`\nAucun compte « ${cible} » dans la base.\n\n`);
      return 1;
    }
  } else {
    const donnees = lire();
    const compte = (donnees?.comptes ?? []).find((c) => String(c.email).toLowerCase() === cible);
    if (!compte) {
      process.stdout.write(`\nAucun compte « ${cible} ».\n\n`);
      return 1;
    }
    compte.actif = actif;
    enregistrer(donnees);
  }
  process.stdout.write(
    `\nAccès ${actif ? "rétabli" : "révoqué"} pour ${cible}.` +
      (actif ? "" : " Ses anciennes modifications restent dans le journal (traçabilité).") +
      `\n\n`,
  );
  return 0;
}

function exporter() {
  const donnees = lire();
  if (!donnees) {
    process.stdout.write("\nAucun acces.local.json — lancez « npm run acces:init ».\n\n");
    return 1;
  }
  const comptes = (donnees.comptes ?? []).map((c) => ({
    email: c.email,
    nom: c.nom,
    bu: c.bu,
    type: c.type,
    motDePasseHash: c.motDePasseHash,
    actif: c.actif !== false,
    provisoire: c.provisoire === true,
  }));
  process.stdout.write(
    "\n── COLLEZ CE CONTENU dans la variable d'environnement JURISCAN_COMPTES ──\n" +
      "(Vercel : Project Settings → Environment Variables → JURISCAN_COMPTES)\n" +
      "Les mots de passe ne figurent pas ici : seuls leurs condensats scrypt.\n\n" +
      `${JSON.stringify(comptes)}\n\n`,
  );
  process.stdout.write(
    `── SECRET DE SESSION ──\n` +
      `Générez-en un : node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"\n` +
      `Puis SESSION_SECRET dans les mêmes variables d'environnement.\n` +
      `Celui du fichier local (reproduit ici pour information) :\n  ${donnees.secretSession}\n\n`,
  );
  return 0;
}

const code = {
  liste: liste,
  reinitialiser: reinitialiser,
  desactiver: () => definirActif(false),
  activer: () => definirActif(true),
  exporter: exporter,
}[commande];

if (!code) {
  process.stdout.write(
    "\nCommandes : liste · reinitialiser <email> · desactiver <email> · activer <email> · exporter\n\n",
  );
  process.exit(1);
}
process.exit(await code());
