/**
 * JuriScan AI — Traçabilité SCD Type 2 (découplé de Next.js / Prisma).
 *
 * Exigence : chaque modification est tracée et l'historique est consultable.
 * Implémentation SCD (Slowly Changing Dimension) de type 2 :
 * - Les tables courantes (`VeilleFiche`, `VeilleAction`) portent
 *   `version`, `validFrom`, `validTo`, `isCurrent`, `modifiedByBU`,
 *   `modifiedByEmail` : seule la ligne `isCurrent` est affichée / modifiée.
 * - Chaque modification fige l'ancienne image dans `VeilleFicheVersion` /
 *   `VeilleActionVersion` (`validTo = now`, `version` incrémentée côté courant).
 * - Chaque modification écrit une ligne lisible dans `VeilleJournal`
 *   (qui, quoi, quand, par qui, champs modifiés) : c'est ce journal que
 *   l'écran `/dashboard/historique` et la section « Historique » de la fiche
 *   consultent.
 *
 * Portabilité Microsoft / Dataverse :
 * - Activer l'Auditing natif Dataverse sur VeilleAlerte / VeilleFiche /
 *   VeilleAction (traçabilité système), et recréer `VeilleJournal` comme table
 *   personnalisée (lecture Power Pages) + `VeilleFicheVersion` /
 *   `VeilleActionVersion` comme tables d'historique SCD2 (colonnes
 *   validFrom / validTo / isCurrent / version).
 * - `modifiedByBU` → Team / Business Unit Dataverse ; `emailAuteur` →
 *   `createdby` (Entra ID) ; `champsModifies` (JSON) → colonne texte + vue
 *   chronologique Power Pages (voir `src/lib/dataverse/tables.ts`).
 */

export type HistoriqueEntite = "ALERTE" | "FICHE" | "ACTION";

/** Actions tracées (workflow + pilotage BU + réassignation). */
export type HistoriqueAction =
  | "CREATION"
  | "VALIDATION_JURIDIQUE"
  | "APPROBATION_BU"
  | "REJET_BU"
  | "RENVOI_BU"
  | "MODIFICATION_FICHE"
  | "MODIFICATION_TEXTE"
  | "MODIFICATION_TAUX"
  | "MODIFICATION_PREUVE"
  | "MODIFICATION_ACTION"
  | "REASSIGNATION";

export const HISTORIQUE_ACTIONS: HistoriqueAction[] = [
  "CREATION",
  "VALIDATION_JURIDIQUE",
  "APPROBATION_BU",
  "REJET_BU",
  "RENVOI_BU",
  "MODIFICATION_FICHE",
  "MODIFICATION_TEXTE",
  "MODIFICATION_TAUX",
  "MODIFICATION_PREUVE",
  "MODIFICATION_ACTION",
  "REASSIGNATION",
];

export const HISTORIQUE_ACTION_LABELS: Record<HistoriqueAction, string> = {
  CREATION: "Création / assignation",
  VALIDATION_JURIDIQUE: "Validation juridique → métier",
  APPROBATION_BU: "Approbation métier",
  REJET_BU: "Rejet d'assignation (BU)",
  RENVOI_BU: "Renvoi vers la BU (retraitement rejet)",
  MODIFICATION_FICHE: "Modification de la fiche BU",
  MODIFICATION_TEXTE: "Modification du texte source",
  MODIFICATION_TAUX: "Pilotage du taux d'avancement",
  MODIFICATION_PREUVE: "Modification des preuves",
  MODIFICATION_ACTION: "Modification du plan d'action",
  REASSIGNATION: "Réassignation vers une autre BU",
};

/** Ligne du journal telle que renvoyée par GET /api/historique. */
export interface JournalEntree {
  id: string;
  alerteId: string | null;
  ficheId: string | null;
  actionId: string | null;
  numeroOrdre: string | null;
  ficheDepartement: string | null;
  entite: HistoriqueEntite;
  action: HistoriqueAction | string;
  buAuteur: string | null;
  emailAuteur: string | null;
  details: string | null;
  champsModifies: string[];
  createdAt: string;
}
