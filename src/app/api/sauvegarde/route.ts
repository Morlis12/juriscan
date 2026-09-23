import { NextResponse } from "next/server";

/**
 * JuriScan AI — Sauvegarde finale de la fiche validée (bouton vert).
 *
 * POST /api/sauvegarde ← 21 colonnes du formulaire → Prisma
 * (`prisma.veilleAlerte.create` + fiche département). Le client redirige
 * ensuite vers `/dashboard` (onglet de la direction, graphiques à jour).
 */

import { creerFicheVeille } from "@/lib/veille-save";

export async function POST(req: Request) {
  try {
    const alerte = await creerFicheVeille(await req.json());
    return NextResponse.json({ success: true, data: alerte }, { status: 201 });
  } catch (error) {
    console.error("Erreur serveur API Sauvegarde :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    const status =
      (error as NodeJS.ErrnoException).code === "VALIDATION_400" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
