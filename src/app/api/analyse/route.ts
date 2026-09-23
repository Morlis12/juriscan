import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { base64Data, mimeType } = body;

    if (!base64Data) {
      return NextResponse.json({ error: "Aucune donnée de fichier reçue" }, { status: 400 });
    }

    // Lecture de la clé d'environnement active sur Vercel
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Configuration : Clé API manquante sur le serveur." }, { status: 500 });
    }

    // APPEL OCR ET MULTIMODAL ULTRA-STABLE VIA LE SDK VERCEL AI
    const response = await generateText({
      model: google('gemini-1.5-flash'),
      system: "Tu es l'expert en OCR d'Africa Global Logistics (AGL CI). Analyse le document reçu (CV, décret, ou alerte) et extrais fidèlement ses informations réelles sans rien inventer.",
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Analyse le document joint et extrais ses métadonnées sous ce format JSON brut strict (sans bloc markdown autour, sans écrire ```json) : { \"numeroOrdre\": \"AGL-2026-056\", \"natureTexte\": \"Décret ou Type de document\", \"referenceTexte\": \"Référence officielle ou Titre principal\", \"resumeTexte\": \"Résumé précis du contenu réel du fichier\", \"libelleApplicable\": \"Libellé complet de la version en vigueur\" }"
            },
            {
              type: 'image',
              image: base64Data,
              mimeType: mimeType
            }
          ]
        }
      ]
    });

    // Nettoyage de la chaîne de caractères si l'IA a malgré tout ajouté des balises markdown
    let cleanedText = response.text.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/```json|```/g, "").trim();
    }

    return NextResponse.json({ success: true, data: JSON.parse(cleanedText) });

  } catch (error: unknown) {
    console.error("Erreur critique OCR Vercel AI SDK :", error);
    const message = error instanceof Error ? error.message : "Erreur interne de traitement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
