"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ConformiteStatut, DepartementCode, FluxStatut } from "@/domain/veille";
import { DEPARTEMENTS, FLUX_STATUT_LABELS } from "@/domain/veille";
import { formaterDateFR, formaterDateHeureFR } from "@/domain/jalons";

/**
 * AGL JuriCompliance — Vue immersive du texte juridique.
 *
 * Ouverte au clic sur une barre du graphique « Niveau de conformité par texte » :
 * l'écran de pilotage montre un pourcentage, la vue immersive montre LE TEXTE
 * (article, libellé applicable, transcription brute) avec ses métadonnées et la
 * conformité de chaque direction.
 *
 * Principes :
 * - Lecture d'abord : pleine page, typographie lisible, taille de texte réglable,
 *   défilement interne, sans quitter le pilotage.
 * - Fidélité : on affiche ce que la base contient (article copié mot à mot,
 *   transcription brute), jamais de résumé à la place du texte. Si le texte
 *   brut n'est pas disponible (données de démonstration), c'est indiqué.
 * - Navigation clavier : Échap ferme, ← / → passent au texte précédent/suivant.
 * - Repli silencieux : l'écran s'ouvre immédiatement avec ce que le tableau de
 *   bord sait déjà, puis le texte complet est chargé en tâche de fond.
 */

export interface FicheBUVue {
  id: string;
  departement: DepartementCode;
  statut: ConformiteStatut;
  tauxAvancement: number;
  fluxStatut: FluxStatut;
  derniereModif: string;
  preuveDifferee?: string | null;
}

export interface TexteImmersif {
  numeroOrdre: string;
  natureTexte: string;
  referenceTexte: string;
  resumeTexte: string;
  dateEntreeVigueur: string;
  tauxMoyen: number;
  derniereModif: string;
  fiches: FicheBUVue[];
}

/** Champs du texte renvoyés par GET /api/veille/[id] (VeilleAlerte). */
interface AlerteTexte {
  article?: string | null;
  qssfte?: string | null;
  resumeTexte?: string | null;
  libelleApplicable?: string | null;
  lienHypertexte?: string | null;
  contenu?: string | null;
  moyenCommunication?: string | null;
  applicableA_AGL_CI?: boolean | null;
  pertinenceTransit?: string | null;
}

const STATUTS_FR: Record<ConformiteStatut, { libelle: string; classe: string }> = {
  CONFORME_100: { libelle: "Conforme", classe: "bg-emerald-100 text-emerald-800" },
  PARTIELLEMENT_75: { libelle: "Partiel 75 %", classe: "bg-emerald-50 text-emerald-700" },
  PARTIELLEMENT_50: { libelle: "Partiel 50 %", classe: "bg-brand-gold/20 text-amber-800" },
  PARTIELLEMENT_25: { libelle: "Partiel 25 %", classe: "bg-amber-100 text-amber-900" },
  NON_CONFORME_0: { libelle: "Non conforme", classe: "bg-red-100 text-red-800" },
};

const TAILLES = { S: "text-[13px] leading-relaxed", M: "text-[15px] leading-relaxed", L: "text-[17px] leading-relaxed" } as const;

