import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * JuriScan AI — API Grille de Veille (persistante, Prisma + PostgreSQL).
 *
 * - POST /api/veille : enregistre la fiche validée (21 colonnes) —
 *   `VeilleAlerte.create` (12 champs) + `VeilleFiche.create` (département
 *   assigné, ex. DRH/DJ/DQHSE) + `VeilleAction.create` si un libellé est
 *   renseigné. Le `responsable` libre du formulaire n'a pas de colonne
 *   dédiée (lookup `User` optionnel) : `responsableId` reste null.
 * - GET /api/veille : liste les alertes + fiches pour le tableau de bord
 *   (fusionnées aux mocks côté client, repli silencieux si DB absente).
 */

import { prisma } from "@/lib/prisma";
import {
  CONFORMITE_STATUTS,
  DEPARTEMENT_CODES,
  type ConformiteStatut,
  type DepartementCode,
} from "@/domain/veille";

function chaine(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function dateOuNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Record<string, unknown>;

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

    const taux = Math.min(100, Math.max(0, Number(b.tauxAvancement) || 0));
    const libelleAction = chaine(b.libelleAction).trim();

    const creer = async (ordre: string) =>
      prisma.veilleAlerte.create({
        data: {
          numeroOrdre: ordre,
          qssfte: chaine(b.qssfte).trim() || null,
          natureTexte,
          referenceTexte,
          article: chaine(b.article).trim() || null,
          resumeTexte,
          libelleApplicable,
          lienHypertexte: chaine(b.lienHypertexte).trim() || null,
          dateEntreeVigueur: dateOuNull(b.dateEntreeVigueur),
          contenu: chaine(b.contenu).trim() || resumeTexte,
          moyenCommunication: chaine(b.moyenCommunication).trim() || null,
          applicableA_AGL_CI: b.applicableAGLCI !== false,
          fichesDepartements: {
            create: {
              departement: departement as DepartementCode,
              actionsExistantes: chaine(b.actionsExistantes).trim() || null,
              preuvesExistantes: chaine(b.preuvesExistantes).trim() || null,
              statutConformite: statut as ConformiteStatut,
              preuveDifferee: chaine(b.preuveDifferee).trim() || null,
              ...(libelleAction
                ? {
                    actionsAmelioration: {
                      create: {
                        libelleAction,
                        delai: dateOuNull(b.delai),
                        tauxAvancement: taux,
                      },
                    },
                  }
                : {}),
            },
          },
        },
        include: { fichesDepartements: { include: { actionsAmelioration: true } } },
      });

    try {
      const alerte = await creer(numeroOrdre);
      return NextResponse.json({ success: true, data: alerte }, { status: 201 });
    } catch (e) {
      // N° d'ordre déjà pris (ex. re-clic) : repli avec suffixe unique, une fois.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const alerte = await creer(
          `${numeroOrdre}-${Date.now().toString(36).toUpperCase()}`,
        );
        return NextResponse.json({ success: true, data: alerte }, { status: 201 });
      }
      throw e;
    }
  } catch (error) {
    console.error("Erreur serveur API Veille :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const alertes = await prisma.veilleAlerte.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        fichesDepartements: {
          include: { actionsAmelioration: { orderBy: { createdAt: "desc" }, take: 1 } },
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
