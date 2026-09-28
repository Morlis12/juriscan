"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ConformiteStatut,
  DepartementCode,
  FluxStatut,
} from "@/domain/veille";
import { CONFORMITE_POURCENTAGE, DEPARTEMENTS } from "@/domain/veille";
import { dureeDepuis, formaterDateFR } from "@/domain/jalons";
import { jalonsDemoPourFiche } from "@/data/historique-demo";
import { estCentrale, peutGererRejet } from "@/domain/acces";
import { useBuConnectee, PastilleSession } from "@/components/SessionBU";
import { LogoAGL } from "@/components/LogoAGL";
import { NavOnglets } from "@/components/NavOnglets";
import { MOCK_ALERTES, type MockAlerte } from "@/data/veille-mock";

interface ApiFiche {
  id: string;
  departement: DepartementCode;
  statutConformite: ConformiteStatut;
  fluxStatut?: FluxStatut;
  /** Date d'assignation à la BU (= création de la fiche). */
  createdAt: string;
  /** Jalons workflow (dernières dates du journal SCD2). */
  jalons?: {
    valideeLe: string | null;
    renvoyeeLe: string | null;
    rejeteeLe: string | null;
    approuveeLe: string | null;
  } | null;
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

interface FicheRejet extends MockAlerte {
  fluxStatut: FluxStatut;
  /** Date d'assignation à la BU (SQL : fiche.createdAt ; démo : journal CREATION). */
  assigneeLe: string | null;
  /** Date du rejet (SQL : journal REJET_BU ; démo : simulé). */
  rejeteeLe: string | null;
}

const FLUX_DEMO: FluxStatut[] = [
  "ATTENTE_VALIDATION_JURIDIQUE",
  "ATTENTE_APPROBATION_METIER",
  "APPROUVE_METIER",
  "REJETE_METIER",
];

/**
 * JuriDesk — Rejets à retraiter (vue juridique).
 * Les BU ont refusé l'assignation : le juridique modifie (réassignation
 * éventuelle) puis renvoie la fiche vers la BU (→ attente d'approbation).
 */
export default function RejetsPage() {
  const [fiches, setFiches] = useState<FicheRejet[]>([]);
  const [filtreBU, setFiltreBU] = useState<"ALL" | DepartementCode>("ALL");
  const [message, setMessage] = useState<string | null>(null);
  const [traitement, setTraitement] = useState(false);
  // Retraitement réservé à la centrale ; les BU voient leurs rejets en lecture.
  const { bu: buConnectee, estCentrale: estCentraleSession } = useBuConnectee();
  const centrale = estCentrale(buConnectee);

  useEffect(() => {
    let actif = true;
    fetch("/api/veille")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { success?: boolean; data?: ApiAlerte[] } | null) => {
        if (!actif || !payload?.success || !Array.isArray(payload.data)) return;
        const rows: FicheRejet[] = [];
        for (const a of payload.data) {
          for (const f of a.fichesDepartements) {
            const action = f.actionsAmelioration[0];
            rows.push({
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
              assigneeLe: f.createdAt ?? null,
              rejeteeLe: f.jalons?.rejeteeLe ?? null,
            });
          }
        }
        setFiches((prev) => {
          const ids = new Set(rows.map((r) => r.id));
          return [...rows, ...prev.filter((p) => !ids.has(p.id) && p.id.startsWith("db-"))];
        });
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, []);

  const fichesDemo = useMemo<FicheRejet[]>(
    () =>
      MOCK_ALERTES.map((m, i) => {
        const jalons = jalonsDemoPourFiche(m.id);
        return {
          ...m,
          fluxStatut: FLUX_DEMO[i % FLUX_DEMO.length],
          assigneeLe: jalons.assigneeLe,
          rejeteeLe: jalons.rejeteeLe,
        };
      }),
    [],
  );

  const rejets = useMemo(
    () =>
      [...fiches, ...fichesDemo.filter((d) => !fiches.some((f) => f.id === d.id))]
        .filter(
          (f) =>
            f.fluxStatut === "REJETE_METIER" &&
            (filtreBU === "ALL" || f.departement === filtreBU),
        )
        .sort((a, b) => a.numeroOrdre.localeCompare(b.numeroOrdre)),
    [fiches, fichesDemo, filtreBU],
  );

  /** Retraite le rejet : renvoie la fiche vers la BU (attente d'approbation). */
  async function renvoyerVersBU(f: FicheRejet) {
    if (!peutGererRejet(buConnectee)) {
      setMessage("🔒 Renvoi vers la BU : réservé à la centrale (CENTRAL_VRG).");
      return;
    }
    setTraitement(true);
    setMessage(null);
    setFiches((prev) => {
      const maj: FicheRejet = { ...f, fluxStatut: "ATTENTE_APPROBATION_METIER" };
      if (prev.some((p) => p.id === f.id)) {
        return prev.map((p) => (p.id === f.id ? maj : p));
      }
      return [...prev, maj];
    });
    try {
      const reponse = await fetch(`/api/veille/${encodeURIComponent(f.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ fluxStatut: "ATTENTE_APPROBATION_METIER" }),
      });
      if (!reponse.ok) {
        const payload = (await reponse.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Renvoi refusé (réservé à la centrale).");
        return;
      }
    } catch {
      /* démo locale : transition optimiste suffisante */
    } finally {
      setTraitement(false);
      setMessage(`Fiche ${f.numeroOrdre} (${f.departement}) renvoyée vers la BU.`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoAGL />
            <div>
              <p className="text-lg font-bold leading-tight">
                Rejets à retraiter — AGL JuriCompliance
              </p>
              <p className="text-xs text-slate-300">
                Les BU ont refusé : modifiez puis renvoyez vers la BU
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NavOnglets actif="rejet" estCentrale={estCentraleSession} />
            <span aria-hidden="true" className="hidden h-6 w-px bg-white/20 sm:block" />
            <PastilleSession />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
                Filtrer les rejets
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {rejets.length} rejet{rejets.length > 1 ? "s" : ""} à retraiter
                {filtreBU !== "ALL" ? ` · BU : ${filtreBU}` : ""}. Retraitement réservé à la
                centrale — connecté : <span className="font-semibold">{buConnectee}</span>.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                BU
              </span>
              <select
                value={filtreBU}
                onChange={(e) => {
                  setFiltreBU(e.target.value as "ALL" | DepartementCode);
                  setMessage(null);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-bold text-brand-blue"
              >
                <option value="ALL">Toutes les BU</option>
                {(Object.keys(DEPARTEMENTS) as DepartementCode[])
                  .filter((c) => c !== "CENTRAL_VRG")
                  .map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </section>

        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
            {message}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm">
          <h2 className="bg-red-600 px-5 py-3 text-base font-bold text-white">
            Rejets à retraiter ({rejets.length})
          </h2>
          {rejets.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              Aucun rejet à retraiter{filtreBU !== "ALL" ? ` pour ${filtreBU}` : ""}. 🎉
            </p>
          ) : (
            <ul className="divide-y divide-red-50">
              {rejets.map((f) => (
                <li key={f.id} className="space-y-2 px-5 py-4 hover:bg-red-50/50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-brand-blue">
                        {f.numeroOrdre} · {f.natureTexte} · {f.departement}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {f.referenceTexte}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {f.resumeTexte}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        <span>
                          Assignée le{" "}
                          <span className="font-semibold text-slate-700">
                            {formaterDateFR(f.assigneeLe)}
                          </span>
                        </span>
                        <span>
                          Rejetée le{" "}
                          <span className="font-semibold text-red-700">
                            {formaterDateFR(f.rejeteeLe)}
                          </span>
                          {f.rejeteeLe && ` — il y a ${dureeDepuis(f.rejeteeLe)}`}
                        </span>
                      </p>
                    </div>
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-600/20">
                      Rejeté par la BU
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {centrale ? (
                      <Link
                        href={`/dashboard/alertes/${f.id}`}
                        className="rounded-lg border border-brand-blue px-4 py-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue hover:text-white"
                      >
                        Modifier / réassigner
                      </Link>
                    ) : (
                      <span
                        title="Retraitement : réservé à la centrale"
                        className="cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-400"
                      >
                        🔒 Modifier / réassigner
                      </span>
                    )}
                    {centrale ? (
                      <button
                        type="button"
                        onClick={() => renvoyerVersBU(f)}
                        disabled={traitement}
                        className="rounded-lg bg-brand-gold px-4 py-2 text-xs font-bold text-brand-blue shadow-sm transition-colors hover:brightness-95 disabled:opacity-50"
                      >
                        {traitement ? "Envoi…" : "Renvoyer à la BU →"}
                      </button>
                    ) : (
                      <span className="rounded-lg bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
                        🔒 Renvoi réservé à la centrale
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
