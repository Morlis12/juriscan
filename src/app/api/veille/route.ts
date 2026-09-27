import { NextResponse } from "next/server";

/**
 * AGL JuriCompliance — API Grille de Veille (persistante, Prisma + PostgreSQL).
 *
 * - POST /api/veille : enregistre la fiche validée (moteur partagé
 *   `src/lib/veille-save.ts`, aussi exposé via POST /api/sauvegarde).
 * - GET /api/veille : liste les alertes + fiches pour le tableau de bord
 *   (fusionnées aux mocks côté client, repli silencieux si DB absente).
 *   Chaque fiche porte `createdAt` (= date d'assignation), `updatedAt`
 *   (= dernière modification = état affiché) et `jalons` (validation,
 *   renvoi, rejet, approbation — dernières entrées `VeilleJournal`).
 */

import { prisma } from "@/lib/prisma";
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
    // Jalons workflow par fiche : dernières dates de validation / renvoi /
    // rejet / approbation lues dans le journal SCD2 (une seule requête).
    const ficheIds = alertes.flatMap((a) => a.fichesDepartements.map((f) => f.id));
    const journaux =
      ficheIds.length > 0
        ? await prisma.veilleJournal.findMany({
            where: {
              ficheId: { in: ficheIds },
              action: { in: ["VALIDATION_JURIDIQUE", "RENVOI_BU", "REJET_BU", "APPROBATION_BU"] },
            },
            orderBy: { createdAt: "desc" },
            take: Math.min(4000, ficheIds.length * 8),
            select: { ficheId: true, action: true, createdAt: true },
          })
        : [];
    const jalonsParFiche = new Map<
      string,
      { valideeLe: string | null; renvoyeeLe: string | null; rejeteeLe: string | null; approuveeLe: string | null }
    >();
    for (const j of journaux) {
      if (!j.ficheId) continue;
      let e = jalonsParFiche.get(j.ficheId);
      if (!e) {
        e = { valideeLe: null, renvoyeeLe: null, rejeteeLe: null, approuveeLe: null };
        jalonsParFiche.set(j.ficheId, e);
      }
      const iso = j.createdAt.toISOString();
      if (j.action === "VALIDATION_JURIDIQUE" && !e.valideeLe) e.valideeLe = iso;
      else if (j.action === "RENVOI_BU" && !e.renvoyeeLe) e.renvoyeeLe = iso;
      else if (j.action === "REJET_BU" && !e.rejeteeLe) e.rejeteeLe = iso;
      else if (j.action === "APPROBATION_BU" && !e.approuveeLe) e.approuveeLe = iso;
    }
    const vide = { valideeLe: null, renvoyeeLe: null, rejeteeLe: null, approuveeLe: null };
    const data = alertes.map((a) => ({
      ...a,
      fichesDepartements: a.fichesDepartements.map((f) => ({
        ...f,
        jalons: jalonsParFiche.get(f.id) ?? { ...vide },
      })),
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Erreur serveur API Veille (GET) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
