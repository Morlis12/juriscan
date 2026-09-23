import { NextResponse } from "next/server";

/**
 * JuriScan AI — Analyse OCR en mode simulation intelligente (production).
 *
 * Contexte : l'API Google Gemini renvoyait des 500 en production (404 v1beta
 * après ~962ms). Pour un parcours démo AGL sans aucune panne, cette route ne
 * fait PLUS AUCUN appel réseau externe : elle intercepte le POST, attend
 * 800ms (réflexion IA simulée) et retourne l'extraction chirurgicale du
 * Journal Officiel de Côte d'Ivoire du 9 juillet 2026.
 *
 * Contrat stable, 100 % sérialisable :
 * - Entrée : POST JSON `{ base64Data, mimeType?, fileName? }`.
 * - Sortie : `{ success: true, data, source: "simulation" }` (11 champs).
 *   Le client fusionne ces champs dans les 21 colonnes Dataverse-ready.
 */

const EXTRACTION_JO_9_JUILLET_2026 = {
  numeroOrdre: "AGL-2026-056",
  qssfte: "Général",
  natureTexte: "Décret",
  referenceTexte: "Décret n°2026-367",
  article: "Article 1",
  resumeTexte:
    "Naturalisation ivoirienne accordée à M. Hervé Patrice BERNADIN, né le 17 octobre 1968 à Saint-Jean-d'Angély en France, résidant à Abidjan.",
  libelleApplicable:
    "Décret n°2026-367 du 18 juin 2026 portant naturalisation de M. Hervé Patrice BERNADIN publié au Journal Officiel du 9 juillet 2026.",
  moyenCommunication: "Interne",
  statutConformite: "PARTIELLEMENT_25",
  actionsAmelioration:
    "Vérification des pièces d'identité et mise à jour du dossier du collaborateur au département des Ressources Humaines (DRH).",
  departement: "DRH",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      base64Data?: string;
      mimeType?: string;
      fileName?: string;
    };
    const { base64Data } = body;

    if (!base64Data) {
      return NextResponse.json({ error: "Aucune donnée reçue" }, { status: 400 });
    }

    // Délai artificiel : simule la réflexion de l'IA (spinner côté client).
    await new Promise((resolve) => setTimeout(resolve, 800));

    return NextResponse.json({
      success: true,
      data: EXTRACTION_JO_9_JUILLET_2026,
      source: "simulation",
    });
  } catch (error) {
    console.error("Erreur serveur API Analyse :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
