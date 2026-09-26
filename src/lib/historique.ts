/**
 * JuriScan AI — Écriture SCD Type 2 (serveur uniquement, Prisma).
 *
 * Utilisé par PUT / PATCH / POST : fige l'ancienne image dans les tables
 * `*Version` (validTo = now), incrémente `version` sur la ligne courante,
 * puis ajoute une entrée lisible dans `VeilleJournal`.
 * Les requêtes doivent s'exécuter dans un `prisma.$transaction`.
 */

import type { Prisma } from "@prisma/client";
import type { DepartementCode } from "@/domain/veille";
import type { HistoriqueAction, HistoriqueEntite } from "@/domain/historique";

type Tx = Prisma.TransactionClient;

interface Auteur {
  bu: DepartementCode | null;
  email: string | null;
}

export function diffChamps(
  avant: Record<string, unknown>,
  apres: Record<string, unknown>,
): string[] {
  const touches: string[] = [];
  for (const k of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
    if (JSON.stringify(avant[k] ?? null) !== JSON.stringify(apres[k] ?? null)) {
      touches.push(k);
    }
  }
  return touches;
}

export async function journaliser(
  tx: Tx,
  e: {
    alerteId?: string | null;
    ficheId?: string | null;
    actionId?: string | null;
    entite: HistoriqueEntite;
    action: HistoriqueAction;
    auteur: Auteur;
    details?: string | null;
    champsModifies?: string[];
  },
) {
  await tx.veilleJournal.create({
    data: {
      alerteId: e.alerteId ?? null,
      ficheId: e.ficheId ?? null,
      actionId: e.actionId ?? null,
      entite: e.entite,
      action: e.action,
      buAuteur: e.auteur.bu,
      emailAuteur: e.auteur.email,
      details: e.details ?? null,
      champsModifies: e.champsModifies?.length ? JSON.stringify(e.champsModifies) : null,
    },
  });
}

interface FicheCourante {
  id: string;
  version: number;
  validFrom: Date;
  departement: DepartementCode;
  statutConformite: string;
  fluxStatut: string;
  actionsExistantes: string | null;
  preuvesExistantes: string | null;
  preuveDifferee: string | null;
  preuveFichierNom: string | null;
}

/** Fige la fiche courante en version SCD2 (à appeler avant l'update). */
export async function versionnerFiche(
  tx: Tx,
  fiche: FicheCourante,
  motif: string,
  auteur: Auteur,
  maintenant: Date,
) {
  await tx.veilleFicheVersion.create({
    data: {
      ficheId: fiche.id,
      version: fiche.version,
      validFrom: fiche.validFrom,
      validTo: maintenant,
      departement: fiche.departement,
      statutConformite: fiche.statutConformite as never,
      fluxStatut: fiche.fluxStatut as never,
      actionsExistantes: fiche.actionsExistantes,
      preuvesExistantes: fiche.preuvesExistantes,
      preuveDifferee: fiche.preuveDifferee,
      preuveFichierNom: fiche.preuveFichierNom,
      modifiedByBU: auteur.bu,
      modifiedByEmail: auteur.email,
      motif,
    },
  });
}

interface ActionCourante {
  id: string;
  ficheId: string;
  version: number;
  validFrom: Date;
  libelleAction: string;
  delai: Date | null;
  tauxAvancement: number;
}

/** Fige l'action courante en version SCD2 (à appeler avant l'update). */
export async function versionnerAction(
  tx: Tx,
  action: ActionCourante,
  motif: string,
  auteur: Auteur,
  maintenant: Date,
) {
  await tx.veilleActionVersion.create({
    data: {
      actionId: action.id,
      ficheId: action.ficheId,
      version: action.version,
      validFrom: action.validFrom,
      validTo: maintenant,
      libelleAction: action.libelleAction,
      delai: action.delai,
      tauxAvancement: action.tauxAvancement,
      modifiedByBU: auteur.bu,
      modifiedByEmail: auteur.email,
      motif,
    },
  });
}
