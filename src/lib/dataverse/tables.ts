/**
 * JuriScan AI — Mapping Dataverse (portable, sans dépendance Prisma/Next.js).
 *
 * Recréation cible dans Dataverse / Power Pages :
 * - 4 tables : User, VeilleAlerte, VeilleFiche, VeilleAction
 * - 2 jeux d'options (OptionSets) : DepartementCode, ConformiteStatut
 * - Relations : voir `relations` ci-dessous (lookup + cascade).
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
] as const;
