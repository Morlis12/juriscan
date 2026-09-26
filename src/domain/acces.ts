/**
 * JuriScan AI — Contrôle d'accès strict par BU (découplé de Next.js / Prisma).
 *
 * Règle métier : une BU connectée ne change QUE les informations de sa BU,
 * jamais celles des autres — y compris DJ, qui est une BU normale cloisonnée.
 * Seule la centrale (CENTRAL_VRG, veille réglementaire générale) pilote le
 * flux transverse ; elle ne touche jamais à la conformité des BU.
 *
 * Matrice appliquée (client + API) :
 * - Créer une alerte / assigner les BU : CENTRALE uniquement.
 * - Modifier le texte source (12 champs alerte) : CENTRALE uniquement.
 * - Réassigner une fiche vers une autre BU : CENTRALE uniquement.
 * - Valider vers métier / renvoyer un rejet vers la BU : CENTRALE uniquement.
 * - Ouvrir la fiche en modification : CENTRALE (texte + réassignation) ou
 *   BU propriétaire (conformité) ; les autres BU : lecture seule.
 * - Approuver / rejeter une assignation : BU propriétaire uniquement.
 * - Piloter la conformité (statut, preuves, preuve différée, document,
 *   action, responsable, délai, taux 0-100 %) : BU propriétaire uniquement.
 * - Consulter (lecture + historique) : tous.
 *
 * Portabilité Microsoft :
 * - Dataverse : 1 Business Unit par BU (+ 1 BU « Centrale »), 1 Team par BU,
 *   Security Role « JuriScan BU » (lecture globale, écriture si `departement`
 *   == équipe de l'utilisateur — DJ incluse, sans exception), Security Role
 *   « JuriScan Centrale » (création, assignation, transitions de flux,
 *   réassignation ; écriture bloquée sur les champs conformité BU).
 * - Power Pages : remplacer `BUConnectee` (prototype localStorage) par
 *   l'utilisateur Entra ID et les Web Roles ; le serveur lira le JWT au lieu
 *   des en-têtes `x-bu-connectee` (voir `src/lib/acces.ts`).
 */

import type { DepartementCode } from "@/domain/veille";

/** BU connectée (prototype) : le sélecteur persiste dans localStorage. */
export type BUConnectee = DepartementCode;

/** Clé localStorage du prototype (remplacée par Entra ID côté Microsoft). */
export const CLE_BU_CONNECTEE = "juriscan-bu-connectee";

/** Clé localStorage de l'email prototype (remplacée par le JWT Entra ID). */
export const CLE_EMAIL_CONNECTE = "juriscan-email-connecte";

/** Équipe transverse : pilote le flux, jamais la conformité des BU. */
export const BU_CENTRALE: DepartementCode = "CENTRAL_VRG";

/** Un membre de la centrale ? (pilote le flux transverse). */
export function estCentrale(bu: DepartementCode | null | undefined): boolean {
  return bu === BU_CENTRALE;
}

/**
 * Peut ouvrir la fiche en modification ?
 * Centrale (texte + réassignation) ou BU propriétaire (conformité).
 */
export function peutOuvrirFiche(
  buConnectee: DepartementCode | null | undefined,
  ficheDepartement: DepartementCode,
): boolean {
  if (!buConnectee) return false;
  return estCentrale(buConnectee) || buConnectee === ficheDepartement;
}

/**
 * Peut piloter la conformité de cette fiche (statut, preuves, action,
 * responsable, délai, taux) ? BU propriétaire uniquement — strict.
 */
export function peutPiloterConformite(
  buConnectee: DepartementCode | null | undefined,
  ficheDepartement: DepartementCode,
): boolean {
  if (!buConnectee) return false;
  return buConnectee === ficheDepartement;
}

/** Peut créer une alerte et assigner les BU ? (centrale uniquement). */
export function peutCreerAlerte(bu: DepartementCode | null | undefined): boolean {
  return estCentrale(bu ?? undefined);
}

/** Peut valider une fiche vers le métier ? (centrale uniquement). */
export function peutValiderVersMetier(bu: DepartementCode | null | undefined): boolean {
  return estCentrale(bu ?? undefined);
}

/** Peut renvoyer un rejet vers la BU / réassigner ? (centrale uniquement). */
export function peutGererRejet(bu: DepartementCode | null | undefined): boolean {
  return estCentrale(bu ?? undefined);
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
  if (buConnectee === ficheDepartement) return "";
  return `Réservé aux membres ${ficheDepartement} (vous êtes ${buConnectee}).`;
}
