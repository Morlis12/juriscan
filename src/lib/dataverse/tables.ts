/**
 * JuriScan AI — Mapping Dataverse (portable, sans dépendance Prisma/Next.js).
 *
 * Recréation cible dans Dataverse / Power Pages :
 * - 7 tables : User, VeilleAlerte, VeilleFiche, VeilleAction (+ SCD2 :
 *   VeilleFicheVersion, VeilleActionVersion, VeilleJournal).
 * - 3 jeux d'options (OptionSets) : DepartementCode, ConformiteStatut, FluxStatut.
 * - Relations : voir `relations` ci-dessous (lookup + cascade).
 * - Workflow double validation : `VeilleAlerte.propositionBU` (recommandation IA)
 *   → `VeilleFiche.fluxStatut` (ATTENTE_VALIDATION_JURIDIQUE → ATTENTE_APPROBATION_METIER
 *   → APPROUVE_METIER | REJETE_METIER).
 * - Multi-BU : un texte peut concerner plusieurs BU → une `VeilleFiche` par BU
 *   cochée (cases à cocher de l'écran nouvelle-alerte) ; le pilotage regroupe
 *   par `numeroOrdre` et affiche la conformité de chaque BU.
 * - Cloisonnement BU : 1 Business Unit + 1 Team par BU ; Security Role
 *   « JuriScan BU » (lecture globale, écriture si `departement` == équipe),
 *   « JuriScan Juridique » (écriture globale + assignation). Voir
 *   `src/domain/acces.ts` (matrice prototype → rôles Dataverse).
 * - Traçabilité SCD2 : activer l'Auditing natif + recréer `VeilleJournal`
 *   (lecture Power Pages `/dashboard/historique`) et les tables `*Version`
 *   (colonnes validFrom/validTo/isCurrent/version). Voir
 *   `src/domain/historique.ts` et `src/lib/historique.ts`.
 */

export interface DataverseField {
  /** Nom logique Dataverse (minuscules, préfixe éditeur à ajouter côté Dataverse). */
  logicalName: string;
  /** Nom d'affichage dans Dataverse / Power Pages. */
  displayName: string;
  /** Type Dataverse cible. */
  dataType:
    | "SingleLineOfText"
    | "MultipleLinesOfText"
    | "WholeNumber"
    | "DecimalNumber"
    | "DateTime"
    | "TwoOptions"
    | "OptionSet"
    | "Lookup"
    | "File"
    | "UniqueIdentifier";
}

export interface DataverseTable {
  displayName: string;
  primaryColumn: string;
  fields: DataverseField[];
}

export const DATAVERSE_OPTION_SETS = {
  DepartementCode: [
    "CENTRAL_VRG",
    "DJ",
    "DAF",
    "DRH",
    "PATR_IMMO",
    "DQHSE",
    "DIR_COMM_MARK",
    "DILS",
  ],
  ConformiteStatut: [
    "NON_CONFORME_0",
    "PARTIELLEMENT_25",
    "PARTIELLEMENT_50",
    "PARTIELLEMENT_75",
    "CONFORME_100",
  ],
  FluxStatut: [
    "ATTENTE_VALIDATION_JURIDIQUE",
    "ATTENTE_APPROBATION_METIER",
    "APPROUVE_METIER",
    "REJETE_METIER",
  ],
} as const;

