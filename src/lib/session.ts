/**
 * AGL JuriCompliance — Session signée.
 *
 * La BU et l'identité ne sont plus jamais déduites d'un en-tête HTTP (que
 * n'importe quel client peut forger) : elles voyagent dans un **cookie de
 * session signé par le serveur**.
 *
 * - Cookie `httpOnly` : inaccessible au JavaScript de la page, donc invulnérable
 *   au vol de session par XSS côté navigateur.
 * - `sameSite=lax` + `secure` en production : pas de rejeu depuis un tiers.
 * - Signature HMAC-SHA256 sur la charge utile (base64url) : sans le secret
 *   serveur, un cookie forgé est rejeté.
 * - Expiration fixe (8 h) portée DANS la charge utile : un cookie rejoué après
 *   expiration est refusé même si la signature est valide.
 * - Le secret vient de `SESSION_SECRET`, sinon du fichier serveur (voir
 *   `src/lib/comptes.ts`).
 *
 * Portabilité Power Pages : ce mécanisme remplace l'identité Entra ID / Web
 * Roles. Les deux points de bascule sont documentés dans le README (§ Accès) :
 * `lireSession` côté serveur et `<SessionBU />` côté interface.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { DepartementCode } from "@/domain/veille";
import { chargerComptes, type Compte, type TypeCompte } from "@/lib/comptes";

export const COOKIE_SESSION = "jc_session";
const DUREE_MS = 8 * 60 * 60 * 1000;

export interface Session {
  /** Adresse du compte connecté (personne ou accès de direction). */
  email: string;
  nom: string;
  bu: DepartementCode;
  type: TypeCompte;
  /** Expiration (ms epoch) — portée dans la charge utile signée. */
  exp: number;
  /** Vrai tant que le mot de passe est celui de la création du compte. */
  provisoire: boolean;
}

function signer(valeur: string, secret: string): string {
  return createHmac("sha256", secret).update(valeur).digest("base64url");
}

function secretActif(): Promise<string> {
  return chargerComptes().then((c) => c.secret);
}

/** Sérialise et signe une session. */
export async function creerCookieSession(compte: Compte): Promise<string> {
  const secret = await secretActif();
  const charge: Session = {
    email: compte.email,
    nom: compte.nom,
    bu: compte.bu,
    type: compte.type,
    exp: Date.now() + DUREE_MS,
    provisoire: compte.provisoire,
  };
  const corps = Buffer.from(JSON.stringify(charge), "utf8").toString("base64url");
  return `${corps}.${signer(corps, secret)}`;
}

/** Relit et vérifie le cookie ; `null` si absent, altéré ou expiré. */
export async function lireSession(req: Request): Promise<Session | null> {
  const brut = lireCookie(req, COOKIE_SESSION);
  if (!brut) return null;
  const point = brut.lastIndexOf(".");
  if (point <= 0) return null;
  const corps = brut.slice(0, point);
  const signature = brut.slice(point + 1);
  const secret = await secretActif();
  const attendue = signer(corps, secret);
  const a = Buffer.from(signature, "base64url");
  const b = Buffer.from(attendue, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const charge = JSON.parse(Buffer.from(corps, "base64url").toString("utf8")) as Session;
    if (typeof charge?.exp !== "number" || charge.exp < Date.now()) return null;
    if (typeof charge.email !== "string" || typeof charge.bu !== "string") return null;
    return charge;
  } catch {
    return null;
  }
}

function lireCookie(req: Request, nom: string): string | null {
  const entete = req.headers.get("cookie") ?? "";
  for (const morceau of entete.split(";")) {
    const i = morceau.indexOf("=");
    if (i < 0) continue;
    if (morceau.slice(0, i).trim() === nom) {
      return decodeURIComponent(morceau.slice(i + 1).trim());
    }
  }
  return null;
}

/** Options d'attache du cookie (httpOnly : non lisible par le JS de la page). */
export function optionsCookie(maxAgeS = DUREE_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeS,
  };
}

/** Cookie d'effacement (connexion échouée, déconnexion). */
export function cookieVide() {
  return optionsCookie(0);
}
