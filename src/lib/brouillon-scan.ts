/**
 * AGL JuriCompliance — Conservation du travail en cours (onglet Assignation).
 *
 * Un scan IA coûte des tokens : ce qui est extrait doit survivre à tout ce que
 * fait l'utilisateur (changer d'onglet, quitter la page, revenir le lendemain,
 * déposer un nouveau document). Rien n'est effacé tant que l'enregistrement en
 * base n'a pas réussi.
 *
 * Pourquoi IndexedDB : le quota de `localStorage` est d'environ 5 Mo. Un JO
 * réel produit des dizaines d'actes, chacun avec la transcription brute
 * (`contenu`) — le brouillon dépasse vite 5 Mo et `setItem` lève une erreur
 * silencieusement avalée : le scan disparaissait. IndexedDB stocke le volume
 * réellement nécessaire ; `localStorage` reste un filet de sécurité (mode
 * privé, IndexedDB indisponible) et sert aussi de miroir allégé.
 *
 * Trois garanties :
 * 1. `localStorage` en dernier recours : si le quota bloque, on enregistre une
 *    version allégée (transcription tronquée) plutôt que de tout perdre, et
 *    l'interface est informée par `avertissement`.
 * 2. Jamais d'effacement automatique : un lot ne disparaît qu'après un
 *    enregistrement réussi ou une suppression explicite.
 * 3. Format versionné + migration de l'ancien brouillon (un seul document) vers
 *    la liste de lots, pour ne pas perdre le travail déjà en cours.
 *
 * Pure navigateur, sans dépendance ni API serveur : même code transposable tel
 * quel côté portail (IndexedDB existe dans Power Pages).
 */

import type { ActeAnalyse } from "@/domain/nouvelle-alerte";

const BASE = "juriscan-juricompliance";
const MAGASIN = "brouillons";
const CLE = "assignation";
const CLE_ANCIENNE = "juriscan-nouvelle-alerte-brouillon";
const VERSION = 2;

export type ModeSaisie = "auto" | "manuel";

/** Un document déposé et analysé : ses actes, sa position, son horodatage. */
export interface LotScan {
  id: string;
  fileName: string;
  mimeType: string;
  taille: number;
  /** ISO — horodatage du scan (ordre de passage, repérage d'un lot ancien). */
  dateScan: string;
  source: "gemini" | "simulation" | null;
  meta: Record<string, number> | null;
  avertissement: string | null;
  actes: ActeAnalyse[];
  indexActe: number;
}

export interface BrouillonScan {
  version: number;
  mode: ModeSaisie;
  /** Onglet Auto : un lot par document scanné, du plus ancien au plus récent. */
  lots: LotScan[];
  /** Lot affiché dans l'onglet Auto (`null` = aucun document scanné). */
  lotActifId: string | null;
  /** Onglet Manuel : saisie clavier (1 acte vierge ou plus). */
  manuel: { actes: ActeAnalyse[] | null; indexActe: number };
}

export type Moteur = "indexeddb" | "localstorage" | "localstorage-allege" | "aucun";

export interface RapportStockage {
  moteur: Moteur;
  avertissement: string | null;
}

export const etatVide = (): BrouillonScan => ({
  version: VERSION,
  mode: "auto",
  lots: [],
  lotActifId: null,
  manuel: { actes: null, indexActe: 0 },
});

