import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

/**
 * JuriScan AI — OCR + recommandation BU (IA).
 *
 * Workflow à double validation JuriScan × JuriDesk :
 * - L'IA fait l'OCR, extrait les champs (21 colonnes) et propose la BU
 *   la plus probable (`propositionBU` parmi DJ, DRH, DAF, DQHSE, PATR_IMMO, DILS).
 * - Fidélité absolue exigée : références et articles copiés mot à mot (jamais
 *   tronqués), `contenu` = transcription brute complète (jamais un résumé),
 *   rien d'inventé (absent = chaîne vide). Voir PROMPT_PRECISION ci-dessous.
 * - La fiche est créée en `ATTENTE_VALIDATION_JURIDIQUE` : le juridique
 *   valide puis bascule vers `ATTENTE_APPROBATION_METIER` (voir /api/veille).
 */

const BU_AUTORISEES = ["DJ", "DRH", "DAF", "DQHSE", "PATR_IMMO", "DILS"] as const;

function normaliserBU(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  return (BU_AUTORISEES as readonly string[]).includes(code) ? code : null;
}

/**
 * Ramène la nature déduite par l'IA vers la liste fermée (insensible aux
 * accents/casse). Le libellé brut est conservé si vraiment inconnu — le
 * juridique tranche via la liste déroulante (jamais de « Type de document »).
 */
function normaliserNature(v: unknown): string {
  if (typeof v !== "string") return "";
  const brut = v.trim();
  if (!brut) return "";
  const cle = brut
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // Le plus spécifique d'abord : un décret d'application peut citer « la loi ».
  const table: [string, string][] = [
    ["Décret", "decret"],
    ["Arrêté", "arrete"],
    ["Ordonnance", "ordonnance"],
    ["Circulaire", "circulaire"],
    ["Décision", "decision"],
    ["Loi", "loi"],
    ["Autre", "autre"],
  ];
  for (const [canon, mot] of table) {
    if (cle.includes(mot)) return canon;
  }
  return brut;
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
    // (température basse + grand budget de sortie = transcription fidèle et complète)
    const response = await generateText({
      model: google('gemini-3.6-flash'),
      temperature: 0.1,
      maxTokens: 16000,
      system: "Tu es l'expert en OCR et en droit ivoirien d'Africa Global Logistics (AGL CI). Analyse le document reçu (Journal Officiel, décret, arrêté, loi, circulaire) et extrais fidèlement ses informations réelles sans rien inventer. FIDÉLITÉ ABSOLUE : tu copies mot à mot les références officielles, les numéros d'articles et le contenu brut — tu ne tronques jamais, tu ne reformules jamais ces champs. Tu dois systématiquement DÉDUIRE la nature juridique du texte d'après son intitulé et son contenu. Tu participes au workflow à double validation JuriScan × JuriDesk : après l'OCR, tu recommandes la Business Unit la plus probable pour traiter le texte.",
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Analyse le document joint et extrais ses métadonnées sous ce format JSON brut strict (sans bloc markdown autour, sans écrire ```json) : { \"numeroOrdre\": \"N° d'ordre unique au format AGL-2026-NNN — propose un numéro (ne recopie jamais un exemple, ne mets jamais deux fois le même)\", \"qssfte\": \"\", \"natureTexte\": \"UNE SEULE valeur exacte parmi : Loi | Ordonnance | Décret | Arrêté | Circulaire | Décision | Autre — déduis-la ainsi : Loi si texte voté commençant par 'Loi n°' ; Ordonnance si 'Ordonnance n°' ; Décret si signé en Conseil des ministres commençant par 'Décret n°' ; Arrêté si ministériel ou interministériel commençant par 'Arrêté' ; Circulaire si note d'instruction ou d'information ; Décision si acte individuel ; Autre seulement si vraiment indéterminé (jamais 'Type de document')\", \"referenceTexte\": \"Référence officielle COMPLÈTE ou titre principal COMPLET — copie exacte sans tronquer (numéro, date, autorité…)\", \"article\": \"Numéros des articles concernés copiés tels quels (ex : 'Article 2', 'Articles 3 à 5') — OBLIGATOIRE si le document contient des articles, chaîne vide seulement s'il n'y en a vraiment aucun\", \"resumeTexte\": \"Résumé précis et structuré du contenu réel : quels actes, quelles autorités, quelles dates, quels effets\", \"libelleApplicable\": \"Libellé complet de la version en vigueur\", \"contenu\": \"Transcription brute, fidèle et la plus complète possible du texte du document : COPIE EXACTE mot à mot (articles, visas, dispositif) — jamais un résumé, jamais une reformulation, jamais tronqué\", \"moyenCommunication\": \"\", \"dateEntreeVigueur\": \"Date exacte lue dans le document au format YYYY-MM-DD, ou chaîne vide\", \"propositionBU\": \"DJ | DRH | DAF | DQHSE | PATR_IMMO | DILS — la BU la plus probable au vu du contenu (ex : droit du travail → DRH, fiscalité → DAF, environnement/sécurité → DQHSE, foncier/immobilier → PATR_IMMO, douane/logistique → DILS, contrats/contentieux/données → DJ)\", \"departement\": \"(miroir de propositionBU, même valeur)\", \"statutConformite\": \"NON_CONFORME_0\", \"actionsAmelioration\": \"Première action de mise en conformité suggérée ou chaîne vide\" } Règle d'or : si une information est absente du document, chaîne vide — n'invente JAMAIS."
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
      // Nature déduite par l'IA, ramenée à la liste fermée (Loi, Décret…).
      natureTexte: normaliserNature(brut.natureTexte),
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
