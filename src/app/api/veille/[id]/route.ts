import { NextResponse } from "next/server";

/**
 * JuriScan AI — Fiche individuelle persistée (édition).
 *
 * - GET /api/veille/[id] : `prisma.veilleAlerte.findUnique` + fiche + action
 *   → les 21 colonnes de la grille d'entreprise (id de route `db-…-…`).
 * - PUT /api/veille/[id] : met à jour Alerte + Fiche + Action, puis le
 *   client redirige vers `/dashboard`.
 */

import { prisma } from "@/lib/prisma";
import { parseFicheRouteId, type FicheVeillePayload } from "@/lib/veille-save";
import {
  CONFORMITE_STATUTS,
  DEPARTEMENT_CODES,
  type ConformiteStatut,
  type DepartementCode,
} from "@/domain/veille";

function dateOuNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cible = parseFicheRouteId(id);
  if (!cible) {
    return NextResponse.json(
      { error: "Fiche de démonstration : modification désactivée (données simulées)." },
      { status: 404 },
    );
  }
  try {
    const alerte = await prisma.veilleAlerte.findUnique({
      where: { id: cible.alerteId },
      include: {
        fichesDepartements: {
          where: { id: cible.ficheId },
          include: {
            actionsAmelioration: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });
    const fiche = alerte?.fichesDepartements[0] ?? null;
    if (!alerte || !fiche) {
      return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: { alerte, fiche, action: fiche.actionsAmelioration[0] ?? null },
    });
  } catch (error) {
    console.error("Erreur serveur API Veille (GET [id]) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cible = parseFicheRouteId(id);
  if (!cible) {
    return NextResponse.json(
      { error: "Fiche de démonstration : modification désactivée (données simulées)." },
      { status: 404 },
    );
  }
  try {
    const b = (await req.json()) as FicheVeillePayload & {
      responsable?: unknown;
      actionId?: unknown;
    };

    const chaine = (v: unknown): string => (typeof v === "string" ? v : "");
    const numeroOrdre = chaine(b.numeroOrdre).trim();
    const natureTexte = chaine(b.natureTexte).trim();
    const referenceTexte = chaine(b.referenceTexte).trim();
    const resumeTexte = chaine(b.resumeTexte).trim();
    const libelleApplicable = chaine(b.libelleApplicable).trim();
    const departement = chaine(b.departementResponsable);
    const statut = chaine(b.statutConformite);

    if (!numeroOrdre || !natureTexte || !referenceTexte || !resumeTexte || !libelleApplicable) {
      return NextResponse.json(
        { error: "Champs requis manquants (N° ordre, nature, référence, résumé, libellé)." },
        { status: 400 },
      );
    }
    if (!(DEPARTEMENT_CODES as string[]).includes(departement)) {
      return NextResponse.json({ error: "Département responsable invalide." }, { status: 400 });
    }
    if (!(CONFORMITE_STATUTS as string[]).includes(statut)) {
      return NextResponse.json({ error: "Statut de conformité invalide." }, { status: 400 });
    }

    const libelleAction = chaine(b.libelleAction).trim();
    const taux = Math.min(100, Math.max(0, Number(b.tauxAvancement) || 0));

    // Responsable libre → lie un User existant par email si trouvé, sinon inchangé.
    let responsableId: string | undefined;
    let responsableNonLie = false;
    const respTexte = chaine(b.responsable).trim();
    if (respTexte) {
      if (respTexte.includes("@")) {
        const user = await prisma.user.findUnique({
          where: { email: respTexte },
          select: { id: true },
        });
        if (user) responsableId = user.id;
        else responsableNonLie = true;
      } else {
        responsableNonLie = true;
      }
    }

    const actionId = typeof b.actionId === "string" && b.actionId ? b.actionId : null;

    await prisma.$transaction(async (tx) => {
      await tx.veilleAlerte.update({
        where: { id: cible.alerteId },
        data: {
          numeroOrdre,
          qssfte: chaine(b.qssfte).trim() || null,
          natureTexte: chaine(b.natureTexte).trim(),
          referenceTexte: chaine(b.referenceTexte).trim(),
          article: chaine(b.article).trim() || null,
          resumeTexte: chaine(b.resumeTexte).trim(),
          libelleApplicable: chaine(b.libelleApplicable).trim(),
          lienHypertexte: chaine(b.lienHypertexte).trim() || null,
          dateEntreeVigueur: dateOuNull(b.dateEntreeVigueur),
          contenu: chaine(b.contenu).trim() || chaine(b.resumeTexte).trim(),
          moyenCommunication: chaine(b.moyenCommunication).trim() || null,
          applicableA_AGL_CI: b.applicableAGLCI !== false,
        },
      });
      await tx.veilleFiche.update({
        where: { id: cible.ficheId },
        data: {
          departement: departement as DepartementCode,
          actionsExistantes: chaine(b.actionsExistantes).trim() || null,
          preuvesExistantes: chaine(b.preuvesExistantes).trim() || null,
          statutConformite: statut as ConformiteStatut,
          preuveDifferee: chaine(b.preuveDifferee).trim() || null,
        },
      });
      if (libelleAction) {
        const donneesAction = {
          libelleAction,
          delai: dateOuNull(b.delai),
          tauxAvancement: taux,
          ...(responsableId ? { responsableId } : {}),
        };
        if (actionId) {
          await tx.veilleAction.update({ where: { id: actionId }, data: donneesAction });
        } else {
          await tx.veilleAction.create({
            data: { ficheId: cible.ficheId, ...donneesAction },
          });
        }
      } else if (actionId) {
        await tx.veilleAction.delete({ where: { id: actionId } });
      }
    });

    return NextResponse.json({ success: true, responsableNonLie });
  } catch (error) {
    console.error("Erreur serveur API Veille (PUT [id]) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
