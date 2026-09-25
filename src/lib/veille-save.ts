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
  BU_PROPOSITIONNABLES,
  CONFORMITE_STATUTS,
  DEPARTEMENT_CODES,
  FLUX_STATUTS,
  type ConformiteStatut,
  type DepartementCode,
  type FluxStatut,
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
  /** Recommandation IA (Gemini 3.6 Flash) : BU la plus probable. */
  propositionBU?: unknown;
  departementResponsable?: unknown;
  actionsExistantes?: unknown;
  preuvesExistantes?: unknown;
  statutConformite?: unknown;
  preuveDifferee?: unknown;
  /** Position workflow ; défaut ATTENTE_VALIDATION_JURIDIQUE (création IA), */
  /** le juridique fait basculer vers ATTENTE_APPROBATION_METIER en validant. */
  fluxStatut?: unknown;
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

/**
 * Identifiant de route d'une fiche : `db-<alerteId>-<ficheId>` (uuid v4 de
 * 36 caractères chacun). Les lignes `mock-*` du tableau de bord sont des
 * données de démonstration non persistées → null.
 */
export function parseFicheRouteId(
  routeId: string,
): { alerteId: string; ficheId: string } | null {
  if (!routeId.startsWith("db-")) return null;
  const rest = routeId.slice(3);
  if (rest.length < 73) return null;
  const alerteId = rest.slice(0, 36);
  if (rest[36] !== "-") return null;
  const ficheId = rest.slice(37);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(alerteId) || !uuid.test(ficheId)) return null;
  return { alerteId, ficheId };
}

export async function creerFicheVeille(b: FicheVeillePayload) {
  const numeroOrdre = chaine(b.numeroOrdre).trim();
  const natureTexte = chaine(b.natureTexte).trim();
  const referenceTexte = chaine(b.referenceTexte).trim();
  const resumeTexte = chaine(b.resumeTexte).trim();
  const libelleApplicable = chaine(b.libelleApplicable).trim();
  const departement = chaine(b.departementResponsable);
  const statut = chaine(b.statutConformite);
  const propositionRaw = chaine(b.propositionBU).trim().toUpperCase();
  const fluxRaw = chaine(b.fluxStatut).trim().toUpperCase();

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
  // propositionBU optionnelle : si fournie, doit être une BU propositionnable.
  const propositionBU =
    propositionRaw && (BU_PROPOSITIONNABLES as readonly string[]).includes(propositionRaw)
      ? (propositionRaw as DepartementCode)
      : null;
  if (propositionRaw && !propositionBU) {
    const err = new Error(
      "propositionBU invalide (attendu : DJ, DRH, DAF, DQHSE, PATR_IMMO, DILS).",
    );
    (err as NodeJS.ErrnoException).code = "VALIDATION_400";
    throw err;
  }
  // fluxStatut optionnel : défaut ATTENTE_VALIDATION_JURIDIQUE (sortie d'OCR IA).
  const fluxStatut: FluxStatut =
    fluxRaw && (FLUX_STATUTS as string[]).includes(fluxRaw)
      ? (fluxRaw as FluxStatut)
      : "ATTENTE_VALIDATION_JURIDIQUE";

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
        propositionBU,
        fichesDepartements: {
          create: {
            departement: departement as DepartementCode,
            actionsExistantes: chaine(b.actionsExistantes).trim() || null,
            preuvesExistantes: chaine(b.preuvesExistantes).trim() || null,
            statutConformite: statut as ConformiteStatut,
            preuveDifferee: chaine(b.preuveDifferee).trim() || null,
            fluxStatut,
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