export const DATAVERSE_TABLES: Record<string, DataverseTable> = {
  User: {
    displayName: "Utilisateur",
    primaryColumn: "email",
    fields: [
      { logicalName: "email", displayName: "Email", dataType: "SingleLineOfText" },
      { logicalName: "firstname", displayName: "Prénom", dataType: "SingleLineOfText" },
      { logicalName: "lastname", displayName: "Nom", dataType: "SingleLineOfText" },
      { logicalName: "departement", displayName: "Département", dataType: "OptionSet" },
    ],
  },
  VeilleAlerte: {
    displayName: "Alerte de veille",
    primaryColumn: "numeroOrdre",
    fields: [
      { logicalName: "numeroordre", displayName: "N° Ordre", dataType: "SingleLineOfText" },
      { logicalName: "qssfte", displayName: "QSSTE", dataType: "SingleLineOfText" },
      { logicalName: "naturetexte", displayName: "Nature du texte", dataType: "SingleLineOfText" },
      { logicalName: "referencetexte", displayName: "Référence du texte", dataType: "SingleLineOfText" },
      { logicalName: "article", displayName: "Article", dataType: "SingleLineOfText" },
      { logicalName: "resumetexte", displayName: "Résumé du texte (IA)", dataType: "MultipleLinesOfText" },
      { logicalName: "libelleapplicable", displayName: "Texte applicable en vigueur", dataType: "MultipleLinesOfText" },
      { logicalName: "lienhypertexte", displayName: "Lien hypertexte", dataType: "SingleLineOfText" },
      { logicalName: "dateentreevigueur", displayName: "Date d'entrée en vigueur", dataType: "DateTime" },
      { logicalName: "contenu", displayName: "Contenu brut (PDF/image)", dataType: "MultipleLinesOfText" },
      { logicalName: "moyencommunication", displayName: "Moyen de communication", dataType: "SingleLineOfText" },
      { logicalName: "applicableaglci", displayName: "Applicable à AGL CI", dataType: "TwoOptions" },
      { logicalName: "propositionbu", displayName: "BU recommandée par l'IA (Gemini 3.6 Flash)", dataType: "OptionSet" },
    ],
  },
  VeilleFiche: {
    displayName: "Fiche département",
    primaryColumn: "departement",
    fields: [
      { logicalName: "alerte", displayName: "Alerte parente", dataType: "Lookup" },
      { logicalName: "departement", displayName: "Département (onglet)", dataType: "OptionSet" },
      { logicalName: "actionsexistantes", displayName: "Actions conformité existantes", dataType: "MultipleLinesOfText" },
      { logicalName: "preuvesexistantes", displayName: "Preuves de conformité existantes", dataType: "MultipleLinesOfText" },
      { logicalName: "statutconformite", displayName: "Statut de conformité", dataType: "OptionSet" },
      { logicalName: "preuvedifferee", displayName: "Preuve de conformité différée", dataType: "MultipleLinesOfText" },
      { logicalName: "fluxstatut", displayName: "Statut du workflow (double validation)", dataType: "OptionSet" },
      { logicalName: "preuvefichier", displayName: "Document de preuve (fichier)", dataType: "File" },
      { logicalName: "version", displayName: "Version SCD2", dataType: "WholeNumber" },
      { logicalName: "validfrom", displayName: "Valide depuis (SCD2)", dataType: "DateTime" },
      { logicalName: "validto", displayName: "Valide jusqu'à (SCD2)", dataType: "DateTime" },
      { logicalName: "iscurrent", displayName: "Version courante (SCD2)", dataType: "TwoOptions" },
      { logicalName: "modifiedbybu", displayName: "BU auteur (SCD2)", dataType: "OptionSet" },
    ],
  },
  VeilleAction: {
    displayName: "Action d'amélioration",
    primaryColumn: "libelleaction",
    fields: [
      { logicalName: "fiche", displayName: "Fiche parente", dataType: "Lookup" },
      { logicalName: "libelleaction", displayName: "Action d'amélioration", dataType: "MultipleLinesOfText" },
      { logicalName: "responsable", displayName: "Responsable", dataType: "Lookup" },
      { logicalName: "delai", displayName: "Délai", dataType: "DateTime" },
      { logicalName: "tauxavancement", displayName: "Taux d'avancement (%)", dataType: "DecimalNumber" },
      { logicalName: "version", displayName: "Version SCD2", dataType: "WholeNumber" },
      { logicalName: "validfrom", displayName: "Valide depuis (SCD2)", dataType: "DateTime" },
      { logicalName: "validto", displayName: "Valide jusqu'à (SCD2)", dataType: "DateTime" },
      { logicalName: "iscurrent", displayName: "Version courante (SCD2)", dataType: "TwoOptions" },
      { logicalName: "modifiedbybu", displayName: "BU auteur (SCD2)", dataType: "OptionSet" },
    ],
  },
  VeilleFicheVersion: {
    displayName: "Version fiche (SCD2)",
    primaryColumn: "fiche",
    fields: [
      { logicalName: "fiche", displayName: "Fiche courante", dataType: "Lookup" },
      { logicalName: "version", displayName: "Version figée", dataType: "WholeNumber" },
      { logicalName: "validfrom", displayName: "Valide depuis", dataType: "DateTime" },
      { logicalName: "validto", displayName: "Valide jusqu'à", dataType: "DateTime" },
      { logicalName: "departement", displayName: "Département", dataType: "OptionSet" },
      { logicalName: "statutconformite", displayName: "Statut de conformité", dataType: "OptionSet" },
      { logicalName: "fluxstatut", displayName: "Statut workflow", dataType: "OptionSet" },
      { logicalName: "modifiedbybu", displayName: "BU auteur", dataType: "OptionSet" },
      { logicalName: "motif", displayName: "Motif (PUT/PATCH)", dataType: "SingleLineOfText" },
    ],
  },
  VeilleActionVersion: {
    displayName: "Version action (SCD2)",
    primaryColumn: "action",
    fields: [
      { logicalName: "action", displayName: "Action courante", dataType: "Lookup" },
      { logicalName: "fiche", displayName: "Fiche parente", dataType: "Lookup" },
      { logicalName: "version", displayName: "Version figée", dataType: "WholeNumber" },
      { logicalName: "validfrom", displayName: "Valide depuis", dataType: "DateTime" },
      { logicalName: "validto", displayName: "Valide jusqu'à", dataType: "DateTime" },
      { logicalName: "libelleaction", displayName: "Action", dataType: "MultipleLinesOfText" },
      { logicalName: "tauxavancement", displayName: "Taux (%)", dataType: "DecimalNumber" },
      { logicalName: "modifiedbybu", displayName: "BU auteur", dataType: "OptionSet" },
      { logicalName: "motif", displayName: "Motif (PUT/PATCH)", dataType: "SingleLineOfText" },
    ],
  },
  VeilleJournal: {
    displayName: "Journal des modifications",
    primaryColumn: "action",
    fields: [
      { logicalName: "alerte", displayName: "Alerte", dataType: "Lookup" },
      { logicalName: "fiche", displayName: "Fiche", dataType: "Lookup" },
      { logicalName: "entite", displayName: "Entité (ALERTE/FICHE/ACTION)", dataType: "SingleLineOfText" },
      { logicalName: "action", displayName: "Action tracée", dataType: "SingleLineOfText" },
      { logicalName: "buauteur", displayName: "BU auteur", dataType: "OptionSet" },
      { logicalName: "details", displayName: "Détail lisible", dataType: "MultipleLinesOfText" },
      { logicalName: "champsmodifies", displayName: "Champs modifiés (JSON)", dataType: "MultipleLinesOfText" },
    ],
  },
};

/**
 * Relations inter-tables (Lookup Dataverse, suppression en cascade
 * Alerte → Fiches → Actions ; Responsable optionnel vers User).
 */
export const DATAVERSE_RELATIONS = [
  "VeilleAlerte (1) → VeilleFiche (N) via alerteId [Cascade]",
  "VeilleFiche (1) → VeilleAction (N) via ficheId [Cascade]",
  "User (1) → VeilleAction (N) via responsableId [Optionnel, Restrict]",
  "VeilleFiche (1) → VeilleFicheVersion (N) via ficheId [Cascade, SCD2]",
  "VeilleAction (1) → VeilleActionVersion (N) via actionId [Cascade, SCD2]",
  "VeilleAlerte (1) → VeilleJournal (N) via alerteId [Cascade, lecture Power Pages]",
  "VeilleFiche (1) → VeilleJournal (N) via ficheId [Cascade, lecture Power Pages]",
] as const;
