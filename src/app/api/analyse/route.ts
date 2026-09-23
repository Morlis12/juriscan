import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * JuriScan AI — Analyse OCR réelle (Google Gemini, 100 % des cas).
 *
 * - AUCUN mock : la route appelle toujours `gemini-1.5-flash` en multimodal
 *   (document joint en `inlineData`). Sans clé API → 500 explicite.
 * - Prompt : lire EXCLUSIVEMENT la pièce jointe (alerte, décret, CV…).
 *   Si ce n'est pas un texte de loi → `natureTexte: "Autre Document"` et
 *   résumé fidèle du contenu réel (ex. « Analyse d'un Curriculum Vitae… »).
 * - Erreurs Google (quota, format…) : transmises telles quelles en 500 avec
 *   le message textuel d'origine pour un vrai diagnostic.
 */

const PROMPT =
  "Tu es l'expert en OCR juridique d'Africa Global Logistics (AGL CI). " +
  "Lis EXCLUSIVEMENT le document reçu en pièce jointe (texte de loi, décret, " +
  "Journal Officiel, ou tout autre document tel qu'un Curriculum Vitae) et extrais " +
  "son contenu RÉEL sous ce format JSON strict, sans bloc markdown autour : " +
  '{ "numeroOrdre": "AGL-2026-XXX (identifiant unique généré)", ' +
  '"qssfte": "...", "natureTexte": "Décret, Arrêté, Loi, etc.", ' +
  '"referenceTexte": "la référence officielle exacte du document", ' +
  '"article": "articles concernés ou vide", ' +
  '"resumeTexte": "résumé métier concis de l\'impact pour l\'entreprise", ' +
  '"libelleApplicable": "libellé complet du texte applicable en vigueur", ' +
  '"moyenCommunication": "origine du document", ' +
  '"statutConformite": "NON_CONFORME_0 par défaut", ' +
  '"actionsAmelioration": "actions suggérées ou vide", ' +
  '"departement": "DJ, DAF, DRH, PATR_IMMO, DQHSE, DIR_COMM_MARK ou DILS le plus pertinent" }. ' +
  "RÈGLE : si le document N'EST PAS un texte de loi, remplis natureTexte avec " +
  '"Autre Document" et résume fidèlement le contenu réel ' +
  '(ex : \'Analyse d\'un Curriculum Vitae...\'). Réponds UNIQUEMENT avec le JSON.';

const MIME_AUTORISES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      base64Data?: string;
      mimeType?: string;
      fileName?: string;
    };
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
    if (!apiKey) {
      return NextResponse.json(
        { error: "Clé GOOGLE_GENERATIVE_AI_API_KEY absente de l'environnement." },
        { status: 500 },
      );
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const response = await model.generateContent([
      { text: `${PROMPT}\nDocument : ${fileName ?? "document"}` },
      { inlineData: { data: base64Data, mimeType: mimeType ?? "application/pdf" } },
    ]);

    const brut = response.response.text().replace(/```json|```/g, "").trim();
    const debut = brut.indexOf("{");
    const fin = brut.lastIndexOf("}");
    if (debut === -1 || fin === -1 || fin <= debut) {
      return NextResponse.json(
        { error: `Réponse Gemini non-JSON : ${brut.slice(0, 300)}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: JSON.parse(brut.slice(debut, fin + 1)),
      source: "gemini",
    });
  } catch (error) {
    // Erreur Google réelle (quota, format, réseau…) : diagnostic transparent.
    console.error("Erreur serveur API Analyse :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
