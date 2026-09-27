import { NextResponse } from "next/server";

/**
 * AGL JuriCompliance — Sauvegarde finale des fiches validées (bouton vert).
 *
 * POST /api/sauvegarde ← 21 colonnes du formulaire → Prisma :
 * - `{ actes: [...] }` (multi-actes IA) → N `VeilleAlerte` (une par acte,
 *   `<racine>-01`, `-02`, …) via `creerFichesVeilleMulti` (actes sans BU
 *   ignorés avec leur motif, sans échec global).
 * - objet unique (saisie manuelle) → `creerFicheVeille` (compatibilité).
 * Le client redirige ensuite vers `/dashboard`.
 */

import { creerFicheVeille, creerFichesVeilleMulti } from "@/lib/veille-save";
import { fusionnerAuteur, lireAuteur, lireAuteurDepuisCorps } from "@/lib/acces";
import { estCentrale } from "@/domain/acces";

export async function POST(req: Request) {
  try {
    const corps = await req.json();
    const auteur = fusionnerAuteur(lireAuteur(req), lireAuteurDepuisCorps(corps));
    if (!auteur.bu || !estCentrale(auteur.bu)) {
      return NextResponse.json(
        { error: "Création / assignation : réservée à la centrale (CENTRAL_VRG)." },
        { status: 403 },
      );
    }
    if (Array.isArray(corps.actes)) {
      const resultat = await creerFichesVeilleMulti(corps.actes, auteur);
      return NextResponse.json({ success: true, data: resultat }, { status: 201 });
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
