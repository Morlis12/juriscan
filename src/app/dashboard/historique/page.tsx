"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DEPARTEMENTS, type DepartementCode } from "@/domain/veille";
import {
  HISTORIQUE_ACTIONS,
  HISTORIQUE_ACTION_LABELS,
  type HistoriqueAction,
  type JournalEntree,
} from "@/domain/historique";
import { SelecteurBUConnectee, useBuConnectee } from "@/components/ContexteBU";

/**
 * JuriScan AI — Historique des modifications (traçabilité SCD2, consultable).
 * Lit GET /api/historique (VeilleJournal) : qui / quoi / quand / par qui.
 * Filtres : BU auteur, action tracée, recherche libre (N° ordre, BU fiche,
 * détails). Repli silencieux si base absente (prototype sans DB).
 */
export default function HistoriquePage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-sm text-slate-500">Chargement…</p>}>
      <HistoriqueContenu />
    </Suspense>
  );
}

function HistoriqueContenu() {
  const search = useSearchParams();
  const ficheFiltre = search.get("fiche") ?? "";
  const { bu: buConnectee } = useBuConnectee();
  const [entrees, setEntrees] = useState<JournalEntree[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtreBU, setFiltreBU] = useState<"ALL" | DepartementCode>("ALL");
  const [filtreAction, setFiltreAction] = useState<"ALL" | HistoriqueAction>("ALL");
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    let actif = true;
    // `chargement` vaut déjà true à l'état initial (pas de setState synchrone ici).
    fetch("/api/historique?take=200")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { success?: boolean; data?: JournalEntree[] } | null) => {
        if (actif && payload?.success && Array.isArray(payload.data)) {
          setEntrees(payload.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, []);

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return entrees.filter((e) => {
      if (ficheFiltre && e.ficheId !== ficheFiltre && ficheFiltre !== e.ficheId) {
        // Le filtre `fiche` transporte l'id de route `db-<alerte>-<fiche>` ;
        // on compare aussi au ficheId brut.
        const brut = ficheFiltre.startsWith("db-") ? ficheFiltre.slice(3).split("-").slice(7).join("-") : ficheFiltre;
        if (e.ficheId !== brut && e.ficheId !== ficheFiltre) return false;
      }
      if (filtreBU !== "ALL" && e.buAuteur !== filtreBU) return false;
      if (filtreAction !== "ALL" && e.action !== filtreAction) return false;
      if (
        terme &&
        !`${e.numeroOrdre ?? ""} ${e.ficheDepartement ?? ""} ${e.details ?? ""} ${e.emailAuteur ?? ""}`
          .toLowerCase()
          .includes(terme)
      )
        return false;
      return true;
    });
  }, [entrees, ficheFiltre, filtreBU, filtreAction, recherche]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-sm font-black text-brand-blue">
              🕘
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">Historique des modifications — SCD2</p>
              <p className="text-xs text-slate-300">
                Traçabilité : chaque modification est versionnée et consultable · connecté : {buConnectee}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelecteurBUConnectee />
            <Link
              href="/dashboard"
              className="rounded-full bg-brand-gold px-4 py-1.5 text-sm font-bold text-brand-blue transition-colors hover:brightness-95"
            >
              ← Pilotage juridique
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
              Filtres de traçabilité
            </h2>
            {(filtreBU !== "ALL" || filtreAction !== "ALL" || recherche.trim() !== "" || ficheFiltre) && (
              <button
                type="button"
                onClick={() => {
                  setFiltreBU("ALL");
                  setFiltreAction("ALL");
                  setRecherche("");
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-brand-blue hover:text-brand-blue"
              >
                Réinitialiser ✕
              </button>
            )}
          </div>
          {ficheFiltre && (
            <p className="mt-2 rounded-lg bg-brand-blue/5 px-3 py-2 text-xs font-medium text-brand-blue">
              Fiche filtrée : <span className="font-mono">{ficheFiltre}</span> —{" "}
              <Link href="/dashboard/historique" className="underline">
                voir tout l&apos;historique
              </Link>
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                BU auteur
              </span>
              <select
                value={filtreBU}
                onChange={(e) => setFiltreBU(e.target.value as "ALL" | DepartementCode)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-brand-blue"
              >
                <option value="ALL">Toutes les BU</option>
                {(Object.keys(DEPARTEMENTS) as DepartementCode[]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Action tracée
              </span>
              <select
                value={filtreAction}
                onChange={(e) => setFiltreAction(e.target.value as "ALL" | HistoriqueAction)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-brand-blue"
              >
                <option value="ALL">Toutes les actions</option>
                {HISTORIQUE_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {HISTORIQUE_ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Recherche
              </span>
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="N° ordre, BU, détail, email…"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {filtrees.length} entrée{filtrees.length > 1 ? "s" : ""} — SCD2 : version courante (`isCurrent`) +
            snapshots (`Veille*Version`) + journal lisible (`VeilleJournal`, Dataverse : Auditing + tables dédiées).
          </p>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="bg-brand-blue px-5 py-3 text-base font-bold text-white">
            Journal — {filtrees.length} modification{filtrees.length > 1 ? "s" : ""}
          </h2>
          {chargement ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Chargement de l&apos;historique…</p>
          ) : filtrees.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              Aucune modification tracée pour ces filtres. Chaque création / validation / approbation /
              rejet / pilotage BU apparaîtra ici (base requise ; repli silencieux sinon).
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtrees.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-brand-blue">
                      {HISTORIQUE_ACTION_LABELS[(e.action as HistoriqueAction)] ?? e.action}
                      {e.numeroOrdre && (
                        <span className="ml-2 font-mono text-xs font-semibold text-slate-500">{e.numeroOrdre}</span>
                      )}
                      {e.ficheDepartement && (
                        <span className="ml-2 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-bold">
                          {e.ficheDepartement}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] tabular-nums text-slate-400">
                      {new Date(e.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  {e.details && <p className="mt-1 text-xs text-slate-600">{e.details}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                    {e.buAuteur && <span>BU auteur : <span className="font-semibold">{e.buAuteur}</span></span>}
                    {e.emailAuteur && <span>{e.emailAuteur}</span>}
                    {e.champsModifies.length > 0 && (
                      <span className="font-mono">champs : {e.champsModifies.join(", ")}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
