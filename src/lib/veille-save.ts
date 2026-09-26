/**
 * JuriScan AI — Moteur d'enregistrement partagé (Prisma, serveur uniquement).
 *
 * Utilisé par POST /api/veille et POST /api/sauvegarde : insère les 21
 * colonnes validées du formulaire → `VeilleAlerte.create` (12 champs) +
 * N `VeilleFiche.create` (une fiche par BU cochée — un texte de loi peut
 * concerner plusieurs BU) + `VeilleAction.create` optionnelle par fiche.
 * Anti-doublon `numeroOrdre` avec suffixe unique (un essai).
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
  /** Assignation multi-BU : un texte peut concerner plusieurs BU (cases à cocher). */
  departementsResponsables?: unknown;
  departementResponsable?: unknown;
  actionsExistantes?: unknown;
  preuvesExistantes?: unknown;
  statutConformite?: unknown;
  preuveDifferee?: unknown;
  /** Position workflow ; défaut ATTENTE_VALIDATION_JURIDIQUE (création IA), */
  /** le juridique fait basculer vers ATTENTE_APPROBATION_METIER en validant. */
  fluxStatut?: unknown;
  /** Document de preuve joint (nom, MIME, base64 pur) — téléversé par la BU. */
  preuveFichierNom?: unknown;
  preuveFichierMime?: unknown;
  preuveFichierDonnees?: unknown;
  libelleAction?: unknown;
  delai?: unknown;
  tauxAvancement?: unknown;
  /** Pont prototype → Entra ID : BU / email de l'auteur (issus des en-têtes). */
  buConnectee?: unknown;
  emailConnecte?: unknown;
}

/** Auteur SCD2 (BU + email) propagé depuis les en-têtes vers le journal. */
export interface AuteurVeille {
  bu: DepartementCode | null;
  email: string | null;
}

