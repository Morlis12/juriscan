import { NextResponse } from "next/server";

/**
 * JuriScan AI — Route API REST d'analyse OCR (remplace la Server Action).
 *
 * Pourquoi REST : la Server Action faisait transiter un payload binaire
 * via les Server Components (crash Vercel 500 en ~43ms, error #441).
 * Ici, contrat HTTP standard 100 % robuste et connecteurs Microsoft-ready :
 * - Entrée : POST JSON `{ base64Data, mimeType, fileName? }` (texte uniquement).
 * - Sortie : `{ success: true, data, source }` ou `{ error }` (400/500).
 *
 * Note SDK : la consigne citait `GoogleGenAI` depuis `@google/generative-ai`
 * avec `ai.models.generateContent` + `response.text`. Or le module installé
 * (`@google/generative-ai`) exporte `GoogleGenerativeAI` +
 * `getGenerativeModel(...).generateContent(...)` + `response.response.text()`
 * (vérifié dans node_modules). Implémentation ci-dessous = API RÉELLE du
 * module installé, même modèle `gemini-1.5-flash`, même prompt JO, même
 * JSON strict à 5 champs. Import statique évité : chargement dynamique
 * serveur uniquement, jamais dans le bundle client.
 */

import type { GenerativeModel } from "@google/generative-ai";

interface AnalyseBody {
  base64Data?: string;
  mimeType?: string;
  fileName?: string;
}

const MIME_AUTORISES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

const PROMPT =
  "Analyse ce texte de loi d'Afrique de l'Ouest (Journal Officiel) et extrais les métadonnées sous ce format JSON strict : { \"numeroOrdre\": \"AGL-2026-056\", \"natureTexte\": \"Décret\", \"referenceTexte\": \"...\", \"resumeTexte\": \"...\", \"libelleApplicable\": \"...\" }. Réponds UNIQUEMENT avec le JSON.";

const REPLI_JO_9_JUILLET_2026 = {
  numeroOrdre: "AGL-2026-056",
  natureTexte: "Décret",
  referenceTexte: "Décret n°2026-367",
  libelleApplicable:
    "Décret portant naturalisation de M. Hervé Patrice BERNADIN",
  resumeTexte:
    "Naturalisation ivoirienne accordée à M. Hervé Patrice BERNADIN, né le 17 octobre 1968 à Saint-Jean-d'Angély en France, fils de Guy Georges Jean Mary BERNADIN et de Mauricette Michelle MOREAU, résidant à Abidjan.",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyseBody;
    const { base64Data, mimeType, fileName } = body;

    if (!base64Data) {
      return NextResponse.json({ error: "Aucune donnée reçue" }, { status: 400 });
    }
    if (mimeType && !MIME_AUTORISES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Format non pris en charge : PDF ou image (PNG, JPG, WEBP)." },
        { status: 400 },
      );
    }
    if (base64Data.length > 20_000_000) {
      return NextResponse.json(
        { error: "Document trop volumineux pour l'analyse en ligne." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // MODE SÉCURISÉ / REPLI : clé absente → JSON JO CI du 9 juillet 2026, sans planter.
    if (!apiKey) {
      return NextResponse.json({
        success: true,
        data: REPLI_JO_9_JUILLET_2026,
        source: "simulation",
      });
    }

    // TRAITEMENT AVEC L'API RÉELLE SI CLÉ PRÉSENTE (chargement serveur uniquement).
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const ai = new GoogleGenerativeAI(apiKey);
    const model: GenerativeModel = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const response = await model.generateContent([
      { text: `${PROMPT}\nDocument : ${fileName ?? "document"}` },
      {
        inlineData: { data: base64Data, mimeType: mimeType ?? "application/pdf" },
      },
    ]);

    const jsonText = response.response.text().replace(/```json|```/g, "").trim();
    return NextResponse.json({
      success: true,
      data: JSON.parse(jsonText),
      source: "gemini",
    });
  } catch (error: unknown) {
    console.error("Erreur serveur API Analyse :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
