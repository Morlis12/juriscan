/**
 * AGL JuriCompliance — Comptes et droits : un accès par direction, un compte
 * par personne.
 *
 * Deux types de comptes, les deux configurations demandées :
 * - `DIRECTION` : un accès partagé par direction (l'agent de permanence se
 *   connecte sans compte nominatif). Une seule adresse par BU.
 * - `PERSONNE`   : un compte nominatif (email + mot de passe) dont les droits
 *   sont ceux de sa BU. Seul type qui permet une traçabilité individuelle dans
 *   le journal SCD2.
 *
 * Origine des identifiants, dans cet ordre (premier disponible) :
 * 1. **Base** `User` (si `DATABASE_URL` est défini) : colonnes `motDePasseHash`,
 *    `typeCompte`, `actif`, `motDePasseProvisoire`. Aucun mot de passe en clair.
 * 2. **Fichier serveur** `acces.local.json` (racine, ignoré par Git) : permet de
 *    faire tourner la démo et les réceptions sans base.
 * 3. **Variable d'environnement** `JURISCAN_COMPTES` (JSON) : chemin des
 *    plateformes sans système de fichiers permanent (Vercel).
 *
 * Le secret de session suit la même logique : `SESSION_SECRET`, sinon un secret
 * généré dans le fichier serveur (donc persistant en local).
 *
 * Si aucun compte n'est configuré, aucune connexion n'est possible : l'écran de
 * connexion l'explique et invite à lancer `npm run acces:init`. Aucun repli
 * silencieux — c'est la garantie qu'il n'existe pas d'accès ouvert.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { DEPARTEMENT_CODES, type DepartementCode } from "@/domain/veille";
import { prisma } from "@/lib/prisma";
import { hacherMotDePasse, verifierMotDePasse } from "@/lib/mots-de-passe";

export type TypeCompte = "PERSONNE" | "DIRECTION";

export interface Compte {
  /** Adresse de connexion : email pour une personne, `direction-<bu>@…` sinon. */
  email: string;
  nom: string;
  bu: DepartementCode;
  type: TypeCompte;
  motDePasseHash: string;
  actif: boolean;
  /** Mot de passe provisionné jamais changé → à changer à la première connexion. */
  provisoire: boolean;
}

export type SourceComptes = "base" | "fichier" | "environnement" | "aucun";

const FICHIER = "acces.local.json";
const RACINE = join(process.cwd());

interface FichierAcces {
  secretSession?: string;
  comptes?: unknown;
}

let cache: { comptes: Compte[]; secret: string | null; source: SourceComptes } | null = null;

function normaliser(brut: unknown): Compte[] {
  if (!Array.isArray(brut)) return [];
  const comptes: Compte[] = [];
  for (const c of brut as Record<string, unknown>[]) {
    const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
    const bu = typeof c.bu === "string" ? (c.bu.trim().toUpperCase() as DepartementCode) : null;
    const hash = typeof c.motDePasseHash === "string" ? c.motDePasseHash : "";
    if (!email || !bu || !(DEPARTEMENT_CODES as string[]).includes(bu) || !hash) continue;
    comptes.push({
      email,
      nom: typeof c.nom === "string" && c.nom ? c.nom : email,
      bu,
      type: c.type === "DIRECTION" ? "DIRECTION" : "PERSONNE",
      motDePasseHash: hash,
      actif: c.actif !== false,
      provisoire: c.provisoire === true,
    });
  }
  return comptes;
}

function depuisFichier(): { comptes: Compte[]; secret: string | null } | null {
  try {
    const chemin = join(RACINE, FICHIER);
    if (!existsSync(chemin)) return null;
    const brut = JSON.parse(readFileSync(chemin, "utf8")) as FichierAcces;
    return {
      comptes: normaliser(brut.comptes),
      secret: typeof brut.secretSession === "string" && brut.secretSession.length >= 32
        ? brut.secretSession
        : null,
    };
  } catch {
    return null;
  }
}

