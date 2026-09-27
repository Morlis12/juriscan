"use client";

import { useRef, useState } from "react";
import Link from "next/link";
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

type ModeSaisie = "auto" | "manuel";

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
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Lot multi-actes : « 1 document déposé » = « N textes extraits » (Acte X / N).
  const [actes, setActes] = useState<ActeAnalyse[] | null>(null);
  const [indexActe, setIndexActe] = useState(0);
  const [source, setSource] = useState<"gemini" | "simulation" | null>(null);
  const [meta, setMeta] = useState<ApiAnalyseMeta | null>(null);
  /** Analyse partielle (tranches/objets perdus) : affiché en ambre, les actes restent. */
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeSaisie>("auto");

  /** Acte affiché (« Acte X / N ») + compteurs du lot pour l'enregistrement. */
  const acte =
    actes && actes.length > 0 ? actes[Math.min(indexActe, actes.length - 1)] : null;
  const nbAvecBU = actes
    ? actes.filter((a) => a.departementsResponsables.length > 0).length
    : 0;
  const nbFiches = actes
    ? actes.reduce((s, a) => s + a.departementsResponsables.length, 0)
    : 0;

  /** Aperçu du panneau « Texte extrait » pour l'acte affiché. */
  function apercuActe(a: ActeAnalyse): string {
    return [
      `—— Analyse IA JuriScan : ${file?.name ?? "saisie manuelle"} ——`,
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

  function resetActes() {
    setActes(null);
    setIndexActe(0);
    setSource(null);
    setMeta(null);
    setMessage(null);
    setAvertissement(null);
  }

  function choisirMode(m: ModeSaisie) {
    setMode(m);
    setErreur(null);
    resetActes();
    // Saisie libre : un seul acte, texte + BU, prêt au clavier.
    if (m === "manuel") {
      setActes(numeroterActes([creerAlerteVierge()]));
    }
  }

  function prendreFichier(f: File | undefined) {
    setErreur(null);
    resetActes();
    if (!f) return;
    const ok =
      f.type === "application/pdf" ||
      f.type.startsWith("image/") ||
      /\.(pdf|png|jpe?g|webp)$/i.test(f.name);
    if (!ok) {
      setErreur("Format non pris en charge : déposez un PDF ou une image (PNG, JPG, WEBP).");
      return;
    }
    setFile(f);
    resetActes();
  }

  /** Charge un fichier d'exemple intégré au projet (JO n°53) pour tester l'analyse. */
  async function chargerExemple(kind: "pdf" | "image") {
    setErreur(null);
    resetActes();
    try {
      const url = kind === "pdf" ? "/exemples/53.pdf" : "/exemples/53-image-test.png";
      const nom = kind === "pdf" ? "53.pdf" : "53-image-test.png";
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error("Exemple introuvable.");
      const blob = await reponse.blob();
      prendreFichier(
        new File([blob], nom, {
          type: blob.type || (kind === "pdf" ? "application/pdf" : "image/png"),
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de charger l'exemple.");
    }
  }

  async function lancerAnalyse() {
    if (!file) {
      setErreur("Déposez d'abord un PDF (ex. Journal Officiel CI du 9 juillet 2026) ou une image.");
      return;
    }
    setLoading(true);
    setErreur(null);
    resetActes();
    try {
      // Base64 navigateur → POST JSON /api/analyse (aucun binaire côté serveur Next).
      const base64Data = await fichierVersBase64Pur(file);
      const mimeType = file.type || "application/pdf";
      const reponse = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data, mimeType, fileName: file.name }),
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
        setErreur(payload.error || "Échec de l'analyse IA.");
        return;
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
        setErreur("Aucun acte détecté dans ce document. Vérifiez le fichier ou saisissez manuellement.");
        return;
      }
      setActes(numeroterActes(normalises));
      setIndexActe(0);
      setMeta(payload.meta ?? null);
      setAvertissement(payload.avertissement ?? null);
      setSource(payload.source ?? "gemini");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'analyse IA.");
    } finally {
      setLoading(false);
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
        setMessage(
          `✅ ${creees.length} texte(s) enregistré(s) (${creees.map((c) => c.numeroOrdre).join(", ")}). Ignorés : ${ignorees.join(" · ")}`,
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
              <p className="text-lg font-bold leading-tight">Nouvelle alerte — Analyse IA JuriScan</p>
              <p className="text-xs text-slate-300">
                Dépôt manuel aujourd&apos;hui · captation Outlook / Power Automate demain
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelecteurBUConnectee />
            <Link
              href="/dashboard/memo"
              title="Mémo : comprendre les indicateurs et les règles"
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              ⓘ Mémo
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-gold hover:text-brand-blue"
            >
              ← Retour tableau de bord
            </Link>
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
            onClick={() => choisirMode("auto")}
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
            onClick={() => choisirMode("manuel")}
            className={`rounded-xl border-2 px-5 py-3 text-sm font-bold shadow-sm transition-colors ${
              mode === "manuel"
                ? "border-brand-gold bg-brand-blue text-white"
                : "border-slate-200 bg-white text-brand-blue hover:border-brand-blue"
            }`}
          >
            ✍️ Saisie Manuelle Libre
          </button>
        </div>

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
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-brand-blue">1 · Charger le document</h2>
            <p className="mt-1 text-xs text-slate-500">
              Glissez un PDF (ex. Journal Officiel de Côte d&apos;Ivoire du 9 juillet 2026) ou une image brute.
            </p>

            <div
              role="button"
              tabIndex={0}
              aria-label="Zone de dépôt du document"
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
                prendreFichier(e.dataTransfer.files?.[0]);
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
                Glisser-déposer le PDF / l&apos;image ici
              </p>
              <p className="mt-1 text-xs text-slate-500">ou cliquez pour parcourir — PDF, PNG, JPG, WEBP</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => prendreFichier(e.target.files?.[0])}
              />
            </div>

            {file && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-brand-blue">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {file.type || "document"} · {formatTaille(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    resetActes();
                  }}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Retirer
                </button>
              </div>
            )}

            {erreur && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{erreur}</p>
            )}

            <button
              type="button"
              onClick={lancerAnalyse}
              disabled={!file || loading}
              className="mt-4 w-full rounded-xl bg-brand-blue px-5 py-3 text-sm font-bold text-white shadow transition-all hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Analyse IA en cours…" : "Lancer l'Analyse IA JuriScan"}
            </button>
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
          )}

          {mode === "auto" && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-brand-blue">Texte extrait (JuriScan)</h2>
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
                <span className="font-semibold text-brand-blue">« Lancer l&apos;Analyse IA JuriScan »</span>, ou
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
                  onClick={lancerAnalyse}
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
