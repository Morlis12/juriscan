/**
 * JuriScan AI — Domaine « Nouvelle alerte » (pur, découplé de Next.js).
 *
 * Rôle : définir les 21 colonnes métier de la ligne d'alerte analysée
 * et la simulation d'extraction IA (remplacée plus tard par le vrai
 * connecteur, sans toucher l'UI).
 *
 * Portabilité Dataverse / Power Pages :
 * - Table VeilleAlerte (12 champs) : alerte maîtresse.
 * - Table VeilleFiche (5 champs) : déclinaison par département.
 * - Table VeilleAction (4 champs) : plan d'amélioration.
 * Total = 21 colonnes éditables dans l'écran d'analyse.
 *
 * Industrialisation : à terme, les PDF ne seront plus déposés à la main.
 * Un flux Microsoft Power Automate capturera les pièces depuis Outlook
 * et injectera le fichier en arrière-plan via la Server Action
 * `analyserDocumentAlerte(file)` (voir actions.ts). Cette couche domaine
 * reste inchangée : seul le connecteur d'alimentation change.
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
  // ——— VeilleFiche : 5 champs ———
  /** 13 — Département d'acteurs responsable (assignation) */
  departementResponsable: DepartementCode;
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

/** Métadonnées minimales du document injecté (manuel aujourd'hui, Power Automate demain). */
export interface DocumentSource {
  fileName: string;
  fileType: string;
  fileSize: number;
}

/** Options d'assignation dans le menu déroulant (DJ, DRH, DAF, DQHSE, Patr Immo, DILS…). */
export const DEPARTEMENT_OPTIONS: { code: DepartementCode; label: string }[] = (
  Object.keys(DEPARTEMENTS) as DepartementCode[]
)
  .filter((code) => code !== "CENTRAL_VRG")
  .map((code) => ({ code, label: DEPARTEMENTS[code] }));

/** Texte brut simulé — exemple Journal Officiel de Côte d'Ivoire du 9 juillet 2026. */
export const EXTRACTION_SIMULEE = [
  "JOURNAL OFFICIEL DE LA RÉPUBLIQUE DE CÔTE D'IVOIRE — N° 54 du 9 juillet 2026.",
  "DÉCRET n° 2026-412 du 9 juillet 2026 portant modalités d'entreposage sous douane",
  "et de traitement des marchandises dangereuses dans les plateformes logistiques.",
  "Article 3 : tout exploitant d'entrepôt sous douane tient une comptabilité matières",
  "et transmet mensuellement l'inventaire à la Direction Générale des Douanes.",
  "Article 7 : les installations stockant des matières dangereuses disposent d'une",
  "étude de dangers actualisée et d'un plan d'intervention validé par le CIAPOL.",
  "Entrée en vigueur : 1er septembre 2026. Abroge les dispositions contraires du",
  "décret n° 2024-133 en ce qu'elles concernent les entrepôts sous douane.",
].join("\n");

/**
 * Simulation pure de l'analyse IA (aucune dépendance Next.js / Prisma).
 * Le futur connecteur Microsoft natif retournera exactement le même
 * shape `AlerteAnalyse21` + `texteExtrait`, l'UI n'aura pas à changer.
 */
export function simulerAnalyseAlerte(source: DocumentSource): {
  texteExtrait: string;
  analyse: AlerteAnalyse21;
} {
  const baseName = source.fileName.replace(/\.[^.]+$/, "") || "JO-CI-2026-07-09";
  const ordreSuffix = String(Math.abs(hashCode(baseName)) % 900 + 100);
  return {
    texteExtrait: `—— Document : ${source.fileName} (${formatTaille(source.fileSize)} · ${source.fileType || "document"}) ——\n\n${EXTRACTION_SIMULEE}`,
    analyse: {
      numeroOrdre: `AGL-2026-${ordreSuffix}`,
      qssfte: "QSSTE-DILS-2026-07",
      natureTexte: "Décret",
      referenceTexte: "Décret n°2026-412 du 9 juillet 2026 — entreposage sous douane et marchandises dangereuses",
      article: "Art. 3 (comptabilité matières) ; Art. 7 (étude de dangers CIAPOL)",
      resumeTexte:
        "Nouvelles obligations douanes et DQHSE pour les entrepôts AGL : comptabilité matières mensuelle transmise à la DGD, inventaire contradictoire, étude de dangers actualisée et plan d'intervention CIAPOL pour les matières dangereuses.",
      libelleApplicable:
        "Tout exploitant d'entrepôt sous douane tient une comptabilité matières et transmet l'inventaire mensuel ; les stockages de matières dangereuses disposent d'une étude de dangers et d'un plan d'intervention validés.",
      lienHypertexte: "https://journalofficiel.gouv.ci/decret-2026-412",
      dateEntreeVigueur: "2026-09-01",
      contenu: EXTRACTION_SIMULEE,
      moyenCommunication: "Journal Officiel — capté via Outlook / Power Automate",
      applicableAGLCI: true,
      departementResponsable: "DILS",
      actionsExistantes: "Agrément MEA en cours ; inventaires mensuels partiels.",
      preuvesExistantes: "Registre d'entrepôt T2-2026 ; bordereaux de suivi existants.",
      statutConformite: "PARTIELLEMENT_50",
      preuveDifferee: "Étude de dangers actualisée + récépissé DGD (à verser sous 60 jours).",
      libelleAction: "Mettre à niveau la comptabilité matières et renouveler l'étude de dangers CIAPOL.",
      responsable: "Y. Ouattara (DILS)",
      delai: "2026-10-31",
      tauxAvancement: 20,
    },
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

function formatTaille(bytes: number): string {
  if (!bytes || bytes <= 0) return "taille inconnue";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}
