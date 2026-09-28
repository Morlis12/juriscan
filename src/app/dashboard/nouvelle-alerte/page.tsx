"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DepartementCode, NatureTexte } from "@/domain/veille";
import { DEPARTEMENT_CODES, NATURES_TEXTE, PERTINENCE_TRANSIT } from "@/domain/veille";
import {
  DEPARTEMENT_OPTIONS,
  creerAlerteVierge,
  numeroterActes,
  type ActeAnalyse,
  type AlerteAnalyse21,
} from "@/domain/nouvelle-alerte";
import { peutCreerAlerte } from "@/domain/acces";
import { SelecteurBUConnectee, entetesAuteur, useBuConnectee } from "@/components/ContexteBU";
import { LogoAGL } from "@/components/LogoAGL";
import { NavOnglets } from "@/components/NavOnglets";
import {
  actesSansBU,
  chargerBrouillonScan,
  etatVide,
  nouveauIdLot,
  sauvegarderBrouillonScan,
  viderBrouillonScan,
  type BrouillonScan,
  type LotScan,
  type ModeSaisie,
} from "@/lib/brouillon-scan";

/** Un acte du tableau `{ actes }` renvoyé par POST /api/analyse (noms existants). */
interface ApiAnalyseActe {
  numeroOrdre?: string;
  qssfte?: string;
  natureTexte?: string;
  referenceTexte?: string;
  article?: string;
  resumeTexte?: string;
  libelleApplicable?: string;
  /** Transcription brute complète (copie exacte, jamais un résumé). */
  contenu?: string;
  lienHypertexte?: string;
  dateEntreeVigueur?: string;
  moyenCommunication?: string;
  applicableAGLCI?: boolean;
  departementResponsable?: string;
  departementsResponsables?: string[];
  statutConformite?: string;
  /** Recommandation IA : BU la plus probable. */
  propositionBU?: string;
  /** Pertinence transit/logistique déduite par l'IA (vide = non renseignée). */
  pertinenceTransit?: string;
}

interface ApiAnalyseMeta {
  tranches?: number;
  tranchesEchouees?: number;
  actesBruts?: number;
  actesRetenus?: number;
  objetsIgnores?: number;
}

function texteOu(v: unknown, repli: string): string {
  return typeof v === "string" && v.trim() !== "" ? v : repli;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

function formatTaille(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

/**
 * Encodage Base64 côté navigateur (FileReader) : seul du texte sérialisable
 * transite en JSON vers POST /api/analyse — aucun objet File / binaire brut.
 */
function fichierVersBase64Pur(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const url = typeof lecteur.result === "string" ? lecteur.result : "";
      const pur = url.includes(",") ? url.split(",")[1] : "";
      if (!pur) reject(new Error("Impossible de lire le document."));
      else resolve(pur);
    };
    lecteur.onerror = () => reject(new Error("Impossible de lire le document."));
    lecteur.readAsDataURL(f);
  });
}

