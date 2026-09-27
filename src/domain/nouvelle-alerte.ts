/**
 * AGL JuriCompliance — Domaine « Nouvelle alerte » (pur, découplé de Next.js).
 *
 * Rôle : définir les colonnes métier des lignes d'alerte analysées.
 * Zéro donnée fictive : l'extraction vient exclusivement de POST /api/analyse
 * (IA réelle) ou de la frappe clavier (saisie manuelle libre).
 *
 * Modèle multi-actes : « 1 document déposé » = « N textes extraits » (un
 * Journal Officiel contient des dizaines d'actes juridiquement distincts).
 * POST /api/analyse répond `{ actes: AlerteAnalyse21[] }` (un objet par acte,
 * jamais fusionnés) ; l'écran fait défiler « Acte X / N », chacun avec sa
 * propre assignation multi-BU ; la sauvegarde crée N `VeilleAlerte`
 * (`AGL-…-01`, `-02`, …). La saisie manuelle = 1 acte.
 *
 * Répartition des rôles :
 * - Le juridique renseigne le texte + coche les BU (nouvelle-alerte).
 * - Chaque BU pilote sa conformité (preuves, actions, statut, responsable,
 *   délai, taux) depuis l'approbation puis le tableau de bord.
 *
 * Portabilité Dataverse / Power Pages :
 * - Table VeilleAlerte (12 champs) : alerte maîtresse.
 * - Table VeilleFiche (5 champs + fluxStatut) : une fiche par BU cochée.
 * - Table VeilleAction (4 champs) : plan d'amélioration piloté par la BU.
 */

import type { ConformiteStatut, DepartementCode, PertinenceTransit } from "@/domain/veille";
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
  /** Pertinence transit/logistique déduite par l'IA (vide = non renseignée). */
  pertinenceTransit: PertinenceTransit | "";
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
 * Un acte extrait côté écran : les 21 colonnes + identifiant local (`idActe`,
 * index dans le lot) + état de validation. « Valider et assigner la ligne »
 * marque l'acte `valide` et avance vers le suivant ; l'enregistrement final
 * sauvegarde les actes ayant au moins une BU cochée (les autres — dont les
 * « Hors périmètre » sans BU — sont ignorés avec un message).
 */
export interface ActeAnalyse extends AlerteAnalyse21 {
  /** Index local dans le lot déposé (navigation « Acte X / N »). */
  idActe: number;
  /** Ligne relue et validée par la centrale (prête à enregistrer). */
  valide: boolean;
}

/** Enveloppe un lot d'actes (auto : N actes IA ; manuel : 1 acte). */
export function numeroterActes(actes: AlerteAnalyse21[]): ActeAnalyse[] {
  return actes.map((a, i) => ({ ...a, idActe: i, valide: false }));
}

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
    pertinenceTransit: "",
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
