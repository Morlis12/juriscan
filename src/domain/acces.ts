/**
 * JuriScan AI — Contrôle d'accès par BU (découplé de Next.js / Prisma).
 *
 * Règle métier demandée : seuls les membres d'une BU peuvent modifier /
 * répondre à leur assignation ; ils n'ont jamais la main sur les fiches
 * des autres BU.
 *
 * Matrice appliquée (client + API) :
 * - Créer une alerte / assigner les BU : JURIDIQUE uniquement.
 * - Modifier le texte source (12 champs alerte) : JURIDIQUE uniquement.
 * - Réassigner une fiche vers une autre BU (PUT `departement`) : JURIDIQUE uniquement.
 * - Valider vers métier (ATTENTE_VALIDATION_JURIDIQUE → ATTENTE_APPROBATION_METIER) : JURIDIQUE uniquement.
 * - Renvoyer un rejet vers la BU : JURIDIQUE uniquement.
 * - Approuver / rejeter une assignation : BU propriétaire uniquement (bu === fiche.departement).
 * - Piloter la conformité BU (statut, preuves, preuve différée, action, responsable,
 *   délai, taux 0-100 %) : BU propriétaire uniquement, sauf JURIDIQUE (admin fonctionnel).
 * - Consulter (lecture + historique) : tous.
 *
 * Le « JURIDIQUE » regroupe CENTRAL_VRG (veille générale) et DJ (direction
 * juridique) : c'est l'équipe propriétaire transverse. Les autres BU
 * (DAF, DRH, PATR_IMMO, DQHSE, DIR_COMM_MARK, DILS) sont cloisonnées entre elles.
 *
 * Portabilité Microsoft :
 * - Dataverse : 1 Business Unit par BU, 1 Team par BU, 1 Security Role
 *   « JuriScan BU » (accès cloisonné : lecture globale, écriture si
 *   `departement == équipe de l'utilisateur`), 1 Security Role
 *   « JuriScan Juridique » (écriture globale + assignation).
 * - Power Pages : remplacer `BUConnectee` (prototype localStorage) par
 *   l'utilisateur Entra ID (`advocate` / `contact.parentcustomerid`) et les
 *   Web Roles ; le serveur lira le JWT au lieu des en-têtes `x-bu-connectee`.
 * - Les en-têtes `x-bu-connectee` / `x-user-email` sont le pont prototype :
 *   `src/lib/acces.ts` (`lireAuteur`) centralise leur lecture pour basculer
 *   vers Entra ID sans toucher les routes.
 */

import type { DepartementCode } from "@/domain/veille";

/** BU connectée (prototype) : le sélecteur persiste dans localStorage. */
export type BUConnectee = DepartementCode;

/** Clé localStorage du prototype (remplacée par Entra ID côté Microsoft). */
export const CLE_BU_CONNECTEE = "juriscan-bu-connectee";

/** Clé localStorage de l'email prototype (remplacée par le JWT Entra ID). */
export const CLE_EMAIL_CONNECTE = "juriscan-email-connecte";

/** Équipe transverse : peut assigner, valider, réassigner, modifier tout texte. */
export const BU_JURIDIQUE: readonly DepartementCode[] = ["CENTRAL_VRG", "DJ"];

/** Un membre du juridique ? (accès global fonctionnel). */
export function estJuridique(bu: DepartementCode | null | undefined): boolean {
  return bu === "CENTRAL_VRG" || bu === "DJ";
}

/** Peut modifier / répondre à cette fiche ? (juridique global, BU cloisonnée). */
export function peutModifierFiche(
  buConnectee: DepartementCode | null | undefined,
  ficheDepartement: DepartementCode,
): boolean {
  if (!buConnectee) return false;
  if (estJuridique(buConnectee)) return true;
  return buConnectee === ficheDepartement;
}

/** Peut créer une alerte et assigner les BU ? (juridique uniquement). */
export function peutCreerAlerte(bu: DepartementCode | null | undefined): boolean {
  return estJuridique(bu ?? undefined);
}

/** Peut valider une fiche vers le métier ? (juridique uniquement). */
export function peutValiderVersMetier(bu: DepartementCode | null | undefined): boolean {
  return estJuridique(bu ?? undefined);
}

/** Peut renvoyer un rejet vers la BU / réassigner ? (juridique uniquement). */
export function peutGererRejet(bu: DepartementCode | null | undefined): boolean {
  return estJuridique(bu ?? undefined);
}

/** Peut approuver ou rejeter sa propre assignation ? (BU propriétaire). */
export function peutStatuerAssignation(
  buConnectee: DepartementCode | null | undefined,
  ficheDepartement: DepartementCode,
): boolean {
  if (!buConnectee) return false;
  return buConnectee === ficheDepartement;
}

/** Libellé d'aide affiché quand l'action est bloquée (tooltip / title). */
export function messageAccesRefuse(
  buConnectee: DepartementCode | null | undefined,
  ficheDepartement: DepartementCode,
): string {
  if (!buConnectee) return "Choisissez votre BU connectée pour agir.";
  if (estJuridique(buConnectee)) return "";
  return `Réservé aux membres ${ficheDepartement} (vous êtes ${buConnectee}).`;
}
