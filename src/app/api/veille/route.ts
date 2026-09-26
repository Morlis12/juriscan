import { NextResponse } from "next/server";

/**
 * JuriScan AI — API Grille de Veille (persistante, Prisma + PostgreSQL).
 *
 * - POST /api/veille : enregistre la fiche validée (moteur partagé
 *   `src/lib/veille-save.ts`, aussi exposé via POST /api/sauvegarde).
 * - GET /api/veille : liste les alertes + fiches pour le tableau de bord
 *   (fusionnées aux mocks côté client, repli silencieux si DB absente).
 */

import { prisma } from "@/lib/prisma";
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
    console.error("Erreur serveur API Veille :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    const status =
      (error as NodeJS.ErrnoException).code === "VALIDATION_400" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  try {
    const alertes = await prisma.veilleAlerte.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        fichesDepartements: {
          include: {
            actionsAmelioration: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { responsable: { select: { email: true } } },
            },
          },
        },
      },
    });
    return NextResponse.json({ success: true, data: alertes });
  } catch (error) {
    console.error("Erreur serveur API Veille (GET) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
