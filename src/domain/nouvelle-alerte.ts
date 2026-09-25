/**
 * JuriScan AI — Domaine « Nouvelle alerte » (pur, découplé de Next.js).
 *
 * Rôle : définir les 21 colonnes métier de la ligne d'alerte analysée.
 * Zéro donnée fictive : l'extraction vient exclusivement de POST /api/analyse
 * (Gemini réel) ou de la frappe clavier (saisie manuelle libre).
 *
 * Portabilité Dataverse / Power Pages :
 * - Table VeilleAlerte (12 champs) : alerte maîtresse.
 * - Table VeilleFiche (5 champs) : déclinaison par département.
 * - Table VeilleAction (4 champs) : plan d'amélioration.
 * Total = 21 colonnes éditables dans l'écran d'analyse.
 */

import type { ConformiteStatut, DepartementCode } from "@/domain/veille";
import { DEPARTEMENTS } from "@/domain/veille";

/** Les 21 colonnes d'une ligne d'alerte analysée (tout est éditable côté UI). */
export interface AlerteAnalyse21 {
  // ——— VeilleAlerte : 12 champs ———
  /** 01 — N° d'ordre */
  numeroOrdre: string;
  /** 02 — QSSTE */
  qssfte: string;
  /** 03 — Nature du texte */
  natureTexte: string;
  /** 04 — Référence du texte */
  referenceTexte: string;
  /** 05 — Article */
  article: string;
  /** 06 — Résumé du texte (IA) */
  resumeTexte: string;
  /** 07 — Texte / libellé applicable en vigueur */
  libelleApplicable: string;
  /** 08 — Lien hypertexte */
  lienHypertexte: string;
  /** 09 — Date d'entrée en vigueur (YYYY-MM-DD) */
  dateEntreeVigueur: string;
  /** 10 — Contenu brut extrait (PDF / image) */
  contenu: string;
  /** 11 — Moyen de communication */
  moyenCommunication: string;
  /** 12 — Applicable à AGL CI */
  applicableAGLCI: boolean;
  /** Recommandation IA (Gemini 3.6 Flash) : BU la plus probable (DJ, DRH, DAF, DQHSE, PATR_IMMO, DILS). */
  propositionBU: DepartementCode | "";
  // ——— VeilleFiche : 5 champs + assignation multi-BU ———
  /** 13 — Département d'acteurs responsable (assignation principale, compat). */
  departementResponsable: DepartementCode;
  /** 13bis — BU cochées : un texte peut concerner plusieurs BU (une fiche par BU). */
  departementsResponsables: DepartementCode[];
  /** 14 — Actions conformité existantes */
  actionsExistantes: string;
  /** 15 — Preuves de conformité existantes */
  preuvesExistantes: string;
  /** 16 — Statut de conformité */
  statutConformite: ConformiteStatut;
  /** 17 — Preuve de conformité différée */
  preuveDifferee: string;
  // ——— VeilleAction : 4 champs ———
  /** 18 — Action d'amélioration */
  libelleAction: string;
  /** 19 — Responsable */
  responsable: string;
  /** 20 — Délai (YYYY-MM-DD) */
  delai: string;
  /** 21 — Taux d'avancement (0–100) */
  tauxAvancement: number;
}

/** Options d'assignation dans le menu déroulant (DJ, DRH, DAF, DQHSE, Patr Immo, DILS…). */
export const DEPARTEMENT_OPTIONS: { code: DepartementCode; label: string }[] = (
  Object.keys(DEPARTEMENTS) as DepartementCode[]
)
  .filter((code) => code !== "CENTRAL_VRG")
  .map((code) => ({ code, label: DEPARTEMENTS[code] }));

/**
 * Formulaire vierge pour la saisie manuelle libre (sans document) :
 * 21 colonnes vides, neutres, prêtes à la frappe clavier.
 * Seul le département reprend la première option (sélecteur oblige).
 */
export function creerAlerteVierge(): AlerteAnalyse21 {
  return {
    numeroOrdre: "",
    qssfte: "",
    natureTexte: "",
    referenceTexte: "",
    article: "",
    resumeTexte: "",
    libelleApplicable: "",
    lienHypertexte: "",
    dateEntreeVigueur: "",
    contenu: "",
    moyenCommunication: "",
    applicableAGLCI: true,
    propositionBU: "",
    departementResponsable: "DJ",
    departementsResponsables: ["DJ"],
    actionsExistantes: "",
    preuvesExistantes: "",
    statutConformite: "NON_CONFORME_0",
    preuveDifferee: "",
    libelleAction: "",
    responsable: "",
    delai: "",
    tauxAvancement: 0,
  };
}
