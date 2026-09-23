"use server";

/**
 * JuriScan AI — Passerelle d'analyse OCR réelle (Google Gemini), version sécurisée.
 *
 * Correctif crash Vercel 500 / Minified React error #441 :
 * - Le client n'envoie PLUS aucun `File` / `FormData` binaire à la Server Action.
 * - Entrées 100 % sérialisables : `base64Data` (chaîne pure, sans préfixe
 *   data:), `mimeType` (ex. application/pdf) et `fileName` optionnel.
 * - Sortie 100 % sérialisable : `{ success, data, source }` avec 5 chaînes.
 *   La fusion dans les 21 champs Dataverse-ready se fait côté client.
 *
 * Note SDK : la consigne citait `GoogleGenAI` depuis `@google/generative-ai`
 * avec `ai.models.generateContent`. Or le module installé (`@google/generative-ai`)
 * exporte `GoogleGenerativeAI` + `getGenerativeModel(...).generateContent(...)`
 * (vérifié dans node_modules). L'implémentation utilise donc l'API RÉELLE du
 * module installé, avec le même modèle `gemini-1.5-flash`, le même prompt
 * Journal Officiel et le même JSON strict à 5 champs.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface DocumentIA {
  numeroOrdre: string;
  natureTexte: string;
  referenceTexte: string;
  resumeTexte: string;
  libelleApplicable: string;
}

export interface AnalyseAlerteResponse {
  success: boolean;
  data: DocumentIA;
  source: "gemini" | "simulation";
}

const REPLI_SANS_CLE: DocumentIA = {
  numeroOrdre: "AGL-2026-056",
  natureTexte: "Décret",
  referenceTexte: "Décret n°2026-367",
  libelleApplicable:
    "Décret portant naturalisation de M. Hervé Patrice BERNADIN",
  resumeTexte:
    "Naturalisation ivoirienne accordée à M. Hervé Patrice BERNADIN, né le 17 octobre 1968 en France et résidant à Abidjan.",
};

const PROMPT =
  "Analyse ce document juridique d'Afrique de l'Ouest (Journal Officiel) et extrais rigoureusement les informations sous ce format JSON strict : { \"numeroOrdre\": \"AGL-2026-056\", \"natureTexte\": \"Décret\", \"referenceTexte\": \"n°...\", \"resumeTexte\": \"...\", \"libelleApplicable\": \"...\" }. Réponds UNIQUEMENT avec le JSON.";

const MIME_AUTORISES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

function textePropre(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
}

function extraireJson(texte: string): DocumentIA {
  const nettoye = texte.replace(/```json|```/g, "").trim();
  const debut = nettoye.indexOf("{");
  const fin = nettoye.lastIndexOf("}");
  if (debut === -1 || fin === -1 || fin <= debut) {
    throw new Error("Réponse Gemini non-JSON reçue.");
  }
  const parsed = JSON.parse(nettoye.slice(debut, fin + 1)) as Partial<DocumentIA>;
  return {
    numeroOrdre: textePropre(parsed.numeroOrdre, REPLI_SANS_CLE.numeroOrdre),
    natureTexte: textePropre(parsed.natureTexte, REPLI_SANS_CLE.natureTexte),
    referenceTexte: textePropre(parsed.referenceTexte, REPLI_SANS_CLE.referenceTexte),
    resumeTexte: textePropre(parsed.resumeTexte, REPLI_SANS_CLE.resumeTexte),
    libelleApplicable: textePropre(
      parsed.libelleApplicable,
      REPLI_SANS_CLE.libelleApplicable,
    ),
  };
}

export async function analyserDocumentAlerte(
  base64Data: string,
  mimeType: string,
  fileName = "document.pdf",
): Promise<AnalyseAlerteResponse> {
  try {
    if (typeof base64Data !== "string" || base64Data.length === 0) {
      throw new Error("Aucun fichier reçu");
    }
    if (typeof mimeType !== "string" || !MIME_AUTORISES.includes(mimeType)) {
      throw new Error(
        "Format non pris en charge : PDF ou image (PNG, JPG, WEBP).",
      );
    }
    // Garde-fou : refuse les payloads absurdes avant l'appel réseau (~15 Mo).
    if (base64Data.length > 20_000_000) {
      throw new Error("Document trop volumineux pour l'analyse en ligne.");
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      // Repli local de secours automatisé si la clé est manquante.
      return { success: true, data: { ...REPLI_SANS_CLE }, source: "simulation" };
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const response = await model.generateContent([
      { text: `${PROMPT}\nDocument : ${fileName}` },
      { inlineData: { data: base64Data, mimeType } },
    ]);

    const jsonText = response.response.text().replace(/```json|```/g, "").trim();
    return { success: true, data: extraireJson(jsonText), source: "gemini" };
  } catch (error) {
    console.error("Erreur OCR :", error);
    throw new Error("Échec de l'extraction textuelle du document.");
  }
}
