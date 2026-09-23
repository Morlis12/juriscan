/**
 * JuriScan AI — Couche domaine (découplée de Next.js / Prisma).
 *
 * Ces types sont la référence métier portable vers Microsoft Dataverse :
 * - `User` → table Dataverse `User` (acteurs par département / onglet)
 * - `VeilleAlerte` → table maîtresse `VeilleAlerte` (alerte de veille)
 * - `VeilleFiche` → table `VeilleFiche` (déclinaison par direction)
 * - `VeilleAction` → table `VeilleAction` (plan d'actions d'amélioration)
 *
 * Conventions Dataverse-ready : noms de tables/champs en anglais,
 * PascalCase pour les entités, camelCase pour les attributs.
 * Voir `src/lib/dataverse/tables.ts` pour le mapping exact des colonnes.
 */

/** Code département — correspond aux onglets du fichier d'origine. */
export type DepartementCode =
  | "CENTRAL_VRG"
  | "DJ"
  | "DAF"
  | "DRH"
  | "PATR_IMMO"
  | "DQHSE"
  | "DIR_COMM_MARK"
  | "DILS";

/** Libellés officiels des départements (affichage UI / Power Pages). */
export const DEPARTEMENTS: Record<DepartementCode, string> = {
  CENTRAL_VRG: "Veille Réglementaire Générale",
  DJ: "Direction Juridique",
  DAF: "Direction Administrative et Financière",
  DRH: "Direction des Ressources Humaines",
  PATR_IMMO: "Patrimoine Immobilier / Gestion Immobilière",
  DQHSE: "Direction Qualité, Hygiène, Sécurité, Environnement",
  DIR_COMM_MARK: "Direction Commerciale & Marketing",
  DILS: "Direction de l'Immobilier, de la Logistique et des Services",
};

export const DEPARTEMENT_CODES = Object.keys(DEPARTEMENTS) as DepartementCode[];

/** Statut de conformité — liste d'options (colonnes Excel d'origine). */
export type ConformiteStatut =
  | "CONFORME_100"
  | "NON_CONFORME_0"
  | "PARTIELLEMENT_25"
  | "PARTIELLEMENT_50"
  | "PARTIELLEMENT_75";

/** Pourcentage associé à chaque statut (0–100). */
export const CONFORMITE_POURCENTAGE: Record<ConformiteStatut, number> = {
  NON_CONFORME_0: 0,
  PARTIELLEMENT_25: 25,
  PARTIELLEMENT_50: 50,
  PARTIELLEMENT_75: 75,
  CONFORME_100: 100,
};

export const CONFORMITE_STATUTS = Object.keys(
  CONFORMITE_POURCENTAGE,
) as ConformiteStatut[];

/** Acteur interne assignable aux actions (table `User`). */
export interface DomainUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  departement: DepartementCode;
  createdAt: Date | string;
}

/**
 * Alerte de veille — table maîtresse (centralise les colonnes métiers).
 * Une alerte se décline en N fiches (une par département concerné).
 */
export interface DomainVeilleAlerte {
  id: string;
  numeroOrdre: string;
  qssfte: string | null;
  natureTexte: string;
  referenceTexte: string;
  article: string | null;
  resumeTexte: string;
  libelleApplicable: string;
  lienHypertexte: string | null;
  dateEntreeVigueur: Date | string | null;
  contenu: string;
  moyenCommunication: string | null;
  applicableA_AGL_CI: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Fiche département — déclinaison d'une alerte pour un onglet de direction.
 * Porte le traitement de conformité (statut, preuves, actions existantes).
 */
export interface DomainVeilleFiche {
  id: string;
  alerteId: string;
  departement: DepartementCode;
  actionsExistantes: string | null;
  preuvesExistantes: string | null;
  statutConformite: ConformiteStatut;
  preuveDifferee: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Action d'amélioration — suivi (délai, taux, responsable). */
export interface DomainVeilleAction {
  id: string;
  ficheId: string;
  libelleAction: string;
  responsableId: string | null;
  delai: Date | string | null;
  tauxAvancement: number;
  createdAt: Date | string;
}
