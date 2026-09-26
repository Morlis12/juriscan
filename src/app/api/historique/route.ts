import { NextResponse } from "next/server";

/**
 * JuriScan AI — Journal consultable (SCD2).
 *
 * GET /api/historique?ficheId=&alerteId=&bu=&action=&take=
 * Liste les modifications tracées (plus récentes d'abord) avec le N° d'ordre
 * et la BU de la fiche. Lecture ouverte à toutes les BU (traçabilité).
 */

import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ficheId = url.searchParams.get("ficheId")?.trim() || null;
    const alerteId = url.searchParams.get("alerteId")?.trim() || null;
    const bu = url.searchParams.get("bu")?.trim().toUpperCase() || null;
    const action = url.searchParams.get("action")?.trim().toUpperCase() || null;
    const take = Math.min(200, Math.max(1, Number(url.searchParams.get("take")) || 100));

    const entrees = await prisma.veilleJournal.findMany({
      where: {
        ...(ficheId ? { ficheId } : {}),
        ...(alerteId ? { alerteId } : {}),
        ...(bu ? { buAuteur: bu as never } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        alerte: { select: { numeroOrdre: true } },
        fiche: { select: { departement: true } },
      },
    });
    const data = entrees.map((e) => ({
      id: e.id,
      alerteId: e.alerteId,
      ficheId: e.ficheId,
      actionId: e.actionId,
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
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Erreur serveur API Historique (GET) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
