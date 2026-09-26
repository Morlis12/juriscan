import { NextResponse } from "next/server";

/**
 * JuriScan AI — Historique d'une fiche (journal + versions SCD2).
 *
 * GET /api/veille/[id]/historique : id de route `db-<alerteId>-<ficheId>`.
 * Retourne le journal de la fiche (plus récent d'abord) et les snapshots
 * `VeilleFicheVersion` / `VeilleActionVersion` (validFrom → validTo).
 * Lecture ouverte (traçabilité consultable par toutes les BU).
 */

import { prisma } from "@/lib/prisma";
import { parseFicheRouteId } from "@/lib/veille-save";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cible = parseFicheRouteId(id);
  if (!cible) {
    return NextResponse.json(
      { error: "Fiche de démonstration : aucun historique persisté." },
      { status: 404 },
    );
  }
  try {
    const [journaux, versionsFiche, versionsAction] = await Promise.all([
      prisma.veilleJournal.findMany({
        where: { ficheId: cible.ficheId },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          alerte: { select: { numeroOrdre: true } },
          fiche: { select: { departement: true } },
        },
      }),
      prisma.veilleFicheVersion.findMany({
        where: { ficheId: cible.ficheId },
        orderBy: { version: "desc" },
        take: 50,
      }),
      prisma.veilleActionVersion.findMany({
        where: { ficheId: cible.ficheId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        journal: journaux.map((e) => ({
          id: e.id,
          numeroOrdre: e.alerte?.numeroOrdre ?? null,
          ficheDepartement: e.fiche?.departement ?? null,
          entite: e.entite,
          action: e.action,
          buAuteur: e.buAuteur,
          emailAuteur: e.emailAuteur,
          details: e.details,
          champsModifies: (() => {
            try {
              const v = e.champsModifies ? JSON.parse(e.champsModifies) : [];
              return Array.isArray(v) ? v : [];
            } catch {
              return [];
            }
          })(),
          createdAt: e.createdAt.toISOString(),
        })),
        versionsFiche: versionsFiche.map((v) => ({
          ...v,
          validFrom: v.validFrom.toISOString(),
          validTo: v.validTo.toISOString(),
          createdAt: v.createdAt.toISOString(),
        })),
        versionsAction: versionsAction.map((v) => ({
          ...v,
          validFrom: v.validFrom.toISOString(),
          validTo: v.validTo.toISOString(),
          delai: v.delai ? v.delai.toISOString() : null,
          createdAt: v.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Erreur serveur API Historique fiche (GET) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