function chaine(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function dateOuNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Limite du document de preuve : 8 Mo (~11 Mo une fois encodé en base64). */
export const PREUVE_FICHIER_MAX_BASE64 = 11_000_000;

const PREUVE_MIME_OK = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export interface PreuveFichierDonnees {
  nom: string | null;
  mime: string | null;
  donnees: string | null;
}

/**
 * Valide le document de preuve joint aux preuves existantes (base64 pur).
 * - Retourne null si aucune clé de fichier n'est fournie (champ inchangé).
 * - Retourne des nulls si le client vide les trois clés (suppression du document).
 * - Lève une erreur VALIDATION_400 si le document est incomplet, refusé ou trop lourd.
 */
export function validerPreuveFichier(b: {
  preuveFichierNom?: unknown;
  preuveFichierMime?: unknown;
  preuveFichierDonnees?: unknown;
}): PreuveFichierDonnees | null {
  const { preuveFichierNom: n, preuveFichierMime: m, preuveFichierDonnees: d } = b;
  if (n === undefined && m === undefined && d === undefined) return null;
  const nom = typeof n === "string" ? n.trim().slice(0, 255) : "";
  const mime = typeof m === "string" ? m.trim() : "";
  const donnees = typeof d === "string" ? d.replace(/\s+/g, "") : "";
  if (!nom && !mime && !donnees) return { nom: null, mime: null, donnees: null };
  const err = (message: string) => {
    const e = new Error(message);
    (e as NodeJS.ErrnoException).code = "VALIDATION_400";
    return e;
  };
  if (!donnees) throw err("Document de preuve incomplet.");
  if (mime && !PREUVE_MIME_OK.includes(mime)) {
    throw err("Format de preuve non pris en charge (PDF, PNG, JPG, WEBP).");
  }
  if (donnees.length > PREUVE_FICHIER_MAX_BASE64) {
    throw err("Document de preuve trop volumineux (8 Mo maximum).");
  }
  return { nom: nom || "preuve", mime: mime || "application/octet-stream", donnees };
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

export async function creerFicheVeille(b: FicheVeillePayload, auteur: AuteurVeille = { bu: null, email: null }) {
  const numeroOrdre = chaine(b.numeroOrdre).trim();
  const natureTexte = chaine(b.natureTexte).trim();
  const referenceTexte = chaine(b.referenceTexte).trim();
  const resumeTexte = chaine(b.resumeTexte).trim();
  const libelleApplicable = chaine(b.libelleApplicable).trim();
  const departement = chaine(b.departementResponsable);
  const statut = chaine(b.statutConformite);
  const propositionRaw = chaine(b.propositionBU).trim().toUpperCase();
  const fluxRaw = chaine(b.fluxStatut).trim().toUpperCase();

  // Un texte de loi peut concerner plusieurs BU : le formulaire envoie la
  // liste cochée (`departementsResponsables`), avec repli sur le champ
  // historique mono-BU (`departementResponsable`).
  const brutBus = Array.isArray(b.departementsResponsables)
    ? b.departementsResponsables
    : [];
  const listeBus = (
    brutBus.length > 0 ? brutBus.map((v) => chaine(v).trim()) : [departement]
  ).filter((v) => v !== "");
  const departements = Array.from(new Set(listeBus)) as string[];

  if (!numeroOrdre || !natureTexte || !referenceTexte || !resumeTexte || !libelleApplicable) {
    const err = new Error(
      "Champs requis manquants (N° ordre, nature, référence, résumé, libellé).",
    );
    (err as NodeJS.ErrnoException).code = "VALIDATION_400";
    throw err;
  }
  if (departements.length === 0) {
    const err = new Error("Cochez au moins une BU responsable.");
    (err as NodeJS.ErrnoException).code = "VALIDATION_400";
    throw err;
  }
  for (const code of departements) {
    if (!(DEPARTEMENT_CODES as string[]).includes(code)) {
      const err = new Error(`Département responsable invalide : ${code}.`);
      (err as NodeJS.ErrnoException).code = "VALIDATION_400";
      throw err;
    }
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
  // Document de preuve joint (optionnel à la création, 400 si invalide).
  const preuveFichier = validerPreuveFichier(b);

  const taux = Math.min(100, Math.max(0, Number(b.tauxAvancement) || 0));
  const libelleAction = chaine(b.libelleAction).trim();

  const creer = async (ordre: string) =>
    prisma.$transaction(async (tx) => {
      const alerte = await tx.veilleAlerte.create({
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
            create: departements.map((code) => ({
              departement: code as DepartementCode,
              actionsExistantes: chaine(b.actionsExistantes).trim() || null,
              preuvesExistantes: chaine(b.preuvesExistantes).trim() || null,
              statutConformite: statut as ConformiteStatut,
              preuveDifferee: chaine(b.preuveDifferee).trim() || null,
              fluxStatut,
              modifiedByBU: auteur.bu,
              modifiedByEmail: auteur.email,
              ...(preuveFichier
                ? {
                    preuveFichierNom: preuveFichier.nom,
                    preuveFichierMime: preuveFichier.mime,
                    preuveFichierDonnees: preuveFichier.donnees,
                  }
                : {}),
              ...(libelleAction
                ? {
                    actionsAmelioration: {
                      create: {
                        libelleAction,
                        delai: dateOuNull(b.delai),
                        tauxAvancement: taux,
                        modifiedByBU: auteur.bu,
                        modifiedByEmail: auteur.email,
                      },
                    },
                  }
                : {}),
            })),
          },
        },
        include: { fichesDepartements: { include: { actionsAmelioration: true } } },
      });
      // SCD2 : journal de création (une entrée par fiche assignée, consultable).
      for (const f of alerte.fichesDepartements) {
        await tx.veilleJournal.create({
          data: {
            alerteId: alerte.id,
            ficheId: f.id,
            entite: "FICHE",
            action: "CREATION",
            buAuteur: auteur.bu,
            emailAuteur: auteur.email,
            details: `Assignée à ${f.departement} (texte ${ordre}).`,
            champsModifies: JSON.stringify(["departement", "fluxStatut"]),
          },
        });
      }
      return alerte;
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
