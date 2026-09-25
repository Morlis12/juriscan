"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConformiteStatut, DepartementCode } from "@/domain/veille";
import { CONFORMITE_STATUTS, DEPARTEMENT_CODES } from "@/domain/veille";
import {
  DEPARTEMENT_OPTIONS,
  creerAlerteVierge,
  type AlerteAnalyse21,
} from "@/domain/nouvelle-alerte";

type ModeSaisie = "auto" | "manuel";

interface ApiAnalyseData {
  numeroOrdre?: string;
  qssfte?: string;
  natureTexte?: string;
  referenceTexte?: string;
  article?: string;
  resumeTexte?: string;
  libelleApplicable?: string;
  moyenCommunication?: string;
  dateEntreeVigueur?: string;
  statutConformite?: string;
  actionsAmelioration?: string;
  departement?: string;
  /** Recommandation IA (Gemini 3.6 Flash) : BU la plus probable. */
  propositionBU?: string;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [texteExtrait, setTexteExtrait] = useState<string>("");
  const [resultat, setResultat] = useState<AlerteAnalyse21 | null>(null);
  const [source, setSource] = useState<"gemini" | "simulation" | null>(null);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<ModeSaisie>("auto");

  function choisirMode(m: ModeSaisie) {
    setMode(m);
    setErreur(null);
    setSaved(false);
    // Saisie libre : texte + BU, prêt au clavier (la conformité est pilotée par les BU).
    if (m === "manuel" && !resultat) {
      setResultat(creerAlerteVierge());
      setTexteExtrait("");
      setSource(null);
    }
  }

  function prendreFichier(f: File | undefined) {
    setErreur(null);
    setSaved(false);
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
    setResultat(null);
    setTexteExtrait("");
    setSource(null);
  }