function depuisEnvironnement(): Compte[] {
  const brut = process.env.JURISCAN_COMPTES;
  if (!brut) return [];
  try {
    return normaliser(JSON.parse(brut));
  } catch {
    return [];
  }
}

async function depuisBase(): Promise<Compte[] | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const lignes = await prisma.user.findMany({
      select: {
        email: true,
        firstName: true,
        lastName: true,
        departement: true,
        motDePasseHash: true,
        typeCompte: true,
        actif: true,
        motDePasseProvisoire: true,
      },
      where: { motDePasseHash: { not: null } },
    });
    return normaliser(
      lignes.map((l) => ({
        email: l.email,
        nom: [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || l.email,
        bu: l.departement,
        type: l.typeCompte,
        motDePasseHash: l.motDePasseHash,
        actif: l.actif,
        provisoire: l.motDePasseProvisoire,
      })),
    );
  } catch {
    // Colonne absente (base non migrée) ou base injoignable : on continue sans.
    return null;
  }
}

/** Secrets de session : variable d'environnement d'abord, puis fichier serveur. */
function secretSession(): string {
  const env = process.env.SESSION_SECRET;
  if (typeof env === "string" && env.length >= 32) return env;
  const fichier = depuisFichier();
  if (fichier?.secret) return fichier.secret;
  // Repli sans persistance : les sessions ne survivront pas au redémarrage du
  // serveur (développement uniquement), mais aucune connexion n'est ouverte.
  return randomBytes(32).toString("base64url");
}

export async function chargerComptes(): Promise<{
  comptes: Compte[];
  source: SourceComptes;
  secret: string;
}> {
  if (cache) return { comptes: cache.comptes, source: cache.source, secret: secretSession() };
  const secret = secretSession();
  const base = await depuisBase();
  if (base && base.length > 0) {
    cache = { comptes: base, secret, source: "base" };
    return { comptes: base, source: "base", secret };
  }
  const fichier = depuisFichier();
  if (fichier && fichier.comptes.length > 0) {
    cache = { comptes: fichier.comptes, secret, source: "fichier" };
    return { comptes: fichier.comptes, source: "fichier", secret };
  }
  const env = depuisEnvironnement();
  if (env.length > 0) {
    cache = { comptes: env, secret, source: "environnement" };
    return { comptes: env, source: "environnement", secret };
  }
  cache = { comptes: [], secret, source: "aucun" };
  return { comptes: [], source: "aucun", secret };
}

/** Vide le cache (tests, changement de configuration). */
export function viderCacheComptes(): void {
  cache = null;
}

export interface ResultatEcriture {
  ok: boolean;
  /** Origine qui refuse l'écriture (ex. variable d'environnement). */
  motif?: "ENVIRONNEMENT" | "INTROUVABLE" | "ERREUR";
}

/**
 * Réécrit le condensat d'un mot de passe **dans la source des identifiants**.
 * C'est ce qui permet à un utilisateur de changer son mot de passe lui-même,
 * sans repasser par un administrateur.
 * - base : mise à jour de la ligne `User` ;
 * - fichier : réécriture de `acces.local.json` (mode démo / réceptions) ;
 * - environnement : écriture impossible (Vercel) → l'appelant doit l'expliquer
 *   et renvoyer vers l'administrateur.
 */
