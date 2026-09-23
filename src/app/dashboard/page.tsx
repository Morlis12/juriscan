"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ConformiteStatut, DepartementCode } from "@/domain/veille";
import { CONFORMITE_POURCENTAGE, DEPARTEMENTS } from "@/domain/veille";
import {
  MOCK_ACTIONS,
  MOCK_ALERTES,
  actionsEnRetard,
  tauxConformiteMoyen,
  type MockAction,
  type MockAlerte,
} from "@/data/veille-mock";

/** Ligne brute renvoyée par GET /api/veille (Prisma, sérialisé JSON). */
interface ApiFiche {
  id: string;
  departement: DepartementCode;
  statutConformite: ConformiteStatut;
  actionsAmelioration: {
    id: string;
    libelleAction: string;
    delai: string | null;
    tauxAvancement: number;
  }[];
}
interface ApiAlerte {
  id: string;
  numeroOrdre: string;
  natureTexte: string;
  referenceTexte: string;
  resumeTexte: string;
  dateEntreeVigueur: string | null;
  createdAt: string;
  fichesDepartements: ApiFiche[];
}

type TabCode = "ALL" | DepartementCode;

const TABS: { code: TabCode; label: string }[] = [
  { code: "ALL", label: "Général" },
  { code: "DJ", label: "DJ" },
  { code: "DAF", label: "DAF" },
  { code: "DRH", label: "DRH" },
  { code: "PATR_IMMO", label: "Patr Immo" },
  { code: "DQHSE", label: "DQHSE" },
  { code: "DIR_COMM_MARK", label: "Commercial" },
  { code: "DILS", label: "DILS" },
];

const BADGE: Record<MockAlerte["statut"], string> = {
  CONFORME_100:
    "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-600/20",
  NON_CONFORME_0: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-600/20",
  PARTIELLEMENT_25:
    "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  PARTIELLEMENT_50:
    "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  PARTIELLEMENT_75:
    "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20",
};

const STATUT_LABEL: Record<MockAlerte["statut"], string> = {
  CONFORME_100: "Conforme",
  NON_CONFORME_0: "Non Conforme",
  PARTIELLEMENT_25: "Partiellement Conforme",
  PARTIELLEMENT_50: "Partiellement Conforme",
  PARTIELLEMENT_75: "Partiellement Conforme",
};

