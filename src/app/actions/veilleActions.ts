"use server";

/**
 * JuriScan AI — Action serveur d'analyse OCR réelle (Google Gemini).
 *
 * Contrat isolé (UI ↔ logique), Power Automate-ready :
 * - Entrée : `FormData` avec champ `file` (PDF ou image brute).
 *   Aujourd'hui déposé à la main, demain injecté depuis Outlook via Power Automate.
 * - Sortie : `{ fileName, fileType, fileSize, texteExtrait, analyse, source }`
 *   où `analyse` porte les 21 colonnes métier Dataverse-ready.
 *
 * Note d'industrialisation : la consigne d'origine utilisait
 * `GoogleGenAI` + `ai.models.generateContent` (SDK `@google/genai`).
 * Le module officiellement installé ici (`@google/generative-ai@0.24.1`)
 * exporte `GoogleGenerativeAI` + `getGenerativeModel(...).generateContent(...)`.
 * L'implémentation ci-dessous utilise l'API RÉELLE du module installé,
 * avec le même prompt OCR, le même modèle `gemini-1.5-flash` et le même
 * JSON strict à 5 champs, fusionnés ensuite dans les 21 champs.
 * Sans `GOOGLE_GENERATIVE_AI_API_KEY`, repli automatique sur la simulation
 * locale (le build et la démo restent verts).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  simulerAnalyseAlerte,
  type AlerteAnalyse21,
} from "@/domain/nouvelle-alerte";

export interface GeminiChampsIA {
  numeroOrdre?: string;
  natureTexte?: string;
  referenceTexte?: string;
  resumeTexte?: string;
  libelleApplicable?: string;
}

export interface VeilleAnalyseResult {
  fileName: string;
  fileType: string;
  fileSize: number;
  texteExtrait: string;
  analyse: AlerteAnalyse21;
  source: "gemini" | "simulation";
}

const PROMPT_STRUCTURE = `
Tu es l'expert en OCR juridique d'Africa Global Logistics (AGL CI).
Analyse le document joint (Journal Officiel ou décret, PDF ou image scannée) et extrais les informations pour remplir rigoureusement ces champs au format JSON strict (sans markdown, sans commentaire) :
{
  "numeroOrdre": "Génère un identifiant unique (ex: AGL-2026-XXX)",
  "natureTexte": "Décret, Arrêté, Loi, etc.",
  "referenceTexte": "La référence officielle du texte",
  "resumeTexte": "Un résumé métier concis de l'impact pour l'entreprise",
  "libelleApplicable": "Le libellé complet du texte applicable en vigueur"
}
Réponds UNIQUEMENT avec le JSON.
`;

function extraireJson(texte: string): GeminiChampsIA {
  const nettoye = texte
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const debut = nettoye.indexOf("{");
  const fin = nettoye.lastIndexOf("}");
  if (debut === -1 || fin === -1 || fin <= debut) {
    throw new Error("Réponse Gemini non-JSON reçue.");
  }
  return JSON.parse(nettoye.slice(debut, fin + 1)) as GeminiChampsIA;
}

function textePropre(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
}

export async function analyserDocumentAlerte(
  formData: FormData,
): Promise<VeilleAnalyseResult> {
  const file = formData.get("file") as File | null;
  if (!file || typeof file.name !== "string" || file.size <= 0) {
    throw new Error("Aucun fichier reçu");
  }

  const autorises = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  const extensionOk = /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
  if (!autorises.includes(file.type) && !extensionOk) {
    throw new Error(
      "Format non pris en charge : déposez un PDF ou une image (PNG, JPG, WEBP).",
    );
  }

  const meta = {
    fileName: file.name,
    fileType: file.type || "application/pdf",
    fileSize: file.size,
  };

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    // Repli local : démo + build sans clé, même shape à 21 champs.
    const simu = simulerAnalyseAlerte(meta);
    return {
      fileName: meta.fileName,
      fileType: meta.fileType,
      fileSize: meta.fileSize,
      texteExtrait: `—— Mode simulation (GOOGLE_GENERATIVE_AI_API_KEY absente) ——\n\n${simu.texteExtrait}`,
      analyse: simu.analyse,
      source: "simulation",
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const response = await model.generateContent([
      { text: PROMPT_STRUCTURE },
      {
        inlineData: { data: base64Data, mimeType: meta.fileType },
      },
    ]);

    const brut = response.response.text();
    const ia = extraireJson(brut);

    // Socle des 21 champs + écrasement par les 5 champs IA.
    const socle = simulerAnalyseAlerte(meta).analyse;
    const analyse: AlerteAnalyse21 = {
      ...socle,
      numeroOrdre: textePropre(ia.numeroOrdre, socle.numeroOrdre),
      natureTexte: textePropre(ia.natureTexte, socle.natureTexte),
      referenceTexte: textePropre(ia.referenceTexte, socle.referenceTexte),
      resumeTexte: textePropre(ia.resumeTexte, socle.resumeTexte),
      libelleApplicable: textePropre(ia.libelleApplicable, socle.libelleApplicable),
    };

    return {
      fileName: meta.fileName,
      fileType: meta.fileType,
      fileSize: meta.fileSize,
      texteExtrait: [
        `—— OCR Gemini gemini-1.5-flash : ${meta.fileName} ——`,
        "",
        `Référence : ${analyse.referenceTexte}`,
        `Résumé : ${analyse.resumeTexte}`,
        "",
        `Libellé applicable : ${analyse.libelleApplicable}`,
      ].join("\n"),
      analyse,
      source: "gemini",
    };
  } catch (e) {
    // Échec réseau/modèle : repli sur simulation plutôt que page en erreur.
    const simu = simulerAnalyseAlerte(meta);
    const message = e instanceof Error ? e.message : "Échec Gemini inconnu";
    return {
      fileName: meta.fileName,
      fileType: meta.fileType,
      fileSize: meta.fileSize,
      texteExtrait: `—— Gemini indisponible (${message}) — repli simulation ——\n\n${simu.texteExtrait}`,
      analyse: simu.analyse,
      source: "simulation",
    };
  }
}
