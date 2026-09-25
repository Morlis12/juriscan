"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ConformiteStatut, DepartementCode, FluxStatut } from "@/domain/veille";
import {
  CONFORMITE_POURCENTAGE,
  DEPARTEMENTS,
  FLUX_STATUT_LABELS,
} from "@/domain/veille";
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
  fluxStatut?: FluxStatut;
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
  propositionBU?: DepartementCode | null;
  createdAt: string;
  fichesDepartements: ApiFiche[];
}

/** Alerte affichée : mock ou DB, enrichie du workflow double validation. */
type AlertePilotee = MockAlerte & {
  fluxStatut: FluxStatut;
  propositionBU?: string | null;
};

type FiltreBUCode = "ALL" | DepartementCode;

/** Options du filtre par BU (l'onglet Général unique affiche tout par défaut). */
const BU_OPTIONS: { code: DepartementCode; label: string }[] = [
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

const FLUX_BADGE: Record<FluxStatut, string> = {
  ATTENTE_VALIDATION_JURIDIQUE:
    "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-600/20",
  ATTENTE_APPROBATION_METIER:
    "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  APPROUVE_METIER:
    "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-600/20",
  REJETE_METIER: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-600/20",
};

/** Démonstration : répartit les mocks sur le cycle de vie pour piloter le flux sans DB. */
const FLUX_DEMO: FluxStatut[] = [
  "ATTENTE_VALIDATION_JURIDIQUE",
  "ATTENTE_APPROBATION_METIER",
  "APPROUVE_METIER",
  "REJETE_METIER",
];

function formatDateFR(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Couleur du niveau de conformité : vert ≥ 75 %, or 25-74 %, rouge < 25 %. */
function couleurNiveau(taux: number): string {
  if (taux >= 75) return "bg-emerald-500";
  if (taux >= 25) return "bg-brand-gold";
  return "bg-red-500";
}

export default function DashboardPage() {
  const [now, setNow] = useState<Date | null>(null);
  const [dbAlertes, setDbAlertes] = useState<AlertePilotee[]>([]);
  const [dbActions, setDbActions] = useState<MockAction[]>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // Vue générale unique + filtres multicritères du pilotage juridique.
  const [filtreBU, setFiltreBU] = useState<FiltreBUCode>("ALL");
  const [filtreDate, setFiltreDate] = useState("");
  const [filtreType, setFiltreType] = useState("ALL");
  // Texte déplié : affiche le niveau de conformité de chaque BU pour ce texte.
  const [texteOuvert, setTexteOuvert] = useState<string | null>(null);

  // Message de succès après enregistrement / modification d'une fiche.
  useEffect(() => {
    try {
      const numero = sessionStorage.getItem("juriscan-saved");
      if (numero) {
        setConfirmation(numero);
        sessionStorage.removeItem("juriscan-saved");
      }
    } catch {
      /* stockage indisponible : pas de bannière */
    }
  }, []);

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
        const alertes: AlertePilotee[] = [];
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
              fluxStatut: f.fluxStatut ?? "ATTENTE_VALIDATION_JURIDIQUE",
              propositionBU: a.propositionBU ?? null,
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

  const toutesAlertes: AlertePilotee[] = useMemo(
    () => [
      ...dbAlertes,
      ...MOCK_ALERTES.map((m, i) => ({
        ...m,
        fluxStatut: FLUX_DEMO[i % FLUX_DEMO.length],
        propositionBU: m.departement,
      })),
    ],
    [dbAlertes],
  );
  const toutesActions = useMemo(() => [...dbActions, ...MOCK_ACTIONS], [dbActions]);

  // Types de texte disponibles pour le filtre (Décret, Loi, Arrêté…).
  const typesDisponibles = useMemo(
    () => Array.from(new Set(toutesAlertes.map((a) => a.natureTexte))).sort(),
    [toutesAlertes],
  );

  const alertes = useMemo(() => {
    return toutesAlertes.filter((a) => {
      if (filtreBU !== "ALL" && a.departement !== filtreBU) return false;
      if (filtreType !== "ALL" && a.natureTexte !== filtreType) return false;
      if (filtreDate && a.dateEntreeVigueur !== filtreDate) return false;
      return true;
    });
  }, [toutesAlertes, filtreBU, filtreType, filtreDate]);
  /** Le juridique valide la fiche IA → bascule vers l'approbation métier. */
  async function validerVersMetier(id: string) {
    setDbAlertes((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, fluxStatut: "ATTENTE_APPROBATION_METIER" } : a,
      ),
    );
    try {
      await fetch(`/api/veille/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fluxStatut: "ATTENTE_APPROBATION_METIER" }),
      });
    } catch {
      /* démo locale : la transition optimiste suffit */
    }
  }

  /** Regroupement par texte : un texte → N fiches BU (multi-assignation). */
  interface GroupeTexte {
    numeroOrdre: string;
    natureTexte: string;
    referenceTexte: string;
    resumeTexte: string;
    dateEntreeVigueur: string;
    fiches: AlertePilotee[];
    tauxMoyen: number;
  }
  const groupes = useMemo<GroupeTexte[]>(() => {
    const carte = new Map<string, GroupeTexte>();
    for (const a of alertes) {
      const existant = carte.get(a.numeroOrdre);
      if (existant) {
        existant.fiches.push(a);
      } else {
        carte.set(a.numeroOrdre, {
          numeroOrdre: a.numeroOrdre,
          natureTexte: a.natureTexte,
          referenceTexte: a.referenceTexte,
          resumeTexte: a.resumeTexte,
          dateEntreeVigueur: a.dateEntreeVigueur,
          fiches: [a],
          tauxMoyen: 0,
        });
      }
    }
    const liste = [...carte.values()];
    for (const g of liste) {
      g.tauxMoyen = Math.round(
        g.fiches.reduce((somme, f) => somme + f.tauxAvancement, 0) / g.fiches.length,
      );
    }
    return liste.sort((x, y) => x.numeroOrdre.localeCompare(y.numeroOrdre));
  }, [alertes]);

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

  const perimetreLabel =
    filtreBU === "ALL" ? "Vue générale" : DEPARTEMENTS[filtreBU as DepartementCode];

  const filtresActifs = filtreBU !== "ALL" || filtreType !== "ALL" || filtreDate !== "";

  function reinitialiserFiltres() {
    setFiltreBU("ALL");
    setFiltreType("ALL");
    setFiltreDate("");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* EN-TÊTE FIXE AGL — vue générale unique du pilotage juridique */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-brand-blue/95 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-sm font-black tracking-tight text-brand-blue">
              AGL
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">
                AGL - JuriScan AI · Pilotage Juridique
              </p>
              <p className="text-xs capitalize text-slate-300">{dateStr}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono tabular-nums text-slate-100">
              {timeStr}
            </span>
            <Link
              href="/dashboard/approbations"
              className="rounded-full bg-brand-gold px-4 py-1.5 text-xs font-bold text-brand-blue shadow transition-colors hover:brightness-95"
            >
              Approbations métier →
            </Link>
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              SQL synchronisé
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {/* FILTRES MULTICRITÈRES — pilotage juridique */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
              Filtres du pilotage juridique
            </h2>
            {filtresActifs && (
              <button
                type="button"
                onClick={reinitialiserFiltres}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-brand-blue hover:text-brand-blue"
              >
                Réinitialiser les filtres ✕
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Filtrer par BU
              </span>
              <select
                value={filtreBU}
                onChange={(e) => setFiltreBU(e.target.value as FiltreBUCode)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-brand-blue"
              >
                <option value="ALL">Toutes les BU</option>
                {BU_OPTIONS.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Filtrer par date d&apos;entrée en vigueur
              </span>
              <input
                type="date"
                value={filtreDate}
                onChange={(e) => setFiltreDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800"
              />
            </label>
            <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Filtrer par type de texte
              </span>
              <select
                value={filtreType}
                onChange={(e) => setFiltreType(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800"
              >
                <option value="ALL">Tous les types</option>
                {typesDisponibles.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtresActifs && (
            <p className="mt-2 text-xs text-slate-500">
              {alertes.length} résultat{alertes.length > 1 ? "s" : ""} après filtres
              {filtreBU !== "ALL" ? ` · BU : ${filtreBU}` : ""}
              {filtreType !== "ALL" ? ` · Type : ${filtreType}` : ""}
              {filtreDate ? ` · Date : ${filtreDate}` : ""}.
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Périmètre : <span className="font-semibold text-brand-blue">{perimetreLabel}</span>
            {" — "}
            {groupes.length} texte{groupes.length > 1 ? "s" : ""} · {alertes.length} fiche
            {alertes.length > 1 ? "s" : ""} BU
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/approbations"
              className="rounded-lg border border-brand-blue px-4 py-2 text-sm font-semibold text-brand-blue transition-colors hover:bg-brand-blue hover:text-white"
            >
              Approbations métier
            </Link>
            <Link
              href="/dashboard/nouvelle-alerte"
              className="rounded-lg border border-brand-gold bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-blue/90"
            >
              ➕ Nouvelle Alerte
            </Link>
          </div>
        </div>

        {confirmation && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
            <span>✅ Fiche {confirmation} enregistrée avec succès.</span>
            <button
              type="button"
              onClick={() => setConfirmation(null)}
              className="rounded-full px-2 py-0.5 text-emerald-700 hover:bg-emerald-100"
              aria-label="Fermer la confirmation"
            >
              ✕
            </button>
          </div>
        )}

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

        {/* NIVEAU DE CONFORMITÉ PAR TEXTE — barres horizontales cliquables */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-brand-blue">
            Niveau de conformité par texte
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Taux moyen des BU assignées à chaque texte — cliquez une barre pour
            voir le détail par BU dans le tableau ci-dessous.
          </p>
          {groupes.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Aucun texte sur ce périmètre.
            </p>
          ) : (
            <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
              {groupes.map((g) => {
                const actif = texteOuvert === g.numeroOrdre;
                return (
                  <li key={g.numeroOrdre}>
                    <button
                      type="button"
                      onClick={() => setTexteOuvert(actif ? null : g.numeroOrdre)}
                      title={`${g.referenceTexte} — voir le détail par BU`}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        actif
                          ? "border-brand-gold bg-brand-gold/10"
                          : "border-slate-100 bg-slate-50 hover:border-brand-blue/40 hover:bg-brand-blue/5"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-mono font-bold text-brand-blue">
                          {g.numeroOrdre}
                          <span
                            className="ml-2 truncate font-sans font-medium text-slate-500"
                            title={`BU concernées : ${g.fiches.map((f) => f.departement).join(", ")}`}
                          >
                            {g.referenceTexte} · BU : {g.fiches.map((f) => f.departement).join(", ")}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-brand-blue">
                          {g.tauxMoyen} %
                        </span>
                      </span>
                      <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-slate-200">
                        <span
                          className={`block h-full rounded-full ${couleurNiveau(g.tauxMoyen)}`}
                          style={{ width: `${g.tauxMoyen}%` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 flex flex-wrap gap-3 text-[11px] font-medium text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> ≥ 75 %
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-gold" /> 25 – 74 %
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> &lt; 25 %
            </span>
          </p>
        </section>

        {/* TABLEAU DE SUIVI — groupé par texte, conformité détaillée par BU */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="bg-brand-blue px-5 py-3 text-base font-bold text-white">
            Suivi des textes — {perimetreLabel} · Cliquez un texte pour voir chaque BU
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">N° Ordre</th>
                  <th className="px-4 py-3">Référence du texte</th>
                  <th className="px-4 py-3">Résumé</th>
                  <th className="px-4 py-3">Date d&apos;entrée en vigueur</th>
                  <th className="px-4 py-3">BU concernées</th>
                  <th className="px-4 py-3">Taux moyen</th>
                  <th className="px-4 py-3">Conformité par BU</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => {
                  const ouvert = texteOuvert === g.numeroOrdre;
                  return (
                    <Fragment key={g.numeroOrdre}>
                      <tr
                        onClick={() => setTexteOuvert(ouvert ? null : g.numeroOrdre)}
                        className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${ouvert ? "bg-brand-blue/5" : ""}`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-brand-blue">
                          <span className="mr-1 inline-block w-4 text-slate-400">
                            {ouvert ? "▾" : "▸"}
                          </span>
                          <span className="rounded px-1 py-0.5 underline decoration-brand-gold decoration-2 underline-offset-2">
                            {g.numeroOrdre}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="mb-1 inline-block rounded bg-brand-blue/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-blue">
                            {g.natureTexte}
                          </span>
                          <span className="block text-xs text-slate-700">
                            {g.referenceTexte}
                          </span>
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                          <span className="line-clamp-2">{g.resumeTexte}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-700">
                          {formatDateFR(g.dateEntreeVigueur)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex rounded-full bg-brand-blue px-2.5 py-0.5 text-xs font-bold text-white">
                            {g.fiches.length} BU
                          </span>
                        </td>
                        <td className="min-w-36 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-brand-blue"
                                style={{ width: `${g.tauxMoyen}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold tabular-nums text-slate-700">
                              {g.tauxMoyen} %
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap gap-1">
                            {g.fiches.map((f) => (
                              <span
                                key={f.id}
                                title={`${f.departement} : ${STATUT_LABEL[f.statut]} (${f.tauxAvancement} %)`}
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[f.statut]}`}
                              >
                                {f.departement} · {f.tauxAvancement} %
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                      {ouvert && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={7} className="px-4 py-3">
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                              Niveaux de conformité par BU — {g.numeroOrdre}
                            </p>
                            <ul className="grid gap-2 md:grid-cols-2">
                              {g.fiches.map((f) => (
                                <li
                                  key={f.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-brand-blue">
                                      {f.departement}
                                    </p>
                                    <p className="mt-1 flex flex-wrap items-center gap-1">
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[f.statut]}`}
                                      >
                                        {STATUT_LABEL[f.statut]} · {f.tauxAvancement} %
                                      </span>
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${FLUX_BADGE[f.fluxStatut]}`}
                                      >
                                        {FLUX_STATUT_LABELS[f.fluxStatut]}
                                      </span>
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/dashboard/alertes/${f.id}`}
                                      title="Modifier la fiche BU"
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded-lg border border-brand-blue px-2.5 py-1 text-xs font-semibold text-brand-blue hover:bg-brand-blue hover:text-white"
                                    >
                                      Modifier
                                    </Link>
                                    {f.fluxStatut === "ATTENTE_VALIDATION_JURIDIQUE" ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          validerVersMetier(f.id);
                                        }}
                                        className="rounded-lg bg-brand-gold px-2.5 py-1 text-xs font-bold text-brand-blue shadow-sm hover:brightness-95"
                                      >
                                        Valider vers métier →
                                      </button>
                                    ) : null}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {groupes.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-slate-400"
                    >
                      Aucun texte sur ce périmètre. Ajustez les filtres BU / Date / Type.
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