function formatDateFR(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [tab, setTab] = useState<TabCode>("ALL");
  const [now, setNow] = useState<Date | null>(null);
  const [dbAlertes, setDbAlertes] = useState<MockAlerte[]>([]);
  const [dbActions, setDbActions] = useState<MockAction[]>([]);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fiches enregistrées en base (POST /api/veille) : repli silencieux sur les mocks si DB absente.
  useEffect(() => {
    let actif = true;
    fetch("/api/veille")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { success?: boolean; data?: ApiAlerte[] } | null) => {
        if (!actif || !payload?.success || !Array.isArray(payload.data)) return;
        const alertes: MockAlerte[] = [];
        const actions: MockAction[] = [];
        for (const a of payload.data) {
          for (const f of a.fichesDepartements) {
            const action = f.actionsAmelioration[0];
            alertes.push({
              id: `db-${a.id}-${f.id}`,
              numeroOrdre: a.numeroOrdre,
              departement: f.departement,
              natureTexte: a.natureTexte,
              referenceTexte: a.referenceTexte,
              resumeTexte: a.resumeTexte,
              dateEntreeVigueur: (a.dateEntreeVigueur ?? a.createdAt).slice(0, 10),
              statut: f.statutConformite,
              tauxAvancement: action
                ? Math.round(action.tauxAvancement)
                : CONFORMITE_POURCENTAGE[f.statutConformite],
            });
            if (action) {
              actions.push({
                id: `db-action-${action.id}`,
                numeroOrdre: a.numeroOrdre,
                libelleAction: action.libelleAction,
                responsable: "Assigné (base)",
                delai: (action.delai ?? a.createdAt).slice(0, 10),
                tauxAvancement: Math.round(action.tauxAvancement),
              });
            }
          }
        }
        setDbAlertes(alertes);
        setDbActions(actions);
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, []);

  const dateStr = now
    ? new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(now)
    : "…";
  const timeStr = now
    ? new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(now)
    : "--:--:--";

  const toutesAlertes = useMemo(() => [...dbAlertes, ...MOCK_ALERTES], [dbAlertes]);
  const toutesActions = useMemo(() => [...dbActions, ...MOCK_ACTIONS], [dbActions]);

  const alertes = useMemo(
    () =>
      tab === "ALL"
        ? toutesAlertes
        : toutesAlertes.filter((a) => a.departement === tab),
    [tab, toutesAlertes],
  );

  const numeros = useMemo(() => new Set(alertes.map((a) => a.numeroOrdre)), [alertes]);
  const actionsPerimetre = useMemo(
    () => toutesActions.filter((a) => numeros.has(a.numeroOrdre)),
    [numeros, toutesActions],
  );
  const nbRetard = useMemo(
    () => actionsEnRetard(actionsPerimetre).length,
    [actionsPerimetre],
  );
  const tauxMoyen = useMemo(() => tauxConformiteMoyen(alertes), [alertes]);

  const histo = useMemo(() => {
    const conforme = alertes.filter((a) => a.statut === "CONFORME_100").length;
    const nonConforme = alertes.filter((a) => a.statut === "NON_CONFORME_0").length;
    return [
      { label: "Conforme", count: conforme, bar: "bg-emerald-500" },
      { label: "Non Conforme", count: nonConforme, bar: "bg-red-500" },
      {
        label: "Partiellement Conforme",
        count: alertes.length - conforme - nonConforme,
        bar: "bg-brand-gold",
      },
    ];
  }, [alertes]);
  const histoMax = Math.max(1, ...histo.map((h) => h.count));

  const perimetreLabel =
    tab === "ALL" ? "Toutes directions" : DEPARTEMENTS[tab as DepartementCode];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* EN-TÊTE FIXE */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-brand-blue/95 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-sm font-black tracking-tight text-brand-blue">
              AGL
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">
                AGL - JuriScan AI
              </p>
              <p className="text-xs capitalize text-slate-300">{dateStr}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-mono tabular-nums text-slate-100">
              {timeStr}
            </span>
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              SQL synchronisé
            </span>
          </div>
        </div>
        {/* SÉLECTEUR DE DÉPARTEMENT */}
        <nav className="border-t border-white/10 bg-brand-blue/80">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
            {TABS.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setTab(t.code)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.code
                    ? "bg-brand-gold text-brand-blue shadow"
                    : "text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Périmètre : <span className="font-semibold text-brand-blue">{perimetreLabel}</span>
            {" — "}
            {alertes.length} alerte{alertes.length > 1 ? "s" : ""}
          </p>
          <Link
            href="/dashboard/nouvelle-alerte"
            className="rounded-lg border border-brand-gold bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-blue/90"
          >
            ➕ Nouvelle Alerte
          </Link>
        </div>

        {/* CARTES KPI */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Alertes Globales
            </p>
            <p className="mt-1 text-3xl font-black text-brand-blue">
              {alertes.length}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Textes suivis sur le périmètre
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Taux de Conformité Moyen (%)
            </p>
            <p className="mt-1 text-3xl font-black text-brand-blue">
              {tauxMoyen} %
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-brand-gold"
                style={{ width: `${tauxMoyen}%` }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Actions en retard
            </p>
            <p className="mt-1 text-3xl font-black text-red-600">{nbRetard}</p>
            <p className="mt-1 text-xs text-slate-400">
              Délai dépassé, avancement &lt; 100 %
            </p>
          </div>
        </section>

        {/* HISTOGRAMME */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-brand-blue">
            Textes par statut de conformité
          </h2>
          <div className="mt-4 flex h-56 items-end justify-center gap-10 sm:gap-16">
            {histo.map((h) => (
              <div
                key={h.label}
                className="flex h-full w-24 flex-col items-center justify-end sm:w-32"
              >
                <span className="mb-1 text-lg font-bold text-brand-blue">
                  {h.count}
                </span>
                <div
                  className={`w-full rounded-t-lg ${h.bar}`}
                  style={{ height: `${Math.max(4, (h.count / histoMax) * 100)}%` }}
                />
                <span className="mt-2 text-center text-xs font-medium text-slate-600">
                  {h.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* TABLEAU DE SUIVI */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="bg-brand-blue px-5 py-3 text-base font-bold text-white">
            Suivi des textes — {perimetreLabel}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">N° Ordre</th>
                  <th className="px-4 py-3">Référence du texte</th>
                  <th className="px-4 py-3">Résumé</th>
                  <th className="px-4 py-3">Date d&apos;entrée en vigueur</th>
                  <th className="px-4 py-3">Taux d&apos;avancement</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {alertes.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-brand-blue">
                      {a.numeroOrdre}
                    </td>
                    <td className="px-4 py-3">
                      <span className="mb-1 inline-block rounded bg-brand-blue/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-blue">
                        {a.natureTexte}
                      </span>
                      <span className="block text-xs text-slate-700">
                        {a.referenceTexte}
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                      <span className="line-clamp-2">{a.resumeTexte}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-700">
                      {formatDateFR(a.dateEntreeVigueur)}
                    </td>
                    <td className="min-w-36 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-brand-blue"
                            style={{ width: `${a.tauxAvancement}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-slate-700">
                          {a.tauxAvancement} %
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[a.statut]}`}
                      >
                        {STATUT_LABEL[a.statut]}
                      </span>
                    </td>
                  </tr>
                ))}
                {alertes.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-slate-400"
                    >
                      Aucune alerte sur ce périmètre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
