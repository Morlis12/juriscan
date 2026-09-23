"use server";

/**
 * JuriScan AI — Compatibilité d'appel locale (wrapper fin).
 *
 * Contrat historique : `analyserDocumentAlerte(file: File)`.
 * L'implémentation canonique réelle (Gemini OCR) vit désormais dans
 * `src/app/actions/veilleActions.ts` avec la signature
 * `analyserDocumentAlerte(formData: FormData)` — injectable depuis
 * Power Automate / Outlook. Ce wrapper convertit juste `File` → `FormData`
 * et délègue, pour ne pas casser les appels existants.
 */

import {
  analyserDocumentAlerte as analyserViaFormData,
  type VeilleAnalyseResult,
} from "@/app/actions/veilleActions";

export type AnalyseAlerteResult = VeilleAnalyseResult;

export async function analyserDocumentAlerte(
  file: File,
): Promise<AnalyseAlerteResult> {
  const formData = new FormData();
  formData.append("file", file);
  return analyserViaFormData(formData);
}