export default function NouvelleAlertePage() {
  const router = useRouter();
  const { bu: buConnectee, email: emailConnecte } = useBuConnectee();
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /**
   * Travail en cours — JAMAIS perdu : onglet Auto = une liste de lots (un par
   * document déposé et scanné), onglet Manuel = saisie clavier. Tout est
   * persisté (IndexedDB) à chaque modification : changer d'onglet, quitter la
   * page, revenir le lendemain, déposer un nouveau document… rien ne s'efface.
   * Un lot ne disparaît qu'après un enregistrement réussi ou une suppression
   * demandée — un scan IA coûte des tokens, il est hors de question de le
   * perdre.
   */
  const [etat, setEtat] = useState<BrouillonScan>(etatVide);
  /** File d'attente des documents à analyser (les fichiers, eux, ne sont pas persistés). */
  const [aAnalyser, setAAnalyser] = useState<File[]>([]);
  /** Analyse en cours : index/total/nom pour afficher la progression. */
  const [progression, setProgression] = useState<{ position: number; total: number; nom: string } | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Conservation dégradée (quota navigateur) : on le dit, on ne le cache pas. */
  const [infoStockage, setInfoStockage] = useState<string | null>(null);
  const [reprise, setReprise] = useState<{ nb: number; sansBU: number } | null>(null);

  const mode = etat.mode;
  const loading = progression !== null;
  const lot = etat.lots.find((l) => l.id === etat.lotActifId) ?? null;
  const avertissement = lot?.avertissement ?? null;

  // Restauration au montage, puis persistance de chaque modification.
  const restaure = useRef(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const r = await chargerBrouillonScan();
        // Saisie manuelle retrouvée vide : un acte vierge prêt au clavier.
        const manuel =
          r.etat.mode === "manuel" && !r.etat.manuel.actes
            ? { ...r.etat.manuel, actes: numeroterActes([creerAlerteVierge()]) }
            : r.etat.manuel;
        const e: BrouillonScan = { ...r.etat, manuel };
        setEtat(e);
        // Bandeau de reprise : les scans retrouvés sont annoncés explicitement.
        if (e.lots.length > 0) {
          setReprise({
            nb: e.lots.length,
            sansBU: e.lots.reduce((s, l) => s + actesSansBU(l), 0),
          });
        }
        restaure.current = true;
      })();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!restaure.current) return;
    const t = setTimeout(() => {
      void sauvegarderBrouillonScan(etat).then((rapport) => {
        setInfoStockage(rapport.avertissement);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [etat]);

  /* Onglet Auto : le lot affiché. Onglet Manuel : la saisie clavier. */
  const actes: ActeAnalyse[] | null =
    mode === "auto" ? lot?.actes ?? null : etat.manuel.actes;
  const indexActe = mode === "auto" ? lot?.indexActe ?? 0 : etat.manuel.indexActe;
  const meta = lot?.meta ?? null;
  const source = lot?.source ?? null;
  const acte =
    actes && actes.length > 0 ? actes[Math.min(indexActe, actes.length - 1)] : null;
  const nbAvecBU = actes
    ? actes.filter((a) => a.departementsResponsables.length > 0).length
    : 0;
  const nbFiches = actes
    ? actes.reduce((s, a) => s + a.departementsResponsables.length, 0)
    : 0;
  const nbLotsRestants = etat.lots.filter((l) => l.id !== lot?.id && actesSansBU(l) > 0).length;

  type Maj<T> = T | ((prev: T) => T);
  function resoudre<T>(v: Maj<T>, prev: T): T {
    return typeof v === "function" ? (v as (p: T) => T)(prev) : v;
  }
  /** Actes de l'onglet affiché (lot scanné en Auto, saisie clavier en Manuel). */
  function setActes(v: Maj<ActeAnalyse[] | null>) {
    setEtat((prev) => {
      if (prev.mode === "manuel") {
        return { ...prev, manuel: { ...prev.manuel, actes: resoudre(v, prev.manuel.actes) } };
      }
      return {
        ...prev,
        lots: prev.lots.map((l) =>
          l.id === prev.lotActifId ? { ...l, actes: resoudre(v, l.actes) ?? [] } : l
        ),
      };
    });
  }
  function setIndexActe(v: Maj<number>) {
    setEtat((prev) => {
      if (prev.mode === "manuel") {
        return { ...prev, manuel: { ...prev.manuel, indexActe: resoudre(v, prev.manuel.indexActe) } };
      }
      return {
        ...prev,
        lots: prev.lots.map((l) =>
          l.id === prev.lotActifId ? { ...l, indexActe: resoudre(v, l.indexActe) } : l
        ),
      };
    });
  }
  function setMode(m: ModeSaisie) {
    setEtat((prev) => {
      // Saisie libre jamais commencée : un acte vierge, prêt au clavier.
      const manuel =
        m === "manuel" && !prev.manuel.actes
          ? { ...prev.manuel, actes: numeroterActes([creerAlerteVierge()]) }
          : prev.manuel;
      // Bascule Auto sans document scanné et des lots en attente : on ouvre le
      // plus récent plutôt que d'afficher un écran vide.
      const lotActifId =
        m === "auto" && !prev.lotActifId && prev.lots.length > 0
          ? prev.lots[prev.lots.length - 1].id
          : prev.lotActifId;
      return { ...prev, mode: m, manuel, lotActifId };
    });
    setErreur(null);
    // Chaque onglet garde son travail : rien n'est effacé en basculant.
  }

  /** Ouvre un lot scanné (sans jamais le supprimer). */
  function ouvrirLot(id: string) {
    setEtat((prev) => ({ ...prev, mode: "auto", lotActifId: id }));
    setErreur(null);
    setMessage(null);
  }
  /** Suppression explicite d'un lot (donc d'un scan payé) : confirmation requise. */
  function supprimerLot(id: string) {
    const cible = etat.lots.find((l) => l.id === id);
    if (!cible) return;
    if (
      !window.confirm(
        `Supprimer définitivement « ${cible.fileName} » ?
\n${cible.actes.length} acte(s) extrait(s) seront perdus. Cette action est irréversible.`
      )
    ) {
      return;
    }
    setEtat((prev) => {
      const lots = prev.lots.filter((l) => l.id !== id);
      return {
        ...prev,
        lots,
        lotActifId: prev.lotActifId === id ? lots[lots.length - 1]?.id ?? null : prev.lotActifId,
      };
    });
  }
  /** Suppression globale : ne concerne que les scans non enregistrés. */
  async function toutSupprimer() {
    if (!window.confirm("Effacer tous les documents scannés non enregistrés ? Cette action est irréversible.")) {
      return;
    }
    setEtat((prev) => ({ ...prev, lots: [], lotActifId: null }));
    await viderBrouillonScan();
    setReprise(null);
    setMessage(null);
  }

  /**
   * Filet de sécurité : on prévient avant de quitter la page s'il reste des
   * documents scannés non assignés. (Le travail est conservé dans le
   * navigateur — ce n'est qu'une garde-fou contre une fermeture accidentelle.)
   */
  useEffect(() => {
    if (!restaure.current || saving) return;
    const enAttente =
      etat.lots.some((l) => actesSansBU(l) > 0) ||
      (etat.mode === "manuel" &&
        (etat.manuel.actes?.length ?? 0) > 0 &&
        etat.manuel.actes?.some((a) => a.departementsResponsables.length === 0));
    if (!enAttente) return;
    const surFermeture = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", surFermeture);
    return () => window.removeEventListener("beforeunload", surFermeture);
  }, [etat, saving]);

  /** Aperçu du panneau « Texte extrait » pour l'acte affiché. */
  function apercuActe(a: ActeAnalyse): string {
    return [
      `—— Analyse IA AGL JuriCompliance : ${lot?.fileName ?? "saisie manuelle"} ——`,
      "",
      `Acte ${a.idActe + 1}/${actes?.length ?? 1} · ${a.numeroOrdre || "N° à attribuer"}`,
      `Nature déduite : ${a.natureTexte || "—"}`,
      `Référence : ${a.referenceTexte}`,
      `Article : ${a.article || "—"}`,
      `Résumé : ${a.resumeTexte}`,
      "",
      `Libellé applicable : ${a.libelleApplicable}`,
      ...(a.contenu
        ? [`Texte brut : ${a.contenu.length} caractères transcrits (voir champ 10)`]
        : []),
      ...(a.propositionBU ? [`BU recommandée par l'IA : ${a.propositionBU}`] : []),
    ].join("\n");
  }

  /**
   * Ajoute des documents à la file d'attente. NE SUPPRIME RIEN : les lots déjà
   * scannés (et donc payés) restent intacts, y compris le lot affiché.
   */
  function ajouterFichiers(liste: (File | undefined)[]) {
    const refus: string[] = [];
    const acceptes: File[] = [];
    for (const f of liste) {
      if (!f) continue;
      const ok =
        f.type === "application/pdf" ||
        f.type.startsWith("image/") ||
        /\.(pdf|png|jpe?g|webp)$/i.test(f.name);
      if (ok) acceptes.push(f);
      else refus.push(f.name);
    }
    setErreurFichier(
      refus.length > 0
        ? `Format non pris en charge (ignorés) : ${refus.join(", ")} — PDF, PNG, JPG ou WEBP uniquement.`
        : null,
    );
    if (acceptes.length > 0) {
      setErreur(null);
      setMessage(null);
      setAAnalyser((prev) => [...prev, ...acceptes]);
    }
  }

  /** Fichiers de la session (non persistables) : permettent de relancer un scan. */
  const fichiersEnMemoire = useRef(new Map<string, File>());

  /** Relance l'analyse du document affiché si le fichier est encore en mémoire. */
  function relancerLot() {
    if (!lot) return;
    const f = fichiersEnMemoire.current.get(lot.fileName);
    if (!f) {
      setErreur(
        `« ${lot.fileName} » n'est plus disponible (page rechargée) : re-déposez-le ci-dessus pour relancer l'analyse. Vos actes et vos assignations actuelles sont conservés entre-temps.`
      );
      inputRef.current?.click();
      return;
    }
    void analyserFichiers([f]);
  }

  /** Charge un fichier d'exemple intégré au projet (JO n°53) pour tester l'analyse. */
  async function chargerExemple(kind: "pdf" | "image") {
    setErreur(null);
    try {
      const url = kind === "pdf" ? "/exemples/53.pdf" : "/exemples/53-image-test.png";
      const nom = kind === "pdf" ? "53.pdf" : "53-image-test.png";
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error("Exemple introuvable.");
      const blob = await reponse.blob();
      const fichier = new File([blob], nom, {
        type: blob.type || (kind === "pdf" ? "application/pdf" : "image/png"),
      });
      setAAnalyser((prev) => [...prev, fichier]);
      // Un exemple se lance immédiatement : c'est un raccourci de démonstration.
      void analyserFichiers([fichier]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de charger l'exemple.");
    }
  }

  /**
   * Analyse un ou plusieurs documents, l'un après l'autre.
   *
   * Séquentiel et non parallèle, volontairement : chaque JO déclenche des
   * tranches de pages en parallèle côté API (donc des tokens), l'enchaîner évite
   * de déclencher des quotas d'API d'un coup et permet de voir où l'on en est.
   * Chaque document réussi devient un lot indépendant : un échec n'annule pas
   * les documents déjà analysés.
   */
  async function analyserFichiers(liste?: File[]) {
    const aTraiter = liste ?? aAnalyser;
    for (const f of aTraiter) fichiersEnMemoire.current.set(f.name, f);
    if (aTraiter.length === 0) {
      setErreur("Déposez d'abord un ou plusieurs PDF (ex. Journal Officiel de Côte d'Ivoire) ou images.");
      return;
    }
    if (progression) return;
    setErreur(null);
    setErreurFichier(null);
    setMessage(null);
    setReprise(null);
    let reussis = 0;
    let echecs = 0;
    for (let i = 0; i < aTraiter.length; i++) {
      const fichier = aTraiter[i];
      setProgression({ position: i + 1, total: aTraiter.length, nom: fichier.name });
      const lot = await analyserUnFichier(fichier);
      if (!lot) {
        echecs += 1;
        continue;
      }
      reussis += 1;
      // Nouveau lot ajouté ET rendu actif : on continue immédiatement sur le
      // suivant document, la liste reste visible à gauche.
      setEtat((prev) => ({ ...prev, lots: [...prev.lots, lot], lotActifId: lot.id }));
    }
    setProgression(null);
    setAAnalyser([]);
    if (echecs > 0) {
      setErreur(
        `${echecs} document(s) non analysé(s) — voir le message ci-dessus. Les ${reussis} autre(s) sont conservés : rien n'est perdu.`
      );
    } else if (reussis > 1) {
      setMessage(
        `✅ ${reussis} documents analysés en un seul passage. Assignez-les puis enregistrez chaque lot.`
      );
    }
  }

  /** Analyse un document et renvoie le lot correspondant (null en cas d'échec). */
  async function analyserUnFichier(fichier: File): Promise<LotScan | null> {
    try {
      // Base64 navigateur → POST JSON /api/analyse (aucun binaire côté serveur Next).
      const base64Data = await fichierVersBase64Pur(fichier);
      const mimeType = fichier.type || "application/pdf";
      const reponse = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data, mimeType, fileName: fichier.name }),
      });
      const payload = (await reponse.json()) as {
        success?: boolean;
        data?: { actes?: ApiAnalyseActe[] };
        source?: "gemini" | "simulation";
        meta?: ApiAnalyseMeta;
        avertissement?: string;
        error?: string;
      };
      if (!reponse.ok || !payload.success || !payload.data || !Array.isArray(payload.data.actes)) {
        setErreur(
          `${fichier.name} : ${payload.error || "échec de l'analyse IA."}`
        );
        return null;
      }
      // Zéro mock : actes IA réels + base vierge ; la conformité part à 0 % côté BU.
      // Chaque acte garde ses 12 champs + pertinence ; la recommandation BU
      // pré-coche les BU — le juridique reste décideur (workflow).
      const socle = creerAlerteVierge();
      const normalises: AlerteAnalyse21[] = payload.data.actes.map((d) => {
        const buRecommandee = [d.propositionBU].find((v) =>
          (DEPARTEMENT_CODES as string[]).includes(v ?? ""),
        );
        const bus = Array.isArray(d.departementsResponsables)
          ? d.departementsResponsables.filter((v) =>
              (DEPARTEMENT_CODES as string[]).includes(v ?? ""),
            )
          : [];
        const coches = (buRecommandee ? [buRecommandee, ...bus] : bus).filter(
          (v, i, arr) => arr.indexOf(v) === i,
        ) as DepartementCode[];
        const pertinence = (
          (PERTINENCE_TRANSIT as readonly string[]).includes(d.pertinenceTransit ?? "")
            ? d.pertinenceTransit
            : ""
        ) as AlerteAnalyse21["pertinenceTransit"];
        return {
          ...socle,
          applicableAGLCI:
            pertinence === "Hors périmètre" ? false : socle.applicableAGLCI,
          pertinenceTransit: pertinence,
          numeroOrdre: texteOu(d.numeroOrdre, ""),
          qssfte: texteOu(d.qssfte, ""),
          natureTexte: texteOu(d.natureTexte, ""),
          referenceTexte: texteOu(d.referenceTexte, ""),
          article: texteOu(d.article, ""),
          resumeTexte: texteOu(d.resumeTexte, ""),
          libelleApplicable: texteOu(d.libelleApplicable, ""),
          lienHypertexte: "",
          dateEntreeVigueur: texteOu(d.dateEntreeVigueur, ""),
          contenu: texteOu(d.contenu, ""),
          moyenCommunication: "",
          propositionBU: (buRecommandee ?? "") as AlerteAnalyse21["propositionBU"],
          departementResponsable: (buRecommandee ??
            socle.departementResponsable) as DepartementCode,
          departementsResponsables: coches,
          statutConformite: socle.statutConformite,
          libelleAction: "",
        };
      });
      if (normalises.length === 0) {
        setErreur(
          `${fichier.name} : aucun acte détecté dans ce document. Vérifiez le fichier ou saisissez manuellement.`
        );
        return null;
      }
      return {
        id: nouveauIdLot(),
        fileName: fichier.name,
        mimeType,
        taille: fichier.size,
        dateScan: new Date().toISOString(),
        source: payload.source ?? "gemini",
        meta: (payload.meta ?? null) as Record<string, number> | null,
        avertissement: payload.avertissement ?? null,
        actes: numeroterActes(normalises),
        indexActe: 0,
      };
    } catch (e) {
      setErreur(
        `${fichier.name} : ${e instanceof Error ? e.message : "échec de l'analyse IA."}`
      );
      return null;
    }
  }

  async function enregistrerFiche() {
    if (!actes) return;
    if (!peutCreerAlerte(buConnectee)) {
      setErreur(`Création / assignation : réservée à la centrale (vous êtes ${buConnectee}). Basculez la BU connectée en haut vers CENTRAL_VRG.`);
      return;
    }
    // Seuls les actes avec au moins une BU cochée partent (les autres —
    // dont les « Hors périmètre » non assignés — sont ignorés avec message).
    const aEnregistrer = actes.filter((a) => a.departementsResponsables.length > 0);
    if (aEnregistrer.length === 0) {
      setErreur("Cochez au moins une BU responsable sur au moins un acte avant d'enregistrer.");
      return;
    }
    setSaving(true);
    setErreur(null);
    setMessage(null);
    try {
      // Persistant : N textes + BU cochées → N alertes (une fiche par BU).
      const reponse = await fetch("/api/sauvegarde", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...entetesAuteur(buConnectee, emailConnecte) },
        body: JSON.stringify({
          // idActe/valide sont des champs d'écran, ignorés par le serveur.
          actes: aEnregistrer,
          buConnectee,
          emailConnecte,
        }),
      });
      const payload = (await reponse.json().catch(() => null)) as {
        success?: boolean;
        data?: { creees?: { numeroOrdre: string }[]; ignorees?: string[] };
        error?: string;
      } | null;
      if (!reponse.ok || !payload?.success || !payload.data) {
        setErreur(payload?.error || "Échec de l'enregistrement en base.");
        return;
      }
      const { creees = [], ignorees = [] } = payload.data;
      if (ignorees.length > 0) {
        // Reste sur l'écran pour corriger : liste les actes ignorés et pourquoi.
        // Le lot est conservé (rien n'est perdu), l'utilisateur peut rejouer
        // l'enregistrement après correction.
        setMessage(
          `✅ ${creees.length} texte(s) enregistré(s) (${creees.map((c) => c.numeroOrdre).join(", ")}). Ignorés : ${ignorees.join(" · ")}`
        );
        return;
      }
      // Enregistrement réussi : on ne retire QUE le lot concerné. Les autres
      // documents scannés restent intacts — un scan payé ne disparaît jamais.
      setEtat((prev) => {
        if (prev.mode === "manuel") {
          return { ...prev, manuel: { actes: null, indexActe: 0 } };
        }
        const reste = prev.lots.filter((l) => l.id !== prev.lotActifId);
        return {
          ...prev,
          lots: reste,
          lotActifId: reste[reste.length - 1]?.id ?? null,
        };
      });
      setReprise(null);
      if (nbLotsRestants > 0) {
        // D'autres documents attendent : on reste, pas de redirection.
        setMessage(
          `✅ ${creees.length} texte(s) enregistré(s) (${creees.map((c) => c.numeroOrdre).join(", ")}). Il reste ${nbLotsRestants} document(s) scanné(s) à assigner : ils sont conservés, enchaînez quand vous voulez.`
        );
        return;
      }
      // Redirection opérationnelle : les fiches rejoignent leurs BU.
      router.push("/dashboard");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement en base.");
    } finally {
      setSaving(false);
    }
  }

  /** Modifie un champ de l'acte affiché (« Acte X / N »). */
  function set<K extends keyof AlerteAnalyse21>(key: K, value: AlerteAnalyse21[K]) {
    if (!acte) return;
    const id = acte.idActe;
    setActes((prev) =>
      prev ? prev.map((a) => (a.idActe === id ? { ...a, [key]: value } : a)) : prev,
    );
  }

  /** Coche / décoche une BU pour l'acte affiché (un texte peut concerner plusieurs BU). */
  function basculerBU(code: DepartementCode) {
    if (!acte) return;
    const id = acte.idActe;
    setActes((prev) => {
      if (!prev) return prev;
      return prev.map((a) => {
        if (a.idActe !== id) return a;
        const cochees = a.departementsResponsables.includes(code)
          ? a.departementsResponsables.filter((c) => c !== code)
          : [...a.departementsResponsables, code];
        return {
          ...a,
          departementsResponsables: cochees,
          // La première BU cochée reste l'assignation principale (compatibilité).
          departementResponsable: cochees[0] ?? a.departementResponsable,
        };
      });
    });
  }

  /** Valide la ligne (BU cochées requises) et avance vers l'acte suivant du lot. */
  function validerActe() {
    if (!acte || !actes) return;
    if (acte.departementsResponsables.length === 0) {
      setErreur(
        `Acte ${acte.idActe + 1}/${actes.length} : cochez au moins une BU pour valider la ligne (sinon laissez-le, il sera ignoré à l'enregistrement).`,
      );
      return;
    }
    setErreur(null);
    const id = acte.idActe;
    setActes((prev) =>
      prev ? prev.map((a) => (a.idActe === id ? { ...a, valide: true } : a)) : prev,
    );
    if (id < actes.length - 1) {
      setIndexActe(id + 1);
    } else {
      setMessage(`Dernier acte validé — vérifiez le lot puis « Enregistrer ».`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* En-tête AGL */}
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoAGL />
            <div>
              <p className="text-lg font-bold leading-tight">Nouvelle alerte — Analyse IA AGL JuriCompliance</p>
              <p className="text-xs text-slate-300">
                Dépôt manuel aujourd&apos;hui · captation Outlook / Power Automate demain
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NavOnglets actif="assignation" />
            <span aria-hidden="true" className="hidden h-6 w-px bg-white/20 sm:block" />
            <SelecteurBUConnectee />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {/* Sélecteur de parcours */}
        <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Mode de saisie">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "auto"}
            onClick={() => setMode("auto")}
            className={`rounded-xl border-2 px-5 py-3 text-sm font-bold shadow-sm transition-colors ${
              mode === "auto"
                ? "border-brand-gold bg-brand-blue text-white"
                : "border-slate-200 bg-white text-brand-blue hover:border-brand-blue"
            }`}
          >
            ✨ Analyse Automatique par PDF
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "manuel"}
            onClick={() => setMode("manuel")}
            className={`rounded-xl border-2 px-5 py-3 text-sm font-bold shadow-sm transition-colors ${
              mode === "manuel"
                ? "border-brand-gold bg-brand-blue text-white"
                : "border-slate-200 bg-white text-brand-blue hover:border-brand-blue"
            }`}
          >
            ✍️ Saisie Manuelle Libre
          </button>
        </div>

        {reprise && (
          <div className="rounded-xl border-2 border-brand-gold bg-brand-gold/10 px-4 py-3">
            <p className="text-sm font-bold text-brand-blue">
              ♻️ Reprise : {reprise.nb} document(s) scanné(s) vous attendent
            </p>
            <p className="mt-1 text-xs text-brand-blue">
              {reprise.sansBU > 0
                ? `${reprise.sansBU} acte(s) restent sans direction assignée. Ils sont conservés : vous pouvez quitter cette page, changer d'onglet ou revenir plus tard, rien ne sera perdu.`
                : "Toutes les directions sont cochées : vous pouvez enregistrer quand vous le souhaitez."}{" "}
              Un document n&apos;est retiré de cette liste qu&apos;après un enregistrement
              réussi.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const dernier = etat.lots[etat.lots.length - 1];
                  if (dernier) ouvrirLot(dernier.id);
                }}
                className="rounded-full bg-brand-blue px-4 py-1.5 text-xs font-bold text-white shadow transition-colors hover:bg-brand-blue/90"
              >
                Reprendre l&apos;assignation →
              </button>
              <button
                type="button"
                onClick={() => void toutSupprimer()}
                className="rounded-full border border-brand-blue/40 px-4 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
              >
                Tout supprimer
              </button>
            </div>
          </div>
        )}

        {infoStockage && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
            ⚠ {infoStockage}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Colonne gauche : dépôt + extraction */}
        <section className="space-y-4">
          {mode === "manuel" ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-brand-blue">1 · Saisie libre au clavier</h2>
              <p className="mt-1 text-xs text-slate-500">
                Aucun document requis : renseignez le texte et cochez les BU
                concernées dans le panneau de droite.
              </p>
              <ol className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-bold text-brand-blue">1.</span> Saisissez le N° d&apos;ordre, la nature, la référence et le résumé.
                </li>
                <li className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-bold text-brand-blue">2.</span> Cochez les BU concernées (une fiche part chez chacune).
                </li>
                <li className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-bold text-brand-blue">3.</span> Cliquez sur « 💾 Enregistrer » (un N° d&apos;ordre sera attribué).
                </li>
              </ol>
            </div>
          ) : (
          <>
          {etat.lots.length > 0 && (
            <div className="rounded-xl border border-brand-gold/40 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-brand-blue">
                    Documents scannés · conservés
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Chaque document scanné reste ici tant qu&apos;il n&apos;est pas
                    enregistré. Vous pouvez en deposit d&apos;autres, revenir plus tard,
                    ou passer sur l&apos;onglet manuel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toutSupprimer()}
                  className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-red-400 hover:text-red-600"
                >
                  Tout supprimer
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {etat.lots.map((l) => {
                  const sansBU = actesSansBU(l);
                  const actif = l.id === etat.lotActifId;
                  return (
                    <li
                      key={l.id}
                      className={`rounded-lg border px-3 py-2 ${
                        actif
                          ? "border-brand-blue bg-brand-blue/5"
                          : "border-slate-200 bg-white hover:border-brand-blue/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-brand-blue">
                            {l.fileName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {l.actes.length} acte(s) ·{" "}
                            {l.actes.reduce(
                              (s2, a) => s2 + a.departementsResponsables.length,
                              0,
                            )}{" "}
                            assignation(s) · scanné le{" "}
                            {new Date(l.dateScan).toLocaleString("fr-FR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            sansBU > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {sansBU > 0 ? `${sansBU} à assigner` : "prêt"}
                        </span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {!actif && (
                          <button
                            type="button"
                            onClick={() => ouvrirLot(l.id)}
                            className="rounded-full bg-brand-blue px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-brand-blue/90"
                          >
                            Ouvrir
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => supprimerLot(l.id)}
                          className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-red-400 hover:text-red-600"
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-brand-blue">
              1 · Charger {etat.lots.length > 1 ? "des documents" : "le document"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Glissez un ou plusieurs PDF (ex. Journal Officiel de Côte d&apos;Ivoire du
              9 juillet 2026) ou des images brutes — ils sont analysés dans l&apos;ordre.
            </p>

            <div
              role="button"
              tabIndex={0}
              aria-label="Zone de dépôt des documents à analyser"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                ajouterFichiers(Array.from(e.dataTransfer.files ?? []));
              }}
              className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragOver
                  ? "border-brand-gold bg-brand-gold/10"
                  : "border-slate-300 bg-slate-50 hover:border-brand-blue hover:bg-brand-blue/5"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue text-xl text-white">
                ⇪
              </span>
              <p className="mt-3 text-sm font-semibold text-brand-blue">
                Glisser-déposer un ou plusieurs PDF / images
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ou cliquez pour parcourir — PDF, PNG, JPG, WEBP (sélection multiple)
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  ajouterFichiers(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>

            {aAnalyser.length > 0 && (
              <div className="mt-3 rounded-lg border border-brand-blue/20 bg-brand-blue/5 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-brand-blue">
                    {aAnalyser.length} document(s) prêt(s) à scanner
                  </p>
                  <button
                    type="button"
                    onClick={() => setAAnalyser([])}
                    className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                  >
                    Tout retirer
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {aAnalyser.map((f, i) => (
                    <li
                      key={`${f.name}-${f.size}-${i}`}
                      className="flex items-center justify-between gap-2 rounded bg-white/70 px-2 py-1 text-[11px] text-slate-600"
                    >
                      <span className="truncate">
                        {progression && progression.nom === f.name ? "⟳ " : ""}
                        {f.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-slate-400">{formatTaille(f.size)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setAAnalyser((prev) => prev.filter((autre, j) => j !== i))
                          }
                          className="rounded px-1 font-medium text-red-600 hover:bg-red-50"
                          aria-label={`Retirer ${f.name}`}
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {erreurFichier && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                {erreurFichier}
              </p>
            )}

            {erreur && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{erreur}</p>
            )}

            {progression && (
              <div className="mt-3 rounded-lg border border-brand-gold/60 bg-brand-gold/10 px-3 py-2 text-xs text-brand-blue">
                <p className="font-semibold">
                  Analyse {progression.position}/{progression.total} — {progression.nom}
                </p>
                <p className="mt-1">
                  Document en cours de lecture. Le résultat est conservé dès la fin de
                  cette analyse, même si vous quittez la page ensuite.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => void analyserFichiers()}
              disabled={aAnalyser.length === 0 || loading}
              className="mt-4 w-full rounded-xl bg-brand-blue px-5 py-3 text-sm font-bold text-white shadow transition-all hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {progression
                ? `Analyse en cours… ${progression.position}/${progression.total}`
                : aAnalyser.length > 1
                  ? `Scanner les ${aAnalyser.length} documents d'un coup`
                  : "Lancer l'Analyse IA AGL JuriCompliance"}
            </button>
            <p className="mt-2 text-[11px] text-slate-500">
              Les documents sont analysés l&apos;un après l&apos;autre : plus lent, mais
              chaque résultat est conservé dès qu&apos;il arrive — un échec
              n&apos;annule pas les autres.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chargerExemple("pdf")}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
              >
                📄 Tester avec l&apos;exemple 53.pdf
              </button>
              <button
                type="button"
                onClick={() => chargerExemple("image")}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
              >
                🖼️ Tester avec l&apos;image d&apos;exemple
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Fichiers de test intégrés au projet — JO n°53 du 2 juillet 2026.
            </p>
            {loading && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-gold" />
              </div>
            )}
            <p className="mt-3 rounded-lg bg-brand-gold/15 px-3 py-2 text-[11px] leading-relaxed text-brand-blue">
              Votre document est analysé en toute sécurité : déposez le PDF ou
              l&apos;image, lancez l&apos;analyse, puis vérifiez les informations
              extraites avant d&apos;assigner le texte aux BU concernées.
            </p>
          </div>
          </>
          )}

          {mode === "auto" && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-brand-blue">Texte extrait (AGL JuriCompliance)</h2>
              {source && (
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    source === "gemini"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {source === "gemini" ? "● Analyse IA" : "● Extraction sécurisée"}
                </span>
              )}
            </div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
              {acte ? apercuActe(acte) : "— Lancez l'analyse pour voir l'extraction du document ici. —"}
            </pre>
            {actes && actes.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-brand-blue">
                {actes.length} acte{actes.length > 1 ? "s" : ""} détecté{actes.length > 1 ? "s" : ""}
                {meta?.tranches && meta.tranches > 1 ? ` (${meta.tranches} tranches analysées)` : ""}
                {" — "}acte {Math.min(indexActe, actes.length - 1) + 1}/{actes.length} affiché.
              </p>
            )}
            {avertissement && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                ⚠ {avertissement}
              </p>
            )}
          </div>
          )}
        </section>

        {/* Colonne droite : texte + assignation BU */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-brand-blue px-5 py-3">
            <h2 className="text-base font-bold text-white">
              {mode === "manuel"
                ? "2 · Saisie — texte et BU concernées"
                : "2 · Résultats — textes extraits et assignation BU"}
            </h2>
            {acte && actes && (
              <span className="flex flex-wrap items-center gap-1.5">
                {actes.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIndexActe((i) => Math.max(0, i - 1));
                        setMessage(null);
                      }}
                      disabled={indexActe === 0}
                      aria-label="Acte précédent"
                      className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-gold hover:text-brand-blue disabled:opacity-40"
                    >
                      ←
                    </button>
                    <select
                      value={Math.min(indexActe, actes.length - 1)}
                      onChange={(e) => {
                        setIndexActe(Number(e.target.value));
                        setMessage(null);
                      }}
                      aria-label="Choisir l'acte"
                      title="Choisir l'acte à relire et assigner"
                      className="max-w-64 truncate rounded-full bg-white/10 px-2 py-1 font-mono text-xs font-bold text-white outline-none [&>option]:text-slate-900"
                    >
                      {actes.map((a) => (
                        <option key={a.idActe} value={a.idActe}>
                          Acte {a.idActe + 1}/{actes.length} · {a.natureTexte || "?"} ·{" "}
                          {a.departementsResponsables.length > 0
                            ? a.departementsResponsables.join("+")
                            : "sans BU"}
                          {a.valide ? " ✓" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setIndexActe((i) => Math.min(actes.length - 1, i + 1));
                        setMessage(null);
                      }}
                      disabled={indexActe >= actes.length - 1}
                      aria-label="Acte suivant"
                      className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-gold hover:text-brand-blue disabled:opacity-40"
                    >
                      →
                    </button>
                  </>
                )}
                <span
                  className="rounded-full bg-brand-gold px-3 py-1 font-mono text-xs font-bold text-brand-blue"
                  title="N° d'ordre attribué à l'enregistrement (modifiable champ 01)"
                >
                  {acte.numeroOrdre || "N° à attribuer"}
                </span>
              </span>
            )}
          </div>

          {!acte ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              <p className="mx-auto max-w-sm">
                Aucun résultat pour l&apos;instant. Chargez un PDF puis cliquez sur{" "}
                <span className="font-semibold text-brand-blue">« Lancer l&apos;Analyse IA AGL JuriCompliance »</span>, ou
                basculez sur <span className="font-semibold text-brand-blue">« ✍️ Saisie Manuelle Libre »</span> : chaque
                acte détecté (N° d&apos;ordre, Nature, Référence, Résumé, Libellé applicable…) apparaîtra ici avec sa
                navigation « Acte X / N » et ses BU à cocher. La conformité (preuves, actions, statut, responsable,
                délai, taux) sera pilotée par chaque BU.
              </p>
            </div>
          ) : (
            <div className="space-y-6 px-5 py-5">
              <Bloc titre="Alerte — texte source (12 champs)">
                <Champ label="01 · N° d'ordre" value={acte.numeroOrdre} onChange={(v) => set("numeroOrdre", v)} mono />
                <Champ label="02 · QSSTE" value={acte.qssfte} onChange={(v) => set("qssfte", v)} mono />
                <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    03 · Nature du texte (déduite par l&apos;IA)
                  </span>
                  <select
                    value={NATURES_TEXTE.includes(acte.natureTexte as NatureTexte) ? acte.natureTexte : ""}
                    onChange={(e) => set("natureTexte", e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue focus:bg-white"
                  >
                    <option value="" disabled>
                      — Choisir la nature —
                    </option>
                    {NATURES_TEXTE.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                    {acte.natureTexte &&
                      !NATURES_TEXTE.includes(acte.natureTexte as NatureTexte) && (
                        <option value={acte.natureTexte}>
                          {acte.natureTexte}
                        </option>
                      )}
                  </select>
                </label>
                <Champ label="04 · Référence du texte" value={acte.referenceTexte} onChange={(v) => set("referenceTexte", v)} />
                <Champ label="05 · Article" value={acte.article} onChange={(v) => set("article", v)} />
                <Zone label="06 · Résumé du texte (IA)" value={acte.resumeTexte} onChange={(v) => set("resumeTexte", v)} />
                <Zone label="07 · Libellé / texte applicable en vigueur" value={acte.libelleApplicable} onChange={(v) => set("libelleApplicable", v)} />
                <Champ label="08 · Lien hypertexte" value={acte.lienHypertexte} onChange={(v) => set("lienHypertexte", v)} mono />
                <Champ label="09 · Date d'entrée en vigueur" type="date" value={acte.dateEntreeVigueur} onChange={(v) => set("dateEntreeVigueur", v)} />
                <Zone label="10 · Contenu brut extrait" value={acte.contenu} onChange={(v) => set("contenu", v)} compact />
                <Champ label="11 · Moyen de communication" value={acte.moyenCommunication} onChange={(v) => set("moyenCommunication", v)} />
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={acte.applicableAGLCI}
                    onChange={(e) => set("applicableAGLCI", e.target.checked)}
                    className="h-4 w-4 accent-[#1C3359]"
                  />
                  <span>
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      12 · Applicable à AGL CI
                    </span>
                    <span className="font-medium text-slate-800">{acte.applicableAGLCI ? "Oui" : "Non"}</span>
                  </span>
                </label>
              </Bloc>

              <Bloc titre="Assignation — BU responsables (une fiche par BU cochée)">
                {acte.pertinenceTransit && (
                  <p
                    className={`rounded-lg px-3 py-2 text-xs font-medium sm:col-span-2 ${
                      acte.pertinenceTransit === "Directe"
                        ? "bg-emerald-50 text-emerald-800"
                        : acte.pertinenceTransit === "Indirecte"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-red-50 text-red-800"
                    }`}
                  >
                    {acte.pertinenceTransit === "Hors périmètre"
                      ? "⛔ Texte hors périmètre transit/logistique — aucune BU recommandée. La centrale reste seule décideuse de l'assignation."
                      : `Pertinence transit : ${acte.pertinenceTransit} — recommandation IA, la centrale tranche.`}
                  </p>
                )}
                {acte.propositionBU && (
                  <p className="rounded-lg bg-brand-blue/5 px-3 py-2 text-xs font-medium text-brand-blue sm:col-span-2">
                    🤖 L&apos;IA recommande la BU :{" "}
                    <span className="font-bold">{acte.propositionBU}</span>
                    {" — "}un texte pouvant concerner plusieurs BU, cochez toutes
                    les BU concernées ci-dessous (une fiche part chez chacune).
                  </p>
                )}
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:col-span-2">
                  Le juridique assigne uniquement : preuves, actions, statut,
                  responsable, délai et taux d&apos;avancement sont pilotés par
                  chaque BU (approbation puis tableau de bord).
                </p>
                <fieldset className="rounded-lg border-2 border-brand-gold/60 bg-brand-gold/10 px-3 py-2 text-sm sm:col-span-2">
                  <legend className="bg-white px-2 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                    13 · BU responsables * ({acte.departementsResponsables.length} cochée
                    {acte.departementsResponsables.length > 1 ? "s" : ""})
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DEPARTEMENT_OPTIONS.map((d) => (
                      <label
                        key={d.code}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-brand-blue hover:border-brand-blue"
                      >
                        <input
                          type="checkbox"
                          checked={acte.departementsResponsables.includes(d.code)}
                          onChange={() => basculerBU(d.code)}
                          className="h-4 w-4 accent-[#1C3359]"
                        />
                        <span>
                          {d.code === "PATR_IMMO" ? "Patr Immo" : d.code}
                          <span className="block text-[10px] font-normal text-slate-500">
                            {d.label}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {acte.departementsResponsables.length === 0 && (
                    <p className="mt-2 text-xs font-medium text-red-600">
                      Cochez au moins une BU pour enregistrer la fiche.
                    </p>
                  )}
                </fieldset>
              </Bloc>

              {message && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  {message}
                </p>
              )}
              {acte.valide && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  ✓ Acte {acte.idActe + 1}/{actes?.length} validé — assigné à{" "}
                  {acte.departementsResponsables.join(", ")}.
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={validerActe}
                  className="flex-1 rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-blue shadow transition-colors hover:brightness-95"
                >
                  {actes && acte.idActe < actes.length - 1
                    ? `Valider et passer à l'acte ${acte.idActe + 2}/${actes.length} →`
                    : "✓ Valider la ligne"}
                </button>
                <button
                  type="button"
                  onClick={relancerLot}
                  disabled={loading}
                  className="rounded-xl border border-brand-blue px-5 py-2.5 text-sm font-semibold text-brand-blue transition-colors hover:bg-brand-blue hover:text-white disabled:opacity-40"
                >
                  Relancer l&apos;analyse
                </button>
              </div>

              {!peutCreerAlerte(buConnectee) && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  🔒 Assignation réservée à la centrale — vous êtes connecté en {buConnectee}. Basculez la BU en haut vers CENTRAL_VRG pour enregistrer.
                </p>
              )}

              <button
                type="button"
                onClick={enregistrerFiche}
                disabled={saving || nbAvecBU === 0}
                title={peutCreerAlerte(buConnectee) ? "Enregistrer les textes assignés (un N° d'ordre par acte)" : "Réservé à la centrale"}
                className="w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-base font-bold text-white shadow transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Enregistrement en cours…"
                  : `💾 Enregistrer ${nbAvecBU} texte${nbAvecBU > 1 ? "s" : ""} (${nbFiches} fiche${nbFiches > 1 ? "s" : ""} BU)`}
              </button>
              {actes && actes.length - nbAvecBU > 0 && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {actes.length - nbAvecBU} acte{actes.length - nbAvecBU > 1 ? "s" : ""} sans BU —
                  ignoré{actes.length - nbAvecBU > 1 ? "s" : ""} à l&apos;enregistrement
                  (dont « Hors périmètre » non assignés). Cochez une BU pour les enregistrer.
                </p>
              )}
            </div>
          )}
        </section>
        </div>
      </main>
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
      <legend className="bg-white px-2 text-xs font-bold uppercase tracking-wide text-brand-blue">{titre}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Champ({
  label,
  value,
  onChange,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue focus:bg-white ${mono ? "font-mono text-xs" : ""}`}
      />
    </label>
  );
}

function Zone({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={compact ? 2 : 3}
        className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue focus:bg-white"
      />
    </label>
  );
}