export async function mettreAJourMotDePasse(
  email: string,
  motDePasseHash: string,
): Promise<ResultatEcriture> {
  const cible = email.trim().toLowerCase();
  const { comptes, source } = await chargerComptes();
  if (source === "aucun" || !comptes.some((c) => c.email === cible)) {
    return { ok: false, motif: "INTROUVABLE" };
  }
  if (source === "environnement") {
    return { ok: false, motif: "ENVIRONNEMENT" };
  }
  if (source === "base") {
    try {
      await prisma.user.update({
        where: { email: cible },
        data: { motDePasseHash, motDePasseProvisoire: false, dernierAcces: new Date() },
      });
      viderCacheComptes();
      return { ok: true };
    } catch {
      return { ok: false, motif: "ERREUR" };
    }
  }
  try {
    const chemin = join(RACINE, FICHIER);
    const brut = JSON.parse(readFileSync(chemin, "utf8")) as FichierAcces;
    const liste = Array.isArray(brut.comptes) ? brut.comptes : [];
    let trouve = false;
    for (const c of liste as Record<string, unknown>[]) {
      if (typeof c.email === "string" && c.email.toLowerCase() === cible) {
        c.motDePasseHash = motDePasseHash;
        c.provisoire = false;
        trouve = true;
      }
    }
    if (!trouve) return { ok: false, motif: "INTROUVABLE" };
    writeFileSync(chemin, `${JSON.stringify(brut, null, 2)}\n`, "utf8");
    viderCacheComptes();
    return { ok: true };
  } catch {
    return { ok: false, motif: "ERREUR" };
  }
}

/**
 * Active / désactive un compte (retrait d'accès sans suppression de l'historique
 * de ses modifications, qui reste rattaché à son email dans le journal SCD2).
 */
export async function definirActif(
  email: string,
  actif: boolean,
): Promise<ResultatEcriture> {
  const cible = email.trim().toLowerCase();
  const { source } = await chargerComptes();
  if (source === "environnement") return { ok: false, motif: "ENVIRONNEMENT" };
  if (source === "base") {
    try {
      await prisma.user.update({ where: { email: cible }, data: { actif } });
      viderCacheComptes();
      return { ok: true };
    } catch {
      return { ok: false, motif: "ERREUR" };
    }
  }
  try {
    const chemin = join(RACINE, FICHIER);
    const brut = JSON.parse(readFileSync(chemin, "utf8")) as FichierAcces;
    const liste = Array.isArray(brut.comptes) ? brut.comptes : [];
    let trouve = false;
    for (const c of liste as Record<string, unknown>[]) {
      if (typeof c.email === "string" && c.email.toLowerCase() === cible) {
        c.actif = actif;
        trouve = true;
      }
    }
    if (!trouve) return { ok: false, motif: "INTROUVABLE" };
    writeFileSync(chemin, `${JSON.stringify(brut, null, 2)}\n`, "utf8");
    viderCacheComptes();
    return { ok: true };
  } catch {
    return { ok: false, motif: "ERREUR" };
  }
}

export interface ResultatConnexion {
  ok: boolean;
  motif?: "IDENTIFIANTS" | "COMPTE_INACTIF" | "AUCUN_COMPTE";
  compte?: Compte;
}

/**
 * Vérifie un couple identifiant / mot de passe.
 * Message volontairement identique pour « compte inconnu » et « mot de passe
 * faux » : on n'énumère pas les comptes existants.
 */
export async function connecter(email: string, motDePasse: string): Promise<ResultatConnexion> {
  const { comptes, source } = await chargerComptes();
  if (source === "aucun" || comptes.length === 0) return { ok: false, motif: "AUCUN_COMPTE" };
  const cible = email.trim().toLowerCase();
  const compte = comptes.find((c) => c.email === cible);
  // Hachage factice quand le compte est inconnu : la réponse prend le même
  // temps qu'avec un compte valide (pas de fuite par chronométrage).
  const reference = compte?.motDePasseHash ?? condensatFactice();
  const bon = verifierMotDePasse(motDePasse, reference);
  if (!compte || !bon) return { ok: false, motif: "IDENTIFIANTS" };
  if (!compte.actif) return { ok: false, motif: "COMPTE_INACTIF" };
  return { ok: true, compte };
}

let condensatInconnu: string | null = null;
function condensatFactice(): string {
  if (!condensatInconnu) {
    // Construit une fois au démarrage, jamais associé à un compte réel.
    condensatInconnu = hacherMotDePasse("compte-inexistant-agl-juricompliance");
  }
  return condensatInconnu;
}