export const nouveauIdLot = (): string =>
  `lot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Un lot est « à assigner » tant qu'un acte n'a aucune direction cochée. */
export function actesSansBU(lot: LotScan): number {
  return lot.actes.filter((a) => a.departementsResponsables.length === 0).length;
}

export function totalSansBU(etat: BrouillonScan): number {
  return etat.lots.reduce((s, l) => s + actesSansBU(l), 0);
}

/** Copie allégée : transcription tronquée — l'assignation et les 20 autres colonnes sont intactes. */
function versionLegere(etat: BrouillonScan): BrouillonScan {
  return {
    ...etat,
    lots: etat.lots.map((l) => ({
      ...l,
      actes: l.actes.map((a) => (a.contenu.length > 2000 ? { ...a, contenu: `${a.contenu.slice(0, 2000)}…` } : a)),
    })),
    manuel: {
      ...etat.manuel,
      actes: etat.manuel.actes?.map((a) =>
        a.contenu.length > 2000 ? { ...a, contenu: `${a.contenu.slice(0, 2000)}…` } : a,
      ) ?? null,
    },
  };
}

/** Copie minimale : sans transcription du tout (dernier filet anti-quota). */
function versionMinimale(etat: BrouillonScan): BrouillonScan {
  return {
    ...etat,
    lots: etat.lots.map((l) => ({ ...l, actes: l.actes.map((a) => ({ ...a, contenu: "" })) })),
    manuel: { ...etat.manuel, actes: etat.manuel.actes?.map((a) => ({ ...a, contenu: "" })) ?? null },
  };
}

function idbDisponible(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const requete = window.indexedDB.open(BASE, 1);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN);
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error ?? new Error("IndexedDB indisponible"));
    requete.onblocked = () => rejeter(new Error("IndexedDB bloquée"));
  });
}

function transaction<T>(mode: IDBTransactionMode, action: (magasin: IDBObjectStore) => IDBRequest): Promise<T> {
  return ouvrirBase().then(
    (db) =>
      new Promise<T>((resoudre, rejeter) => {
        const tx = db.transaction(MAGASIN, mode);
        const requete = action(tx.objectStore(MAGASIN));
        requete.onsuccess = () => resoudre(requete.result as T);
        requete.onerror = () => rejeter(requete.error ?? new Error("Écriture IndexedDB refusée"));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Migration du brouillon historique (un document unique par onglet) vers la liste de lots. */
function migrerAncienFormat(brut: string | null): BrouillonScan | null {
  if (!brut) return null;
  try {
    const ancien = JSON.parse(brut) as {
      mode?: ModeSaisie;
      auto?: { actes?: unknown; indexActe?: unknown; meta?: unknown; source?: unknown; fileName?: unknown };
      manuel?: { actes?: unknown; indexActe?: unknown };
    };
    const etat = etatVide();
    if (ancien.mode === "auto" || ancien.mode === "manuel") etat.mode = ancien.mode;
    const actes = Array.isArray(ancien.auto?.actes) ? (ancien.auto.actes as ActeAnalyse[]) : null;
    if (actes && actes.length > 0) {
      const lot: LotScan = {
        id: nouveauIdLot(),
        fileName: typeof ancien.auto?.fileName === "string" ? ancien.auto.fileName : "Document antérieur",
        mimeType: "application/pdf",
        taille: 0,
        dateScan: new Date().toISOString(),
        source: ancien.auto?.source === "gemini" || ancien.auto?.source === "simulation" ? ancien.auto.source : null,
        meta: (ancien.auto?.meta as Record<string, number> | null) ?? null,
        avertissement: null,
        actes,
        indexActe: typeof ancien.auto?.indexActe === "number" ? ancien.auto.indexActe : 0,
      };
      etat.lots = [lot];
      etat.lotActifId = lot.id;
    }
    const actesManuel = Array.isArray(ancien.manuel?.actes) ? (ancien.manuel.actes as ActeAnalyse[]) : null;
    etat.manuel = {
      actes: actesManuel,
      indexActe: typeof ancien.manuel?.indexActe === "number" ? ancien.manuel.indexActe : 0,
    };
    return etat;
  } catch {
    return null;
  }
}

function lireLocalStorage(): BrouillonScan | null {
  if (typeof window === "undefined") return null;
  try {
    const nouveau = window.localStorage.getItem(`${BASE}-${CLE}`);
    if (nouveau) {
      const p = JSON.parse(nouveau) as BrouillonScan;
      if (Array.isArray(p?.lots)) return { ...etatVide(), ...p, version: VERSION };
    }
    return migrerAncienFormat(window.localStorage.getItem(CLE_ANCIENNE));
  } catch {
    return null;
  }
}

function ecrireLocalStorage(etat: BrouillonScan): boolean {
  try {
    window.localStorage.setItem(`${BASE}-${CLE}`, JSON.stringify(etat));
    return true;
  } catch {
    return false;
  }
}

/** Relit le travail en cours (jamais d'exception : l'écran doit toujours s'ouvrir). */
export async function chargerBrouillonScan(): Promise<{ etat: BrouillonScan; moteur: Moteur }> {
  if (idbDisponible()) {
    try {
      const valeur = await transaction<BrouillonScan | undefined>("readonly", (m) => m.get(CLE));
      if (valeur && Array.isArray(valeur.lots)) return { etat: { ...etatVide(), ...valeur }, moteur: "indexeddb" };
    } catch {
      /* IndexedDB indisponible (mode privé) : on tente localStorage */
    }
  }
  const ancien = lireLocalStorage();
  if (ancien) return { etat: ancien, moteur: "localstorage" };
  return { etat: etatVide(), moteur: "aucun" };
}

/**
 * Enregistre le travail en cours. Renvoie le moteur utilisé et, si le volume a
 * dû être allégé, un avertissement à afficher à l'utilisateur.
 */
export async function sauvegarderBrouillonScan(etat: BrouillonScan): Promise<RapportStockage> {
  const complet = { ...etat, version: VERSION };
  let avertissement: string | null = null;

  if (idbDisponible()) {
    try {
      await transaction("readwrite", (m) => m.put(complet, CLE));
      // Miroir allégé : si la base est effacée plus tard, le brouillon revient.
      ecrireLocalStorage(versionLegere(complet));
      return { moteur: "indexeddb", avertissement: null };
    } catch {
      /* on bascule sur localStorage */
    }
  }

  if (ecrireLocalStorage(complet)) return { moteur: "localstorage", avertissement: null };
  if (ecrireLocalStorage(versionLegere(complet))) {
    avertissement =
      "Stockage navigateur saturé : les documents scannés sont conservés, mais les transcriptions brutes ont été tronquées. Enregistrez les assignations avant de fermer.";
    return { moteur: "localstorage-allege", avertissement };
  }
  if (ecrireLocalStorage(versionMinimale(complet))) {
    avertissement =
      "Stockage navigateur très saturé : les actes et leurs assignations sont conservés, mais les transcriptions brutes ne le sont pas. Enregistrez les assignations avant de fermer.";
    return { moteur: "localstorage-allege", avertissement };
  }
  return {
    moteur: "aucun",
    avertissement:
      "Conservation impossible dans ce navigateur : vos scans ne seront PAS conservés si vous quittez la page. Enregistrez les assignations tout de suite, ou autorisez le stockage du site.",
  };
}

/** Effacement explicite (bouton « Tout supprimer ») — jamais appelé automatiquement. */
export async function viderBrouillonScan(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(`${BASE}-${CLE}`);
      window.localStorage.removeItem(CLE_ANCIENNE);
    } catch {
      /* rien à faire */
    }
  }
  if (idbDisponible()) {
    try {
      await transaction("readwrite", (m) => m.delete(CLE));
    } catch {
      /* rien à faire */
    }
  }
}