export function VueTexteImmersive({
  texte,
  index,
  total,
  onPrecedent,
  onSuivant,
  onFermer,
}: {
  texte: TexteImmersif | null;
  index: number;
  total: number;
  onPrecedent: () => void;
  onSuivant: () => void;
  onFermer: () => void;
}) {
  const [charge, setCharge] = useState<{ id: string; alerte: AlerteTexte | null } | null>(null);
  const [taille, setTaille] = useState<keyof typeof TAILLES>("M");
  const [copie, setCopie] = useState(false);
  const panneauRef = useRef<HTMLDivElement>(null);
  const declencheurRef = useRef<HTMLElement | null>(null);

  const ficheId = texte?.fiches[0]?.id ?? null;

  // Chargement du texte complet. L'état n'est écrit que dans les callbacks de
  // la promesse (jamais de setState synchrone dans l'effet) et `chargement` en
  // est dérivé : pas de rendu en cascade.
  useEffect(() => {
    if (!ficheId) return;
    let actif = true;
    fetch(`/api/veille/${ficheId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: { alerte?: AlerteTexte } } | null) => {
        if (!actif) return;
        setCharge({ id: ficheId, alerte: payload?.data?.alerte ?? null });
        setCopie(false);
      })
      .catch(() => {
        if (actif) setCharge({ id: ficheId, alerte: null });
      });
    return () => {
      actif = false;
    };
  }, [ficheId]);

  // Le texte affiché n'est celui que si la réponse correspond bien au texte ouvert.
  const chargeCourant = charge && charge.id === ficheId ? charge : null;
  const chargement = ficheId !== null && !chargeCourant;
  const alerte = chargeCourant?.alerte ?? null;

  // Ouverture : mémoriser le déclencheur, prendre le focus, verrouiller le défilement.
  useEffect(() => {
    if (!texte) return;
    declencheurRef.current = document.activeElement as HTMLElement | null;
    panneauRef.current?.focus();
    const overflowPrecedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowPrecedente;
      declencheurRef.current?.focus?.();
    };
  }, [texte]);

  // Clavier : Échap ferme, ← / → naviguent entre les textes.
  useEffect(() => {
    if (!texte) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onFermer();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onSuivant();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrecedent();
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [texte, onFermer, onSuivant, onPrecedent]);

  if (!texte) return null;

  const article = alerte?.article?.trim() ?? "";
  const libelle = (alerte?.libelleApplicable ?? "").trim() || texte.resumeTexte;
  const brut = (alerte?.contenu ?? "").trim();
  const resume = (alerte?.resumeTexte ?? "").trim() || texte.resumeTexte;
  const lien = alerte?.lienHypertexte?.trim() ?? "";
  const sansTexteComplet = !chargement && !article && !brut;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-slate-900/70 p-0 backdrop-blur-sm sm:p-4 lg:p-8"
      onClick={onFermer}
      role="presentation"
    >
      <div
        ref={panneauRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-texte-immersif"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-6xl flex-col overflow-hidden rounded-none bg-white shadow-2xl outline-none sm:rounded-2xl"
      >
        {/* EN-TÊTE — identité du texte + navigation */}
        <header className="flex flex-wrap items-center justify-between gap-3 bg-brand-blue px-4 py-3 text-white sm:px-6">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand-gold">
              <span className="font-mono text-sm normal-case tracking-normal text-white">
                {texte.numeroOrdre}
              </span>
              <span className="rounded bg-white/15 px-1.5 py-0.5 normal-case text-white">
                {texte.natureTexte || "Texte"}
              </span>
            </p>
            <h2
              id="titre-texte-immersif"
              className="mt-0.5 truncate text-base font-bold sm:text-lg"
              title={texte.referenceTexte}
            >
              {texte.referenceTexte || "Sans référence"}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1 text-xs text-slate-200 sm:flex">
              <button
                type="button"
                onClick={onPrecedent}
                disabled={index <= 0}
                className="rounded-full bg-white/10 px-3 py-1.5 font-semibold transition-colors hover:bg-white/20 disabled:opacity-30"
                aria-label="Texte précédent"
              >
                ←
              </button>
              <span className="tabular-nums">
                {index + 1} / {total}
              </span>
              <button
                type="button"
                onClick={onSuivant}
                disabled={index >= total - 1}
                className="rounded-full bg-white/10 px-3 py-1.5 font-semibold transition-colors hover:bg-white/20 disabled:opacity-30"
                aria-label="Texte suivant"
              >
                →
              </button>
            </div>
            <span className="rounded-full bg-brand-gold px-3 py-1.5 text-xs font-bold text-brand-blue">
              ⌀ {texte.tauxMoyen} % de conformité
            </span>
            <button
              type="button"
              onClick={onFermer}
              aria-label="Fermer la vue immersive"
              className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-brand-blue transition-colors hover:bg-brand-gold"
            >
              ✕
            </button>
          </div>
        </header>

        {/* CORPS — le texte à gauche, le contexte à droite */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* ——— Colonne lecture ——— */}
            <div className="min-w-0 border-b border-slate-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
                  Texte juridique
                </h3>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500">Taille</span>
                  {(["S", "M", "L"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTaille(t)}
                      aria-pressed={taille === t}
                      className={`rounded px-2 py-0.5 font-bold ${
                        taille === t
                          ? "bg-brand-blue text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {chargement && (
                <p className="mb-3 rounded-lg bg-brand-blue/5 px-3 py-2 text-xs text-brand-blue">
                  Chargement du texte complet…
                </p>
              )}

              {article && (
                <section className="mb-5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Article
                  </h4>
                  <p className="mt-1 whitespace-pre-line font-semibold text-brand-blue">
                    {article}
                  </p>
                </section>
              )}

              <section className="mb-5">
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Texte applicable en vigueur
                </h4>
                <p
                  className={`mt-1 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800 ${TAILLES[taille]}`}
                >
                  {libelle || "— non renseigné —"}
                </p>
              </section>

              <section>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Texte brut transcrit
                  </h4>
                  {brut && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(brut)
                          .then(() => setCopie(true))
                          .catch(() => setCopie(false));
                      }}
                      className="rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-brand-blue hover:text-brand-blue"
                    >
                      {copie ? "✓ Copié" : "Copier"}
                    </button>
                  )}
                </div>
                {brut ? (
                  <pre
                    className={`mt-1 max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-slate-700 ${TAILLES[taille]}`}
                  >
                    {brut}
                  </pre>
                ) : (
                  <p className="mt-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
                    {chargement
                      ? "Chargement…"
                      : "Transcription brute indisponible pour ce texte (données de démonstration, ou document non archivé)."}
                  </p>
                )}
                {brut && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {brut.length.toLocaleString("fr-FR")} caractères — copiés mot à mot
                    depuis le document source.
                  </p>
                )}
              </section>

              {lien && (
                <a
                  href={lien}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
                >
                  🔗 Consulter le texte officiel / le document source
                  <span aria-hidden="true">↗</span>
                </a>
              )}

              {sansTexteComplet && (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Le texte intégral n&apos;est pas disponible pour cette fiche (jeu de
                  démonstration sans base). Les métadonnées ci-contre restent fiables.
                </p>
              )}
            </div>

            {/* ——— Colonne contexte ——— */}
            <aside className="min-w-0 space-y-5 bg-slate-50/60 p-4 sm:p-6">
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
                  Résumé (IA)
                </h3>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{resume || "—"}</p>
              </section>

              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
                  Métadonnées
                </h3>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <Ligne libelle="N° d'ordre" valeur={<span className="font-mono">{texte.numeroOrdre}</span>} />
                  <Ligne libelle="Nature" valeur={texte.natureTexte || "—"} />
                  <Ligne libelle="Référence" valeur={texte.referenceTexte || "—"} />
                  <Ligne libelle="Entrée en vigueur" valeur={formaterDateFR(texte.dateEntreeVigueur)} />
                  {alerte?.qssfte ? <Ligne libelle="QSSTE" valeur={alerte.qssfte} /> : null}
                  {alerte?.moyenCommunication ? (
                    <Ligne libelle="Communication" valeur={alerte.moyenCommunication} />
                  ) : null}
                  {alerte?.pertinenceTransit ? (
                    <Ligne libelle="Pertinence transit" valeur={alerte.pertinenceTransit} />
                  ) : null}
                  {alerte?.applicableA_AGL_CI !== null && alerte?.applicableA_AGL_CI !== undefined ? (
                    <Ligne
                      libelle="Applicable AGL CI"
                      valeur={alerte.applicableA_AGL_CI ? "Oui" : "Non"}
                    />
                  ) : null}
                  <Ligne libelle="Dernière modif." valeur={formaterDateHeureFR(texte.derniereModif)} />
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
                  Conformité par direction
                </h3>
                <ul className="mt-2 space-y-2">
                  {texte.fiches.map((f) => {
                    const st = STATUTS_FR[f.statut] ?? STATUTS_FR.NON_CONFORME_0;
                    return (
                      <li key={f.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-brand-blue">
                            {DEPARTEMENTS[f.departement] ?? f.departement}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${st.classe}`}
                          >
                            {st.libelle}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <span
                              className={`block h-full rounded-full ${
                                f.tauxAvancement >= 75
                                  ? "bg-emerald-500"
                                  : f.tauxAvancement >= 25
                                    ? "bg-brand-gold"
                                    : "bg-red-500"
                              }`}
                              style={{ width: `${f.tauxAvancement}%` }}
                            />
                          </span>
                          <span className="w-12 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-700">
                            {f.tauxAvancement} %
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {FLUX_STATUT_LABELS[f.fluxStatut] ?? f.fluxStatut} · modifié le{" "}
                          {formaterDateHeureFR(f.derniereModif)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                {texte.fiches[0] && (
                  <Link
                    href={`/dashboard/alertes/${texte.fiches[0].id}`}
                    className="mt-3 block rounded-lg bg-brand-blue px-3 py-2 text-center text-xs font-bold text-white transition-colors hover:bg-brand-blue/90"
                  >
                    Ouvrir la fiche de traitement →
                  </Link>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 font-semibold text-slate-500">{libelle}</dt>
      <dd className="min-w-0 truncate text-right text-slate-800" title={typeof valeur === "string" ? valeur : undefined}>
        {valeur}
      </dd>
    </div>
  );
}
