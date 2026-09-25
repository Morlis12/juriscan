import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

/**
 * JuriScan AI — OCR + recommandation BU (Gemini 3.6 Flash).
 *
 * Workflow à double validation JuriScan × JuriDesk :
 * - L'IA fait l'OCR, extrait les champs (21 colonnes) et propose la BU
 *   la plus probable (`propositionBU` parmi DJ, DRH, DAF, DQHSE, PATR_IMMO, DILS).
 * - La fiche est créée en `ATTENTE_VALIDATION_JURIDIQUE` : le juridique
 *   valide puis bascule vers `ATTENTE_APPROBATION_METIER` (voir /api/veille).
 */

const BU_AUTORISEES = ["DJ", "DRH", "DAF", "DQHSE", "PATR_IMMO", "DILS"] as const;

function normaliserBU(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  return (BU_AUTORISEES as readonly string[]).includes(code) ? code : null;
}

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
      model: google('gemini-3.6-flash'),
      system: "Tu es l'expert en OCR d'Africa Global Logistics (AGL CI). Analyse le document reçu (décret, arrêté, loi, circulaire, Journal Officiel) et extrais fidèlement ses informations réelles sans rien inventer. Tu participes au workflow à double validation JuriScan × JuriDesk : après l'OCR, tu recommandes la Business Unit la plus probable pour traiter le texte.",
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Analyse le document joint et extrais ses métadonnées sous ce format JSON brut strict (sans bloc markdown autour, sans écrire ```json) : { \"numeroOrdre\": \"AGL-2026-056\", \"qssfte\": \"\", \"natureTexte\": \"Décret | Arrêté | Loi | Ordonnance | Circulaire | Décision | Type de document\", \"referenceTexte\": \"Référence officielle ou Titre principal\", \"article\": \"\", \"resumeTexte\": \"Résumé précis du contenu réel du fichier\", \"libelleApplicable\": \"Libellé complet de la version en vigueur\", \"moyenCommunication\": \"\", \"dateEntreeVigueur\": \"YYYY-MM-DD ou chaîne vide\", \"propositionBU\": \"DJ | DRH | DAF | DQHSE | PATR_IMMO | DILS — la BU la plus probable au vu du contenu (ex : droit du travail → DRH, fiscalité → DAF, environnement/sécurité → DQHSE, foncier/immobilier → PATR_IMMO, douane/logistique → DILS, contrats/contentieux/données → DJ)\", \"departement\": \"(miroir de propositionBU, même valeur)\", \"statutConformite\": \"NON_CONFORME_0\", \"actionsAmelioration\": \"Première action de mise en conformité suggérée ou chaîne vide\" }"
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

    const brut = JSON.parse(cleanedText) as Record<string, unknown>;
    // Normalise la recommandation BU : valeur stricte ou null (le juridique tranche).
    const propositionBU =
      normaliserBU(brut.propositionBU) ?? normaliserBU(brut.departement);
    const donnees = {
      ...brut,
      propositionBU,
      // Compatibilité avec l'écran nouvelle-alerte (lit `departement`) : miroir validé.
      departement: propositionBU ?? (typeof brut.departement === "string" ? brut.departement : ""),
    };

    return NextResponse.json({ success: true, data: donnees, source: "gemini" });

  } catch (error: unknown) {
    console.error("Erreur critique OCR Vercel AI SDK :", error);
    const message = error instanceof Error ? error.message : "Erreur interne de traitement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
