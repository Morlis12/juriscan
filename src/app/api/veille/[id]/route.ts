import { NextResponse } from "next/server";

/**
 * JuriScan AI — Fiche individuelle persistée (cloisonnement strict + SCD2).
 *
 * - GET /api/veille/[id] : alerte + fiche + action (21 colonnes, lecture pour tous).
 * - PUT /api/veille/[id] : texte source + réassignation = CENTRALE uniquement ;
 *   conformité + action = BU propriétaire uniquement (DJ incluse, sans exception).
 *   Chaque groupe modifié fige l'ancienne image en `Veille*Version` (SCD2) et
 *   écrit `VeilleJournal` (consultable).
 * - PATCH /api/veille/[id] : validation/renvoi = centrale ; approbation/rejet/
 *   taux/preuves = BU propriétaire. 403 si la BU connectée (`x-bu-connectee`)
 *   n'a pas la main.
 */

import { prisma } from "@/lib/prisma";
import {
  parseFicheRouteId,
  validerPreuveFichier,
  type FicheVeillePayload,
  type PreuveFichierDonnees,
} from "@/lib/veille-save";
import {
  fusionnerAuteur,
  lireAuteur,
  lireAuteurDepuisCorps,
} from "@/lib/acces";
import {
  diffChamps,
  journaliser,
  versionnerAction,
  versionnerFiche,
} from "@/lib/historique";
import {
  CONFORMITE_STATUTS,
  DEPARTEMENT_CODES,
  FLUX_STATUTS,
  PERTINENCE_TRANSIT,
  type ConformiteStatut,
  type DepartementCode,
  type FluxStatut,
} from "@/domain/veille";
import {
  estCentrale,
} from "@/domain/acces";

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
    const auteur = fusionnerAuteur(lireAuteur(req), lireAuteurDepuisCorps(b));
    if (!auteur.bu) {
      return NextResponse.json(
        { error: "BU connectée manquante (en-tête x-bu-connectee requis)." },
        { status: 401 },
      );
    }

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

    // Cloisonnement strict : centrale (texte + réassignation) vs BU propriétaire (conformité).
    const existant = await prisma.veilleFiche.findUnique({
      where: { id: cible.ficheId },
      include: { actionsAmelioration: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!existant || existant.alerteId !== cible.alerteId) {
      return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
    }
    const alerteAvant = await prisma.veilleAlerte.findUnique({
      where: { id: cible.alerteId },
    });
    if (!alerteAvant) {
      return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
    }
    const centrale = estCentrale(auteur.bu);
    const proprietaire = auteur.bu === existant.departement;
    if (!centrale && !proprietaire) {
      return NextResponse.json(
        { error: `Réservé aux membres ${existant.departement} (vous êtes ${auteur.bu}).` },
        { status: 403 },
      );
    }

    const libelleAction = chaine(b.libelleAction).trim();
    const taux = Math.min(100, Math.max(0, Number(b.tauxAvancement) || 0));

    let preuveFichier: PreuveFichierDonnees | null = null;
    try {
      preuveFichier = validerPreuveFichier(b);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Document de preuve invalide." },
        { status: 400 },
      );
    }

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
    const actionAvant = existant.actionsAmelioration[0] ?? null;
    const maintenant = new Date();

    // --- Détection des groupes touchés (avant/après normalisés) ---
    const isoJour = (d: Date | null): string =>
      d ? d.toISOString().slice(0, 10) : "";
    // Pertinence transit : liste fermée (centrale uniquement, comme le texte).
    const pertinenceRaw = chaine(b.pertinenceTransit).trim();
    const pertinenceApres = (PERTINENCE_TRANSIT as readonly string[]).includes(
      pertinenceRaw,
    )
      ? pertinenceRaw
      : "";
    const texteAvant = {
      numeroOrdre: alerteAvant.numeroOrdre,
      qssfte: alerteAvant.qssfte ?? "",
      natureTexte: alerteAvant.natureTexte,
      referenceTexte: alerteAvant.referenceTexte,
      article: alerteAvant.article ?? "",
      resumeTexte: alerteAvant.resumeTexte,
      libelleApplicable: alerteAvant.libelleApplicable,
      lienHypertexte: alerteAvant.lienHypertexte ?? "",
      dateEntreeVigueur: isoJour(alerteAvant.dateEntreeVigueur),
      contenu: alerteAvant.contenu,
      moyenCommunication: alerteAvant.moyenCommunication ?? "",
      applicableAGLCI: alerteAvant.applicableA_AGL_CI,
      pertinenceTransit: alerteAvant.pertinenceTransit ?? "",
    };
    const texteApres = {
      numeroOrdre,
      qssfte: chaine(b.qssfte).trim(),
      natureTexte,
      referenceTexte,
      article: chaine(b.article).trim(),
      resumeTexte,
      libelleApplicable,
      lienHypertexte: chaine(b.lienHypertexte).trim(),
      dateEntreeVigueur: chaine(b.dateEntreeVigueur).trim().slice(0, 10),
      contenu: chaine(b.contenu).trim() || resumeTexte,
      moyenCommunication: chaine(b.moyenCommunication).trim(),
      applicableAGLCI: b.applicableAGLCI !== false,
      pertinenceTransit: pertinenceApres,
    };
    const champsTexte = diffChamps(texteAvant, texteApres);
    const toucheTexte = champsTexte.length > 0;

    const confAvant = {
      statutConformite: existant.statutConformite,
      preuveDifferee: existant.preuveDifferee ?? "",
      actionsExistantes: existant.actionsExistantes ?? "",
      preuvesExistantes: existant.preuvesExistantes ?? "",
    };
    const confApres = {
      statutConformite: statut,
      preuveDifferee: chaine(b.preuveDifferee).trim(),
      actionsExistantes: chaine(b.actionsExistantes).trim(),
      preuvesExistantes: chaine(b.preuvesExistantes).trim(),
    };
    // Document joint : fourni (remplacement) ou demande de suppression alors qu'un fichier existe.
    const fichierTouche =
      preuveFichier !== null &&
      (preuveFichier.donnees !== null || existant.preuveFichierDonnees !== null);
    const champsConf = [...diffChamps(confAvant, confApres), ...(fichierTouche ? ["preuveFichier"] : [])];

    const delaiAvant = actionAvant?.delai ? isoJour(actionAvant.delai) : "";
    const delaiApres =
      typeof b.delai === "string" ? b.delai.trim().slice(0, 10) : "";
    const actionTouchee =
      libelleAction !== (actionAvant?.libelleAction ?? "") ||
      delaiApres !== delaiAvant ||
      taux !== (actionAvant ? Math.round(actionAvant.tauxAvancement) : 0) ||
      respTexte !== "";
    // Sans libellé ni action ciblée, le taux seul ne crée rien (comme avant) : ignoré.
    const actionAgit = actionTouchee && (libelleAction !== "" || actionId !== null);

    const reassignee = departement !== existant.departement;

    // --- Autorisations par groupe (strict) ---
    if (reassignee && !centrale) {
      return NextResponse.json(
        { error: "Réassignation vers une autre BU : réservée à la centrale (CENTRAL_VRG)." },
        { status: 403 },
      );
    }
    if (toucheTexte && !centrale) {
      return NextResponse.json(
        { error: "Texte source : réservé à la centrale (la BU pilote sa conformité)." },
        { status: 403 },
      );
    }
    if ((champsConf.length > 0 || actionAgit) && !proprietaire) {
      return NextResponse.json(
        { error: `Conformité : réservée aux membres ${existant.departement} (vous êtes ${auteur.bu}).` },
        { status: 403 },
      );
    }
    if (!toucheTexte && !reassignee && champsConf.length === 0 && !actionAgit) {
      return NextResponse.json({ success: true, inchange: true, responsableNonLie });
    }

    await prisma.$transaction(async (tx) => {
      // SCD2 : fige uniquement les entités réellement touchées.
      const ficheTouchee = champsConf.length > 0 || reassignee;
      if (ficheTouchee) {
        await versionnerFiche(tx, existant, "PUT modification fiche", auteur, maintenant);
      }
      if (toucheTexte) {
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
            pertinenceTransit: pertinenceApres || null,
          },
        });
      }
      if (ficheTouchee) {
        await tx.veilleFiche.update({
          where: { id: cible.ficheId },
          data: {
            ...(reassignee ? { departement: departement as DepartementCode } : {}),
            ...(champsConf.length > 0
              ? {
                  actionsExistantes: chaine(b.actionsExistantes).trim() || null,
                  preuvesExistantes: chaine(b.preuvesExistantes).trim() || null,
                  statutConformite: statut as ConformiteStatut,
                  preuveDifferee: chaine(b.preuveDifferee).trim() || null,
                  ...(preuveFichier
                    ? {
                        preuveFichierNom: preuveFichier.nom,
                        preuveFichierMime: preuveFichier.mime,
                        preuveFichierDonnees: preuveFichier.donnees,
                      }
                    : {}),
                }
              : {}),
            version: { increment: 1 },
            validFrom: maintenant,
            modifiedByBU: auteur.bu,
            modifiedByEmail: auteur.email,
          },
        });
      }
      let newActionId: string | null = actionId;
      if (actionAgit) {
        const donneesAction = {
          libelleAction,
          delai: dateOuNull(b.delai),
          tauxAvancement: taux,
          ...(responsableId ? { responsableId } : {}),
        };
        if (actionId && actionAvant && actionAvant.id === actionId) {
          await versionnerAction(tx, actionAvant, "PUT modification action", auteur, maintenant);
          await tx.veilleAction.update({
            where: { id: actionId },
            data: {
              ...donneesAction,
              version: { increment: 1 },
              validFrom: maintenant,
              modifiedByBU: auteur.bu,
              modifiedByEmail: auteur.email,
            },
          });
        } else if (libelleAction) {
          const creee = await tx.veilleAction.create({
            data: {
              ficheId: cible.ficheId,
              ...donneesAction,
              modifiedByBU: auteur.bu,
              modifiedByEmail: auteur.email,
            },
          });
          newActionId = creee.id;
        } else if (actionId) {
          const cibleSuppr = actionAvant && actionAvant.id === actionId ? actionAvant : null;
          if (cibleSuppr) {
            await versionnerAction(tx, cibleSuppr, "PUT suppression action", auteur, maintenant);
          }
          await tx.veilleAction.delete({ where: { id: actionId } });
          newActionId = null;
        }
      }
      if (toucheTexte) {
        await journaliser(tx, {
          alerteId: cible.alerteId,
          ficheId: cible.ficheId,
          entite: "ALERTE",
          action: "MODIFICATION_TEXTE",
          auteur,
          details: `Texte ${numeroOrdre} modifié par la centrale.`,
          champsModifies: champsTexte,
        });
      }
      if (reassignee) {
        await journaliser(tx, {
          alerteId: cible.alerteId,
          ficheId: cible.ficheId,
          entite: "FICHE",
          action: "REASSIGNATION",
          auteur,
          details: `Réassignée ${existant.departement} → ${departement} par ${auteur.bu}.`,
          champsModifies: ["departement"],
        });
      }
      if (champsConf.length > 0 || actionAgit) {
        await journaliser(tx, {
          alerteId: cible.alerteId,
          ficheId: cible.ficheId,
          actionId: newActionId,
          entite: "FICHE",
          action: "MODIFICATION_FICHE",
          auteur,
          details: `Fiche ${existant.departement} modifiée par ${auteur.bu} (v${existant.version} → v${existant.version + 1}).`,
          champsModifies: [
            ...champsConf,
            ...(actionAgit ? ["libelleAction", "tauxAvancement"] : []),
          ],
        });
      }
    });

    return NextResponse.json({ success: true, responsableNonLie });
  } catch (error) {
    console.error("Erreur serveur API Veille (PUT [id]) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/veille/[id] — workflow + pilotage BU (cloisonné, tracé SCD2).
 *
 * - Juridique : { fluxStatut: "ATTENTE_APPROBATION_METIER" } (valide vers la BU),
 *   { fluxStatut: "ATTENTE_APPROBATION_METIER" } depuis un rejet (renvoi).
 * - BU propriétaire : { fluxStatut: "REJETE_METIER" }, { fluxStatut: "APPROUVE_METIER",
 *   ...conformité }, ou pilotage partiel { tauxAvancement } / { preuveDifferee }…
 * - 403 si la BU connectée n'a pas la main sur la fiche.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cible = parseFicheRouteId(id);
  if (!cible) {
    return NextResponse.json(
      { error: "Fiche de démonstration : transition simulée côté client." },
      { status: 404 },
    );
  }
  try {
    const b = (await req.json()) as {
      fluxStatut?: unknown;
      libelleAction?: unknown;
      delai?: unknown;
      tauxAvancement?: unknown;
      statutConformite?: unknown;
      preuveDifferee?: unknown;
      actionsExistantes?: unknown;
      preuvesExistantes?: unknown;
      responsable?: unknown;
      preuveFichierNom?: unknown;
      preuveFichierMime?: unknown;
      preuveFichierDonnees?: unknown;
      actionId?: unknown;
      buConnectee?: unknown;
      emailConnecte?: unknown;
    };
    const auteur = fusionnerAuteur(lireAuteur(req), lireAuteurDepuisCorps(b));
    if (!auteur.bu) {
      return NextResponse.json(
        { error: "BU connectée manquante (en-tête x-bu-connectee requis)." },
        { status: 401 },
      );
    }
    const fluxRaw =
      typeof b.fluxStatut === "string" ? b.fluxStatut.trim().toUpperCase() : "";
    let fluxStatut: FluxStatut | null = null;
    if (fluxRaw) {
      if (!(FLUX_STATUTS as string[]).includes(fluxRaw)) {
        return NextResponse.json(
          {
            error:
              "fluxStatut invalide (attendu : ATTENTE_VALIDATION_JURIDIQUE, ATTENTE_APPROBATION_METIER, APPROUVE_METIER, REJETE_METIER).",
          },
          { status: 400 },
        );
      }
      fluxStatut = fluxRaw as FluxStatut;
    }

    const fiche = await prisma.veilleFiche.findUnique({
      where: { id: cible.ficheId },
      include: { actionsAmelioration: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!fiche || fiche.alerteId !== cible.alerteId) {
      return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
    }

    // Matrice stricte : centrale = flux (validation/renvoi), BU propriétaire = conformité.
    const centrale = estCentrale(auteur.bu);
    const proprietaire = auteur.bu === fiche.departement;
    if (!centrale && !proprietaire) {
      return NextResponse.json(
        { error: `Réservé aux membres ${fiche.departement} (vous êtes ${auteur.bu}).` },
        { status: 403 },
      );
    }
    if (fluxStatut === "ATTENTE_APPROBATION_METIER" && !centrale) {
      return NextResponse.json(
        { error: "Validation vers métier : réservée à la centrale (CENTRAL_VRG)." },
        { status: 403 },
      );
    }
    if ((fluxStatut === "APPROUVE_METIER" || fluxStatut === "REJETE_METIER") && !proprietaire) {
      return NextResponse.json(
        { error: `Approbation / rejet : réservé aux membres ${fiche.departement}.` },
        { status: 403 },
      );
    }
    const toucheConformite =
      b.libelleAction !== undefined ||
      b.tauxAvancement !== undefined ||
      b.delai !== undefined ||
      b.responsable !== undefined ||
      b.statutConformite !== undefined ||
      b.preuveDifferee !== undefined ||
      b.actionsExistantes !== undefined ||
      b.preuvesExistantes !== undefined ||
      b.preuveFichierDonnees !== undefined;
    // Conformité (y compris pour la centrale) : BU propriétaire uniquement.
    if (toucheConformite && !proprietaire) {
      return NextResponse.json(
        { error: `Conformité : réservée aux membres ${fiche.departement} (la centrale pilote le flux, pas la conformité).` },
        { status: 403 },
      );
    }

    const statutRaw =
      typeof b.statutConformite === "string" ? b.statutConformite.trim() : "";
    const statutConformite =
      statutRaw && (CONFORMITE_STATUTS as string[]).includes(statutRaw)
        ? (statutRaw as ConformiteStatut)
        : null;
    if (statutRaw && !statutConformite) {
      return NextResponse.json(
        { error: "Statut de conformité invalide." },
        { status: 400 },
      );
    }
    const preuveDifferee =
      typeof b.preuveDifferee === "string" ? b.preuveDifferee.trim() || null : undefined;

    let preuveFichier: PreuveFichierDonnees | null = null;
    try {
      preuveFichier = validerPreuveFichier(b);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Document de preuve invalide." },
        { status: 400 },
      );
    }

    let responsableId: string | undefined;
    let responsableNonLie = false;
    const respTexte =
      typeof b.responsable === "string" ? b.responsable.trim() : "";
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

    const libelleAction =
      typeof b.libelleAction === "string" ? b.libelleAction.trim() : "";
    const taux =
      b.tauxAvancement === undefined || b.tauxAvancement === null || b.tauxAvancement === ""
        ? null
        : Math.min(100, Math.max(0, Number(b.tauxAvancement) || 0));
    const delaiRaw = typeof b.delai === "string" ? b.delai.trim() : "";
    const actionId =
      typeof b.actionId === "string" && b.actionId ? b.actionId : null;
    const actionAvant = fiche.actionsAmelioration[0] ?? null;
    const maintenant = new Date();

    const avantFiche = {
      fluxStatut: fiche.fluxStatut,
      statutConformite: fiche.statutConformite,
      preuveDifferee: fiche.preuveDifferee,
      actionsExistantes: fiche.actionsExistantes,
      preuvesExistantes: fiche.preuvesExistantes,
    };

    await prisma.$transaction(async (tx) => {
      const modifieFiche =
        !!fluxStatut ||
        !!statutConformite ||
        preuveDifferee !== undefined ||
        typeof b.actionsExistantes === "string" ||
        typeof b.preuvesExistantes === "string" ||
        !!preuveFichier;
      if (modifieFiche) {
        await versionnerFiche(tx, fiche, `PATCH ${fluxStatut ?? "pilotage"}`, auteur, maintenant);
      }
      await tx.veilleFiche.update({
        where: { id: cible.ficheId },
        data: {
          ...(fluxStatut ? { fluxStatut } : {}),
          ...(statutConformite ? { statutConformite } : {}),
          ...(preuveDifferee !== undefined ? { preuveDifferee } : {}),
          ...(typeof b.actionsExistantes === "string"
            ? { actionsExistantes: b.actionsExistantes.trim() || null }
            : {}),
          ...(typeof b.preuvesExistantes === "string"
            ? { preuvesExistantes: b.preuvesExistantes.trim() || null }
            : {}),
          ...(preuveFichier
            ? {
                preuveFichierNom: preuveFichier.nom,
                preuveFichierMime: preuveFichier.mime,
                preuveFichierDonnees: preuveFichier.donnees,
              }
            : {}),
          ...(modifieFiche
            ? {
                version: { increment: 1 },
                validFrom: maintenant,
                modifiedByBU: auteur.bu,
                modifiedByEmail: auteur.email,
              }
            : {}),
        },
      });
      let journalActionId: string | null = actionId;
      if (libelleAction || taux !== null || delaiRaw || respTexte || actionId) {
        const donneesAction: {
          libelleAction?: string;
          delai?: Date | null;
          tauxAvancement?: number;
          responsableId?: string;
        } = {};
        if (libelleAction) donneesAction.libelleAction = libelleAction;
        if (delaiRaw) donneesAction.delai = dateOuNull(delaiRaw);
        if (taux !== null) donneesAction.tauxAvancement = taux;
        if (responsableId) donneesAction.responsableId = responsableId;
        if (actionId && actionAvant && actionAvant.id === actionId) {
          await versionnerAction(tx, actionAvant, `PATCH ${fluxStatut ?? "pilotage"}`, auteur, maintenant);
          await tx.veilleAction.update({
            where: { id: actionId },
            data: {
              ...donneesAction,
              version: { increment: 1 },
              validFrom: maintenant,
              modifiedByBU: auteur.bu,
              modifiedByEmail: auteur.email,
            },
          });
        } else if (actionAvant && !actionId && (libelleAction || taux !== null || delaiRaw)) {
          // Pilotage sans actionId : met à jour la dernière action (SCD2).
          await versionnerAction(tx, actionAvant, `PATCH ${fluxStatut ?? "pilotage"}`, auteur, maintenant);
          await tx.veilleAction.update({
            where: { id: actionAvant.id },
            data: {
              ...donneesAction,
              version: { increment: 1 },
              validFrom: maintenant,
              modifiedByBU: auteur.bu,
              modifiedByEmail: auteur.email,
            },
          });
          journalActionId = actionAvant.id;
        } else {
          const creee = await tx.veilleAction.create({
            data: {
              ficheId: cible.ficheId,
              libelleAction: libelleAction || "Action de conformité à préciser",
              delai: delaiRaw ? dateOuNull(delaiRaw) : null,
              tauxAvancement: taux ?? 0,
              ...(responsableId ? { responsableId } : {}),
              modifiedByBU: auteur.bu,
              modifiedByEmail: auteur.email,
            },
          });
          journalActionId = creee.id;
        }
      }
      const apresFiche = {
        fluxStatut: fluxStatut ?? fiche.fluxStatut,
        statutConformite: statutConformite ?? fiche.statutConformite,
        preuveDifferee: preuveDifferee !== undefined ? preuveDifferee : fiche.preuveDifferee,
        actionsExistantes:
          typeof b.actionsExistantes === "string"
            ? b.actionsExistantes.trim() || null
            : fiche.actionsExistantes,
        preuvesExistantes:
          typeof b.preuvesExistantes === "string"
            ? b.preuvesExistantes.trim() || null
            : fiche.preuvesExistantes,
      };
      const actionJournal =
        fluxStatut === "ATTENTE_APPROBATION_METIER"
          ? fiche.fluxStatut === "REJETE_METIER" ? "RENVOI_BU" : "VALIDATION_JURIDIQUE"
          : fluxStatut === "APPROUVE_METIER"
            ? "APPROBATION_BU"
            : fluxStatut === "REJETE_METIER"
              ? "REJET_BU"
              : taux !== null && !fluxStatut && !statutConformite
                ? "MODIFICATION_TAUX"
                : preuveFichier || preuveDifferee !== undefined
                  ? "MODIFICATION_PREUVE"
                  : libelleAction || delaiRaw || respTexte
                    ? "MODIFICATION_ACTION"
                    : "MODIFICATION_FICHE";
      await journaliser(tx, {
        alerteId: cible.alerteId,
        ficheId: cible.ficheId,
        actionId: journalActionId,
        entite: "FICHE",
        action: actionJournal,
        auteur,
        details:
          actionJournal === "VALIDATION_JURIDIQUE"
            ? `Validée vers ${fiche.departement} par la centrale.`
            : actionJournal === "RENVOI_BU"
              ? `Rejet retraité et renvoyé vers ${fiche.departement}.`
              : actionJournal === "APPROBATION_BU"
                ? `Approuvée par ${fiche.departement}${taux !== null ? ` à ${taux} %.` : "."}`
                : actionJournal === "REJET_BU"
                  ? `Assignation refusée par ${fiche.departement} (retour centrale).`
                  : `Fiche ${fiche.departement} pilotée par ${auteur.bu}.`,
        champsModifies: [
          ...diffChamps(avantFiche, apresFiche),
          ...(taux !== null ? ["tauxAvancement"] : []),
          ...(libelleAction ? ["libelleAction"] : []),
        ],
      });
    });

    return NextResponse.json({ success: true, ...(fluxStatut ? { fluxStatut } : {}), responsableNonLie });
  } catch (error) {
    console.error("Erreur serveur API Veille (PATCH [id]) :", error);
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
