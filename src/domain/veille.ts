/**
 * AGL JuriCompliance — Couche domaine (découplée de Next.js / Prisma).
 *
 * Ces types sont la référence métier portable vers Microsoft Dataverse :
 * - `User` → table Dataverse `User` (acteurs par département)
 * - `VeilleAlerte` → table maîtresse `VeilleAlerte` (alerte de veille + `propositionBU` IA)
 * - `VeilleFiche` → table `VeilleFiche` (déclinaison par BU + `fluxStatut` workflow
 *   + colonnes SCD2 `version` / `validFrom` / `validTo` / `isCurrent` / `modifiedByBU`)
 * - `VeilleAction` → table `VeilleAction` (plan d'actions + colonnes SCD2)
 * - `VeilleFicheVersion` / `VeilleActionVersion` → tables d'historique SCD2
 *   (snapshots figés avant chaque modification)
 * - `VeilleJournal` → table `VeilleJournal` (journal lisible : qui / quoi /
 *   quand / par qui, consulté par `/dashboard/historique`)
 * - Accès strict : voir `src/domain/acces.ts` (centrale vs BU, DJ cloisonnée).
 * - Historique : voir `src/domain/historique.ts` (actions tracées SCD2).
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

/**
 * Natures de texte déduites par l'IA dès l'OCR (liste fermée, étendue aux
 * actes de Journal Officiel : un JO contient des dizaines d'actes distincts —
 * enquêtes publiques, certificats fonciers, récépissés d'association, RCCM…).
 * Règles : Loi (votée, « Loi n°… »), Ordonnance, Décret (« Décret n°… »,
 * Conseil des ministres), Arrêté (ministériel, « Arrêté n°… »), Circulaire
 * (instruction), Décision, actes JO listés ci-dessous, Autre (si indéterminé
 * — le juridique corrige).
 */
export const NATURES_TEXTE = [
  "Loi",
  "Ordonnance",
  "Décret",
  "Arrêté",
  "Circulaire",
  "Décision",
  "Avis d'enquête publique / commodo et incommodo",
  "Certificat foncier individuel",
  "Certificat foncier collectif",
  "Certificat de mutation de propriété foncière",
  "Récépissé de déclaration d'association",
  "Formulaire de modification RCCM",
  "Autre",
] as const;

export type NatureTexte = (typeof NATURES_TEXTE)[number];

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

/**
 * Statut d'affichage déduit du taux piloté (0–100).
 *
 * La colonne `statutConformite` d'une fiche n'est modifiée que depuis la page
 * fiche ; le taux, lui, est ajustable depuis le tableau de bord. Sans cette
 * fonction d'inversion, l'étiquette (« Partiel 50 % ») contredirait le chiffre
 * affiché à côté (« 63 % ») — d'où cette règle unique, partagée par le tableau
 * de bord et la vue immersive.
 */
export function conformiteStatutDepuisTaux(taux: number): ConformiteStatut {
  if (taux >= 100) return "CONFORME_100";
  if (taux >= 75) return "PARTIELLEMENT_75";
  if (taux >= 50) return "PARTIELLEMENT_50";
  if (taux >= 25) return "PARTIELLEMENT_25";
  return "NON_CONFORME_0";
}

/**
 * Workflow à double validation AGL JuriCompliance (IA + Juridique) × JuriDesk (BU).
 * Portable Dataverse : OptionSet `FluxStatut` sur la table `VeilleFiche`.
 * - ATTENTE_VALIDATION_JURIDIQUE : l'IA a fait l'OCR et proposé la BU, le juridique doit valider.
 * - ATTENTE_APPROBATION_METIER : le juridique a validé, la BU doit approuver ou rejeter.
 * - APPROUVE_METIER : la BU a validé et pilote sa conformité (actions, délais, taux 0-100 %).
 * - REJETE_METIER : la BU a refusé, retour au juridique.
 */
export type FluxStatut =
  | "ATTENTE_VALIDATION_JURIDIQUE"
  | "ATTENTE_APPROBATION_METIER"
  | "APPROUVE_METIER"
  | "REJETE_METIER";

export const FLUX_STATUTS: FluxStatut[] = [
  "ATTENTE_VALIDATION_JURIDIQUE",
  "ATTENTE_APPROBATION_METIER",
  "APPROUVE_METIER",
  "REJETE_METIER",
];

export const FLUX_STATUT_LABELS: Record<FluxStatut, string> = {
  ATTENTE_VALIDATION_JURIDIQUE: "Attente validation juridique",
  ATTENTE_APPROBATION_METIER: "Attente approbation métier",
  APPROUVE_METIER: "Approuvé métier",
  REJETE_METIER: "Rejeté métier",
};

/**
 * BU éligibles à la recommandation IA (`propositionBU`) et à l'approbation métier.
 * CENTRAL_VRG exclu du routage IA (périmètre transverse = la centrale pilote).
 * DIR_COMM_MARK incluse : l'IA peut suggérer la direction commerciale quand le
 * texte la concerne (ex : concurrence, étiquetage, prix).
 */
export const BU_PROPOSITIONNABLES = [
  "DJ",
  "DRH",
  "DAF",
  "DQHSE",
  "PATR_IMMO",
  "DILS",
  "DIR_COMM_MARK",
] as const satisfies readonly DepartementCode[];

export type PropositionBU = (typeof BU_PROPOSITIONNABLES)[number];

/**
 * Pertinence transit/logistique (contexte métier AGL CI, voir prompt
 * POST /api/analyse). `Hors périmètre` = aucun lien avec l'activité →
 * jamais de BU suggérée (`propositionBU` vide). `applicableAGLCI` (booléen
 * historique) reste inchangé ; la centrale tranche dans tous les cas.
 */
export const PERTINENCE_TRANSIT = [
  "Directe",
  "Indirecte",
  "Hors périmètre",
] as const;

export type PertinenceTransit = (typeof PERTINENCE_TRANSIT)[number];

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
  /** Recommandation IA (Gemini 3.6 Flash) : BU la plus probable. */
  propositionBU: DepartementCode | null;
  /** Pertinence transit/logistique (Directe | Indirecte | Hors périmètre). */
  pertinenceTransit: PertinenceTransit | null;
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
  /** Position dans le workflow à double validation AGL JuriCompliance × JuriDesk. */
  fluxStatut: FluxStatut;
  /** Document de preuve joint (nom, MIME, base64) — téléversé par la BU. */
  preuveFichierNom: string | null;
  preuveFichierMime: string | null;
  preuveFichierDonnees: string | null;
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
