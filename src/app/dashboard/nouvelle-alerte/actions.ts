/**
 * JuriScan AI — Ancien point d'entrée Server Action SUPPRIMÉ.
 *
 * Historique : `analyserDocumentAlerte(file: File)` / `FormData` puis
 * `analyserDocumentAlerte(base64, mimeType)` faisaient transiter le document
 * via les Server Components (crash Vercel 500, error #441).
 * Architecture retenue : route REST `POST /api/analyse`
 * (`src/app/api/analyse/route.ts`), appelée en `fetch` JSON depuis la page.
 *
 * Ce fichier fantôme existe uniquement pour tracer la suppression.
 * Ne rien importer d'ici : la page appelle directement `/api/analyse`.
 */

export interface AnalyseAlerteResult {
  success: boolean;
  data: {
    numeroOrdre: string;
    natureTexte: string;
    referenceTexte: string;
    resumeTexte: string;
    libelleApplicable: string;
  };
  source: "gemini" | "simulation";
}