  async function lancerAnalyse() {
    if (!file) {
      setErreur("Déposez d'abord un PDF (ex. Journal Officiel CI du 9 juillet 2026) ou une image.");
      return;
    }
    setLoading(true);
    setErreur(null);
    setSaved(false);
    try {
      // Architecture REST : Base64 navigateur → POST JSON /api/analyse.
      // Aucune Server Action : aucun objet binaire dans les Server Components.
      const base64Data = await fichierVersBase64Pur(file);
      const mimeType = file.type || "application/pdf";
      const reponse = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data, mimeType, fileName: file.name }),
      });
      const payload = (await reponse.json()) as {
        success?: boolean;
        data?: ApiAnalyseData;
        source?: "gemini" | "simulation";
        error?: string;
      };
      if (!reponse.ok || !payload.success || !payload.data) {
        setErreur(payload.error || "Échec de l'analyse IA.");
        return;
      }
      const data = payload.data;
      // Zéro mock : texte IA réel + base vierge ; la conformité part à 0 % côté BU.
      // La recommandation BU (`propositionBU`, miroir `departement`) pré-remplit
      // le département responsable — le juridique reste décideur (workflow).
      const socle = creerAlerteVierge();
      const buRecommandee = [data.propositionBU, data.departement].find((v) =>
        (DEPARTEMENT_CODES as string[]).includes(v ?? ""),
      );
      const departement = (
        buRecommandee ?? socle.departementResponsable
      ) as DepartementCode;
      const propositionBU = (
        (DEPARTEMENT_CODES as string[]).includes(data.propositionBU ?? "")
          ? data.propositionBU
          : ""
      ) as AlerteAnalyse21["propositionBU"];
      const statut = (CONFORMITE_STATUTS as string[]).includes(data.statutConformite ?? "")
        ? (data.statutConformite as ConformiteStatut)
        : socle.statutConformite;
      const analyse: AlerteAnalyse21 = {
        ...socle,
        numeroOrdre: texteOu(data.numeroOrdre, socle.numeroOrdre),
        qssfte: texteOu(data.qssfte, socle.qssfte),
        natureTexte: texteOu(data.natureTexte, socle.natureTexte),
        referenceTexte: texteOu(data.referenceTexte, socle.referenceTexte),
        article: texteOu(data.article, socle.article),
        resumeTexte: texteOu(data.resumeTexte, socle.resumeTexte),
        libelleApplicable: texteOu(data.libelleApplicable, socle.libelleApplicable),
        moyenCommunication: texteOu(data.moyenCommunication, socle.moyenCommunication),
        dateEntreeVigueur: texteOu(data.dateEntreeVigueur, socle.dateEntreeVigueur),
        propositionBU,
        departementResponsable: departement,
        departementsResponsables: [departement],
        statutConformite: statut,
        libelleAction: texteOu(data.actionsAmelioration, socle.libelleAction),
      };
      setResultat(analyse);
      setTexteExtrait(
        [
          `—— Analyse JuriScan (Gemini 3.6 Flash) : ${file.name} ——`,
          "",
          `Référence : ${analyse.referenceTexte}`,
          `Résumé : ${analyse.resumeTexte}`,
          "",
          `Libellé applicable : ${analyse.libelleApplicable}`,
          ...(analyse.propositionBU ? [`BU recommandée par l'IA : ${analyse.propositionBU}`] : []),
        ].join("\n"),
      );
      setSource(payload.source ?? "gemini");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'analyse IA.");
    } finally {
      setLoading(false);
    }
  }

  async function enregistrerFiche() {
    if (!resultat) return;
    if (resultat.departementsResponsables.length === 0) {
      setErreur("Cochez au moins une BU responsable avant d'enregistrer.");
      return;
    }
    setSaving(true);
    setErreur(null);
    try {
      // Persistant : texte + BU cochées → Prisma (Alerte + une Fiche par BU).
      const reponse = await fetch("/api/sauvegarde", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resultat),
      });
      const payload = (await reponse.json()) as { success?: boolean; error?: string };
      if (!reponse.ok || !payload.success) {
        setErreur(payload.error || "Échec de l'enregistrement en base.");
        return;
      }
      // Redirection opérationnelle : la fiche rejoint l'onglet de sa direction.
      router.push("/dashboard");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement en base.");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof AlerteAnalyse21>(key: K, value: AlerteAnalyse21[K]) {
    setResultat((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  /** Coche / décoche une BU (un texte peut concerner plusieurs BU). */
  function basculerBU(code: DepartementCode) {
    setResultat((prev) => {
      if (!prev) return prev;
      const cochees = prev.departementsResponsables.includes(code)
        ? prev.departementsResponsables.filter((c) => c !== code)
        : [...prev.departementsResponsables, code];
      return {
        ...prev,
        departementsResponsables: cochees,
        // La première BU cochée reste l'assignation principale (compatibilité).
        departementResponsable: cochees[0] ?? prev.departementResponsable,
      };
    });
    setSaved(false);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* En-tête AGL */}
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-sm font-black text-brand-blue">
              AGL
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">Nouvelle alerte — Analyse IA JuriScan</p>
              <p className="text-xs text-slate-300">
                Dépôt manuel aujourd&apos;hui · captation Outlook / Power Automate demain
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-gold hover:text-brand-blue"
          >
            ← Retour tableau de bord
          </Link>
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
                  <span className="font-bold text-brand-blue">3.</span> Cliquez sur « 💾 Enregistrer la Fiche de Veille ».
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
                    setResultat(null);
                    setTexteExtrait("");
                    setSource(null);
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
            {loading && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-gold" />
              </div>
            )}
            <p className="mt-3 rounded-lg bg-brand-gold/15 px-3 py-2 text-[11px] leading-relaxed text-brand-blue">
              Analyse sécurisée (API REST) : le navigateur encode en Base64 pur (FileReader) et{" "}
              <code className="font-mono">POST /api/analyse</code> (
              <code className="font-mono">src/app/api/analyse/route.ts</code>) retourne l&apos;extraction du JO CI
              du 9 juillet 2026, sans appel externe.
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
              {texteExtrait || "— Lancez l'analyse pour voir l'extraction du document ici. —"}
            </pre>
          </div>
          )}
        </section>

        {/* Colonne droite : texte + assignation BU */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-brand-blue px-5 py-3">
            <h2 className="text-base font-bold text-white">
              {mode === "manuel"
                ? "2 · Saisie — texte et BU concernées"
                : "2 · Résultats — texte extrait et assignation BU"}
            </h2>
            {resultat && (
              <span className="rounded-full bg-brand-gold px-3 py-1 font-mono text-xs font-bold text-brand-blue">
                {resultat.numeroOrdre}
              </span>
            )}
          </div>

          {!resultat ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              <p className="mx-auto max-w-sm">
                Aucun résultat pour l&apos;instant. Chargez un PDF puis cliquez sur{" "}
                <span className="font-semibold text-brand-blue">« Lancer l&apos;Analyse IA JuriScan »</span>, ou
                basculez sur <span className="font-semibold text-brand-blue">« ✍️ Saisie Manuelle Libre »</span> : le
                texte (N° d&apos;ordre, Nature, Référence, Résumé, Libellé applicable…) et les BU à cocher
                apparaîtront ici. La conformité (preuves, actions, statut, responsable, délai, taux) sera
                pilotée par chaque BU.
              </p>
            </div>
          ) : (
            <div className="space-y-6 px-5 py-5">
              <Bloc titre="Alerte — texte source (12 champs)">
                <Champ label="01 · N° d'ordre" value={resultat.numeroOrdre} onChange={(v) => set("numeroOrdre", v)} mono />
                <Champ label="02 · QSSTE" value={resultat.qssfte} onChange={(v) => set("qssfte", v)} mono />
                <Champ label="03 · Nature du texte" value={resultat.natureTexte} onChange={(v) => set("natureTexte", v)} />
                <Champ label="04 · Référence du texte" value={resultat.referenceTexte} onChange={(v) => set("referenceTexte", v)} />
                <Champ label="05 · Article" value={resultat.article} onChange={(v) => set("article", v)} />
                <Zone label="06 · Résumé du texte (IA)" value={resultat.resumeTexte} onChange={(v) => set("resumeTexte", v)} />
                <Zone label="07 · Libellé / texte applicable en vigueur" value={resultat.libelleApplicable} onChange={(v) => set("libelleApplicable", v)} />
                <Champ label="08 · Lien hypertexte" value={resultat.lienHypertexte} onChange={(v) => set("lienHypertexte", v)} mono />
                <Champ label="09 · Date d'entrée en vigueur" type="date" value={resultat.dateEntreeVigueur} onChange={(v) => set("dateEntreeVigueur", v)} />
                <Zone label="10 · Contenu brut extrait" value={resultat.contenu} onChange={(v) => set("contenu", v)} compact />
                <Champ label="11 · Moyen de communication" value={resultat.moyenCommunication} onChange={(v) => set("moyenCommunication", v)} />
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={resultat.applicableAGLCI}
                    onChange={(e) => set("applicableAGLCI", e.target.checked)}
                    className="h-4 w-4 accent-[#1C3359]"
                  />
                  <span>
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      12 · Applicable à AGL CI
                    </span>
                    <span className="font-medium text-slate-800">{resultat.applicableAGLCI ? "Oui" : "Non"}</span>
                  </span>
                </label>
              </Bloc>

              <Bloc titre="Assignation — BU responsables (une fiche par BU cochée)">
                {resultat.propositionBU && (
                  <p className="rounded-lg bg-brand-blue/5 px-3 py-2 text-xs font-medium text-brand-blue sm:col-span-2">
                    🤖 Gemini 3.6 Flash recommande la BU :{" "}
                    <span className="font-bold">{resultat.propositionBU}</span>
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
                    13 · BU responsables * ({resultat.departementsResponsables.length} cochée
                    {resultat.departementsResponsables.length > 1 ? "s" : ""})
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DEPARTEMENT_OPTIONS.map((d) => (
                      <label
                        key={d.code}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-brand-blue hover:border-brand-blue"
                      >
                        <input
                          type="checkbox"
                          checked={resultat.departementsResponsables.includes(d.code)}
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
                  {resultat.departementsResponsables.length === 0 && (
                    <p className="mt-2 text-xs font-medium text-red-600">
                      Cochez au moins une BU pour enregistrer la fiche.
                    </p>
                  )}
                </fieldset>
              </Bloc>

              {saved && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  Ligne {resultat.numeroOrdre} assignée à{" "}
                  {resultat.departementsResponsables.join(", ")} — prête pour Dataverse (simulation locale).
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setSaved(true)}
                  className="flex-1 rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-blue shadow transition-colors hover:brightness-95"
                >
                  Valider et assigner la ligne
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

              <button
                type="button"
                onClick={enregistrerFiche}
                disabled={saving}
                className="w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-base font-bold text-white shadow transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Enregistrement en cours…" : "💾 Enregistrer la Fiche de Veille"}
              </button>
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
