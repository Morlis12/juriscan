/**
 * JuriScan AI — Moteur d'enregistrement partagé (Prisma, serveur uniquement).
 *
 * Utilisé par POST /api/veille et POST /api/sauvegarde : insère les 21
 * colonnes validées du formulaire → `VeilleAlerte.create` (12 champs) +
 * `VeilleFiche.create` (département assigné) + `VeilleAction.create`
 * optionnelle. Anti-doublon `numeroOrdre` avec suffixe unique (un essai).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CONFORMITE_STATUTS,
  DEPARTEMENT_CODES,
  type ConformiteStatut,
  type DepartementCode,
} from "@/domain/veille";

export interface FicheVeillePayload {
  numeroOrdre?: unknown;
  qssfte?: unknown;
  natureTexte?: unknown;
  referenceTexte?: unknown;
  article?: unknown;
  resumeTexte?: unknown;
  libelleApplicable?: unknown;
  lienHypertexte?: unknown;
  dateEntreeVigueur?: unknown;
  contenu?: unknown;
  moyenCommunication?: unknown;
  applicableAGLCI?: unknown;
  departementResponsable?: unknown;
  actionsExistantes?: unknown;
  preuvesExistantes?: unknown;
  statutConformite?: unknown;
  preuveDifferee?: unknown;
  libelleAction?: unknown;
  delai?: unknown;
  tauxAvancement?: unknown;
}

function chaine(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function dateOuNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function creerFicheVeille(b: FicheVeillePayload) {
  const numeroOrdre = chaine(b.numeroOrdre).trim();
  const natureTexte = chaine(b.natureTexte).trim();
  const referenceTexte = chaine(b.referenceTexte).trim();
  const resumeTexte = chaine(b.resumeTexte).trim();
  const libelleApplicable = chaine(b.libelleApplicable).trim();
  const departement = chaine(b.departementResponsable);
  const statut = chaine(b.statutConformite);

  if (!numeroOrdre || !natureTexte || !referenceTexte || !resumeTexte || !libelleApplicable) {
    const err = new Error(
      "Champs requis manquants (N° ordre, nature, référence, résumé, libellé).",
    );
    (err as NodeJS.ErrnoException).code = "VALIDATION_400";
    throw err;
  }
  if (!(DEPARTEMENT_CODES as string[]).includes(departement)) {
    const err = new Error("Département responsable invalide.");
    (err as NodeJS.ErrnoException).code = "VALIDATION_400";
    throw err;
  }
  if (!(CONFORMITE_STATUTS as string[]).includes(statut)) {
    const err = new Error("Statut de conformité invalide.");
    (err as NodeJS.ErrnoException).code = "VALIDATION_400";
    throw err;
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
    return await creer(numeroOrdre);
  } catch (e) {
    // N° d'ordre déjà pris (ex. re-clic) : repli avec suffixe unique, une fois.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return await creer(`${numeroOrdre}-${Date.now().toString(36).toUpperCase()}`);
    }
    throw e;
  }
}
