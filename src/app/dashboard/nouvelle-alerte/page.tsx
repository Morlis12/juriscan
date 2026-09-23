"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { DepartementCode } from "@/domain/veille";
import {
  DEPARTEMENT_OPTIONS,
  simulerAnalyseAlerte,
  type AlerteAnalyse21,
} from "@/domain/nouvelle-alerte";
import { analyserDocumentAlerte } from "@/app/actions/veilleActions";

const STATUTS = [
  { code: "NON_CONFORME_0", label: "Non conforme (0 %)" },
  { code: "PARTIELLEMENT_25", label: "Partiellement — 25 %" },
  { code: "PARTIELLEMENT_50", label: "Partiellement — 50 %" },
  { code: "PARTIELLEMENT_75", label: "Partiellement — 75 %" },
  { code: "CONFORME_100", label: "Conforme (100 %)" },
] as const;

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

function formatTaille(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

/**
 * Encodage Base64 côté navigateur (FileReader) : seul du texte sérialisable
 * transite vers la Server Action — aucun objet File / binaire brut.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [texteExtrait, setTexteExtrait] = useState<string>("");
  const [resultat, setResultat] = useState<AlerteAnalyse21 | null>(null);
  const [source, setSource] = useState<"gemini" | "simulation" | null>(null);
  const [saved, setSaved] = useState(false);

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
      // Sécurisé : encodage Base64 navigateur → la Server Action ne reçoit
      // que des chaînes sérialisables (base64 pur + MIME + nom).
      const base64Data = await fichierVersBase64Pur(file);
      const mimeType = file.type || "application/pdf";
      const res = await analyserDocumentAlerte(base64Data, mimeType, file.name);
      if (!res.success) {
        setErreur("Échec de l'analyse IA.");
        return;
      }
      // Fusion : les 5 champs IA extraits + socle local pour les 21 champs.
      const socle = simulerAnalyseAlerte({
        fileName: file.name,
        fileType: mimeType,
        fileSize: file.size,
      }).analyse;
      setResultat({
        ...socle,
        numeroOrdre: res.data.numeroOrdre || socle.numeroOrdre,
        natureTexte: res.data.natureTexte || socle.natureTexte,
        referenceTexte: res.data.referenceTexte || socle.referenceTexte,
        resumeTexte: res.data.resumeTexte || socle.resumeTexte,
        libelleApplicable: res.data.libelleApplicable || socle.libelleApplicable,
      });
      setTexteExtrait(
        [
          `—— OCR Gemini gemini-1.5-flash : ${file.name} ——`,
          "",
          `Référence : ${res.data.referenceTexte}`,
          `Résumé : ${res.data.resumeTexte}`,
          "",
          `Libellé applicable : ${res.data.libelleApplicable}`,
        ].join("\n"),
      );
      setSource(res.source);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'analyse IA.");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof AlerteAnalyse21>(key: K, value: AlerteAnalyse21[K]) {
    setResultat((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* En-tête AGL */}
      <header className="bg-brand-blue text-white shadow-md">
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

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Colonne gauche : dépôt + extraction */}
        <section className="space-y-4">
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
              OCR réel sécurisé : le navigateur encode en Base64 pur (FileReader) et la Server Action{" "}
              <code className="font-mono">analyserDocumentAlerte(base64, mimeType)</code> (
              <code className="font-mono">src/app/actions/veilleActions.ts</code>, Gemini 1.5 Flash) ne reçoit que
              des chaînes sérialisables. Sans clé API, repli automatique sur simulation locale.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-brand-blue">Texte extrait (Gemini OCR)</h2>
              {source && (
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    source === "gemini"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {source === "gemini" ? "● OCR Gemini" : "● Simulation locale"}
                </span>
              )}
            </div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
              {texteExtrait || "— Lancez l'analyse pour voir l'extraction du document ici. —"}
            </pre>
          </div>
        </section>

        {/* Colonne droite : 21 champs */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-brand-blue px-5 py-3">
            <h2 className="text-base font-bold text-white">2 · Résultats — 21 colonnes pré-remplies et modifiables</h2>
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
                <span className="font-semibold text-brand-blue">« Lancer l&apos;Analyse IA JuriScan »</span> : les 21
                champs (N° d&apos;ordre, Nature du texte, Référence, Résumé, Libellé applicable…) apparaîtront ici,
                prêts à corriger.
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

              <Bloc titre="Fiche — assignation département (5 champs)">
                <label className="block rounded-lg border-2 border-brand-gold/60 bg-brand-gold/10 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                    13 · Département d&apos;acteurs responsable *
                  </span>
                  <select
                    value={resultat.departementResponsable}
                    onChange={(e) => set("departementResponsable", e.target.value as DepartementCode)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-brand-blue"
                  >
                    {DEPARTEMENT_OPTIONS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code === "PATR_IMMO" ? "Patr Immo" : d.code} — {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Zone label="14 · Actions conformité existantes" value={resultat.actionsExistantes} onChange={(v) => set("actionsExistantes", v)} compact />
                <Zone label="15 · Preuves de conformité existantes" value={resultat.preuvesExistantes} onChange={(v) => set("preuvesExistantes", v)} compact />
                <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    16 · Statut de conformité
                  </span>
                  <select
                    value={resultat.statutConformite}
                    onChange={(e) => set("statutConformite", e.target.value as AlerteAnalyse21["statutConformite"])}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5"
                  >
                    {STATUTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Zone label="17 · Preuve de conformité différée" value={resultat.preuveDifferee} onChange={(v) => set("preuveDifferee", v)} compact />
              </Bloc>

              <Bloc titre="Action d'amélioration (4 champs)">
                <Zone label="18 · Action d'amélioration" value={resultat.libelleAction} onChange={(v) => set("libelleAction", v)} compact />
                <Champ label="19 · Responsable" value={resultat.responsable} onChange={(v) => set("responsable", v)} />
                <Champ label="20 · Délai" type="date" value={resultat.delai} onChange={(v) => set("delai", v)} />
                <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    21 · Taux d&apos;avancement — {resultat.tauxAvancement} %
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={resultat.tauxAvancement}
                    onChange={(e) => set("tauxAvancement", Number(e.target.value))}
                    className="w-full accent-[#1C3359]"
                  />
                </label>
              </Bloc>

              {saved && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  Ligne {resultat.numeroOrdre} assignée à {resultat.departementResponsable} — prête pour Dataverse (simulation locale).
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
            </div>
          )}
        </section>
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
