/**
 * AGL JuriCompliance — Mots de passe (hachage et vérification).
 *
 * Principes :
 * - On ne stocke JAMAIS un mot de passe en clair : seul son condensat scrypt
 *   (résistant à la force brute, mémoire dure) est conservé.
 * - Sel aléatoire par compte (16 octets) : deux directions ayant le même mot de
 *   passe n'ont pas le même condensat.
 * - Comparaison à temps constant (`timingSafeEqual`) : impossible de déduire le
 *   mot de passe correct en chronométrant la réponse.
 * - Format auto-descriptif : `scrypt$N$r$p$salt$condensat` (base64url), ce qui
 *   permet de renforcer les paramètres plus tard sans migration.
 * - Limitation de débit gérée par l'appelant (`src/app/api/connexion`).
 *
 * Portabilité Dataverse : aucun équivalent natif du hachage côté Power Pages —
 * à terme l'authentification bascule sur Entra ID (voir § Accès du README) et ce
 * module n'est plus appelé que pour la transition. Les colonnes produites sont
 * documentées dans `src/lib/dataverse/tables.ts`.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const LONGUEUR = 64;
const SALT = 16;

const b64 = (buf: Buffer) => buf.toString("base64url");
const unb64 = (texte: string) => Buffer.from(texte, "base64url");

/** Condensat d'un mot de passe : `scrypt$16384$8$1$<sel>$<condensat>`. */
export function hacherMotDePasse(motDePasse: string): string {
  const sel = randomBytes(SALT);
  const condensat = scryptSync(motDePasse, sel, LONGUEUR, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${b64(sel)}$${b64(condensat)}`;
}

/**
 * Vérifie un mot de passe face à un condensat stocké.
 * Renvoie `false` (sans lever) si le format est illisible : un condensat
 * corrompu ne doit jamais ouvrir un accès.
 */
export function verifierMotDePasse(motDePasse: string, encode: string | null | undefined): boolean {
  if (!encode) return false;
  const parts = encode.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let sel: Buffer;
  let attendu: Buffer;
  try {
    sel = unb64(parts[4]);
    attendu = unb64(parts[5]);
  } catch {
    return false;
  }
  if (sel.length === 0 || attendu.length === 0) return false;
  const calcul = scryptSync(motDePasse, sel, attendu.length, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return calcul.length === attendu.length && timingSafeEqual(calcul, attendu);
}

/**
 * Mot de passe provisoire lisible (usage unique : création de comptes).
 * Sans `1lO0` ni caractères ambigus — il sera recopié au téléphone.
 */
export function motDePasseProvisoire(longueur = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const octets = randomBytes(longueur);
  let mot = "";
  for (const o of octets) mot += alphabet[o % alphabet.length];
  return `AgL-${mot}`;
}

/** Un mot de passe doit-il être changé (provisionné, jamais modifié) ? */
export function motDePasseTropSimple(motDePasse: string): boolean {
  return motDePasse.length < 10;
}
