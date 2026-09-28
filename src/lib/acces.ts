/**
 * AGL JuriCompliance — Lecture de l'auteur côté serveur.
 *
 * ⚠️ Changement de sécurité majeur : la BU et l'identité viennent désormais
 * **exclusivement du cookie de session signé** (voir `src/lib/session.ts`).
 * Avant, elles étaient lues dans l'en-tête `x-bu-connectee` et dans le corps
 * JSON : n'importe quel client pouvait forger une BU (`curl -H
 * "x-bu-connectee: DJ"`) et bypasser toutes les règles d'accès. Ces deux
 * sources ne sont plus lues.
 *
 * Migration Microsoft : remplacer le corps de `lireAuteur` par la lecture du
 * JWT Entra ID / Power Pages (Web Roles → BU). Toutes les routes appelantes
 * utilisent déjà cette fonction unique : un seul point à changer, comme
 * auparavant.
 */

import { DEPARTEMENT_CODES, type DepartementCode } from "@/domain/veille";
import { lireSession, type Session } from "@/lib/session";

export interface AuteurRequete {
  bu: DepartementCode | null;
  email: string | null;
  /** `PERSONNE` (compte nominatif) ou `DIRECTION` (accès partagé). */
  typeCompte: Session["type"] | null;
  nom: string | null;
  /** Session complète, ou `null` si personne n'est connecté. */
  session: Session | null;
}

const ANONIME: AuteurRequete = {
  bu: null,
  email: null,
  typeCompte: null,
  nom: null,
  session: null,
};

/** Auteur de la requête, déduit de la session signée. Jamais d'en-tête. */
export async function lireAuteur(req: Request): Promise<AuteurRequete> {
  const session = await lireSession(req);
  if (!session) return ANONIME;
  const bu = (DEPARTEMENT_CODES as string[]).includes(session.bu) ? session.bu : null;
  if (!bu) return ANONIME;
  return { bu, email: session.email, typeCompte: session.type, nom: session.nom, session };
}

/** Une session est-elle ouverte ? (garde des routes API : 401 sinon) */
export async function sessionOuverte(req: Request): Promise<boolean> {
  return (await lireSession(req)) !== null;
}
