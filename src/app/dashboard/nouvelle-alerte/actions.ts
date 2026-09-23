"use server";

/**
 * JuriScan AI — Server Action autonome d'analyse documentaire.
 *
 * Contrat isolé (UI ↔ logique) :
 * - Entrée : un `File` (PDF ou image brute), déposé à la main aujourd'hui.
 * - Sortie : `{ texteExtrait, analyse }` avec les 21 colonnes métier.
 *
 * Industrialisation Power Automate :
 * - À terme, un flux Microsoft Power Automate capturera les PDF depuis
 *   Outlook et appellera CETTE fonction en arrière-plan (même signature),
 *   avant de la remplacer par un connecteur natif Microsoft.
 * - L'interface visuelle (`page.tsx`) ne doit jamais contenir de logique
 *   d'analyse : elle ne fait qu'appeler `analyserDocumentAlerte(file)`.
 */

import {
  simulerAnalyseAlerte,
  type AlerteAnalyse21,
} from "@/domain/nouvelle-alerte";

export interface AnalyseAlerteResult {
  fileName: string;
  fileType: string;
  fileSize: number;
  texteExtrait: string;
  analyse: AlerteAnalyse21;
}

export async function analyserDocumentAlerte(
  file: File,
): Promise<AnalyseAlerteResult> {
  if (!file || typeof file.name !== "string" || file.size <= 0) {
    throw new Error("Aucun document valide reçu pour l'analyse.");
  }

  const autorises = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  const extensionOk = /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
  if (!autorises.includes(file.type) && !extensionOk) {
    throw new Error("Format non pris en charge : déposez un PDF ou une image (PNG, JPG, WEBP).");
  }

  // Simulation IA — point de remplacement unique pour le connecteur Microsoft.
  const { texteExtrait, analyse } = simulerAnalyseAlerte({
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  return {
    fileName: file.name,
    fileType: file.type || "document",
    fileSize: file.size,
    texteExtrait,
    analyse,
  };
}
