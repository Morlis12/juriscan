"use server";

/**
 * JuriScan AI — Ancien point d'entrée DÉPRÉCIÉ (cause du crash Vercel 500).
 *
 * L'historique `analyserDocumentAlerte(file: File)` / `FormData` faisait
 * transiter un objet binaire non sérialisable entre Client et Server Action
 * (Minified React error #441). Ne plus l'utiliser : la page appelle
 * désormais la passerelle sécurisée
 * `src/app/actions/veilleActions.ts` ::
 * `analyserDocumentAlerte(base64Data, mimeType, fileName)` (chaînes uniquement).
 *
 * Ce fichier ne conserve qu'un alias de type pour l'historique Git.
 * Tout nouvel appel doit importer `@/app/actions/veilleActions`.
 */

import type { AnalyseAlerteResponse } from "@/app/actions/veilleActions";

export type AnalyseAlerteResult = AnalyseAlerteResponse;
