import { NextResponse } from "next/server";

/**
 * JuriScan AI — Sauvegarde finale de la fiche validée (bouton vert).
 *
 * POST /api/sauvegarde ← 21 colonnes du formulaire → Prisma
 * (`prisma.veilleAlerte.create` + fiche département). Le client redirige
 * ensuite vers `/dashboard` (onglet de la direction, graphiques à jour).
 */

import { creerFicheVeille } from "@/lib/veille-save";
import { fusionnerAuteur, lireAuteur, lireAuteurDepuisCorps } from "@/lib/acces";
import { estJuridique } from "@/domain/acces";

export async function POST(req: Request) {
  try {
    const corps = await req.json();
    const auteur = fusionnerAuteur(lireAuteur(req), lireAuteurDepuisCorps(corps));
    if (!auteur.bu || !estJuridique(auteur.bu)) {
      return NextResponse.json(
        { error: "Création / assignation : réservée au juridique (CENTRAL_VRG, DJ)." },
        { status: 403 },
      );
    }
    const alerte = await creerFicheVeille(corps, auteur);
    return NextResponse.json({ success: true, data: alerte }, { status: 201 });
  } catch (error) {
    console.error("Erreur serveur API Sauvegarde :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    const status =
      (error as NodeJS.ErrnoException).code === "VALIDATION_400" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
