"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ConformiteStatut,
  DepartementCode,
  FluxStatut,
} from "@/domain/veille";
import {
  BU_PROPOSITIONNABLES,
  CONFORMITE_POURCENTAGE,
  DEPARTEMENTS,
  FLUX_STATUT_LABELS,
} from "@/domain/veille";
import { messageAccesRefuse, peutStatuerAssignation } from "@/domain/acces";
import { SelecteurBUConnectee, entetesAuteur, useBuConnectee } from "@/components/ContexteBU";
import { MOCK_ALERTES, type MockAlerte } from "@/data/veille-mock";
import {
  PreuveFichierInput,
  urlPreuve,
  type PreuveFichierValeur,
} from "@/components/PreuveFichierInput";

type BUConcernee = (typeof BU_PROPOSITIONNABLES)[number];

interface ApiFiche {
  id: string;
  departement: DepartementCode;
  statutConformite: ConformiteStatut;
  fluxStatut?: FluxStatut;
  preuveDifferee?: string | null;
  actionsExistantes?: string | null;
  preuvesExistantes?: string | null;
  preuveFichierNom?: string | null;
  preuveFichierMime?: string | null;
  preuveFichierDonnees?: string | null;
  actionsAmelioration: {
    id: string;
    libelleAction: string;
    delai: string | null;
    tauxAvancement: number;
    responsable?: { email: string } | null;
  }[];
}

interface ApiAlerte {
  id: string;
  numeroOrdre: string;
  qssfte?: string | null;
  natureTexte: string;
  referenceTexte: string;
  article?: string | null;
  resumeTexte: string;
  libelleApplicable?: string;
  moyenCommunication?: string | null;
  dateEntreeVigueur: string | null;
  createdAt: string;
  fichesDepartements: ApiFiche[];
}

interface FicheApprobation extends MockAlerte {
  fluxStatut: FluxStatut;
  actionId: string | null;
  // Texte assigné (lecture seule — déjà rempli à l'assignation).
  article: string;
  libelleApplicable: string;
  moyenCommunication: string;
  qssfte: string;
  // Champs BU (à remplir / compléter à l'approbation).
  actionsExistantes: string;
  preuvesExistantes: string;
  preuveFichierNom: string;
  preuveFichierMime: string;
  preuveFichierDonnees: string;
  libelleAction: string;
  responsable: string;
  delai: string;
  preuveDifferee: string;
}

const FLUX_DEMO: FluxStatut[] = [
  "ATTENTE_VALIDATION_JURIDIQUE",
  "ATTENTE_APPROBATION_METIER",
  "APPROUVE_METIER",
  "REJETE_METIER",
];

const STATUTS_CONFORMITE: { code: ConformiteStatut; label: string }[] = [
  { code: "NON_CONFORME_0", label: "Non conforme (0 %)" },
  { code: "PARTIELLEMENT_25", label: "Partiellement — 25 %" },
  { code: "PARTIELLEMENT_50", label: "Partiellement — 50 %" },
  { code: "PARTIELLEMENT_75", label: "Partiellement — 75 %" },
  { code: "CONFORME_100", label: "Conforme (100 %)" },
];

export default function ApprobationsPage() {
  // File affichée (démo) + BU réellement connectée (cloisonnement) : seule la
  // BU connectée peut approuver / rejeter ses assignations.
  const [bu, setBu] = useState<BUConcernee>("DRH");
  const { bu: buConnectee, email: emailConnecte } = useBuConnectee();
  const [fiches, setFiches] = useState<FicheApprobation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [formOuvert, setFormOuvert] = useState<string | null>(null);
  const [libelleAction, setLibelleAction] = useState("");
  const [responsable, setResponsable] = useState("");
  const [delai, setDelai] = useState("");
  const [taux, setTaux] = useState(25);
  const [statut, setStatut] = useState<ConformiteStatut>("PARTIELLEMENT_25");
  const [preuveDifferee, setPreuveDifferee] = useState("");
  const [actionsExistantes, setActionsExistantes] = useState("");
  const [preuvesExistantes, setPreuvesExistantes] = useState("");
  const [preuveFichier, setPreuveFichier] = useState<PreuveFichierValeur | null>(null);
  const [noteResp, setNoteResp] = useState(false);
  const [traitement, setTraitement] = useState(false);

  useEffect(() => {
    let actif = true;
    fetch("/api/veille")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { success?: boolean; data?: ApiAlerte[] } | null) => {
        if (!actif || !payload?.success || !Array.isArray(payload.data)) return;
        const rows: FicheApprobation[] = [];
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
              actionId: action?.id ?? null,
              article: a.article ?? "",
              libelleApplicable: a.libelleApplicable ?? "",
              moyenCommunication: a.moyenCommunication ?? "",
              qssfte: a.qssfte ?? "",
              actionsExistantes: f.actionsExistantes ?? "",
              preuvesExistantes: f.preuvesExistantes ?? "",
              preuveFichierNom: f.preuveFichierNom ?? "",
              preuveFichierMime: f.preuveFichierMime ?? "",
              preuveFichierDonnees: f.preuveFichierDonnees ?? "",
              libelleAction: action?.libelleAction ?? "",
              responsable: action?.responsable?.email ?? "",
              delai: (action?.delai ?? "").slice(0, 10),
              preuveDifferee: f.preuveDifferee ?? "",
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

  // Socle démo : mocks positionnés en attente d'approbation (sans DB).
  const fichesDemo = useMemo<FicheApprobation[]>(
    () =>
      MOCK_ALERTES.map((m, i) => ({
        ...m,
        fluxStatut: FLUX_DEMO[i % FLUX_DEMO.length],
        actionId: null,
        article: "",
        libelleApplicable: "",
        moyenCommunication: "",
        qssfte: "",
        actionsExistantes: "",
        preuvesExistantes: "",
        preuveFichierNom: "",
        preuveFichierMime: "",
        preuveFichierDonnees: "",
        libelleAction: "",
        responsable: "",
        delai: "",
        preuveDifferee: "",
      })),
    [],
  );

  const enAttente = useMemo(
    () =>
      [...fiches, ...fichesDemo.filter((d) => !fiches.some((f) => f.id === d.id))]
        .filter((f) => f.departement === bu && f.fluxStatut === "ATTENTE_APPROBATION_METIER")
        .sort((a, b) => a.numeroOrdre.localeCompare(b.numeroOrdre)),
    [fiches, fichesDemo, bu],
  );

  function ouvrirFormulaire(f: FicheApprobation) {
    setFormOuvert(f.id);
    setLibelleAction(f.libelleAction || "");
    setResponsable(f.responsable || "");
    setDelai(f.delai || "");
    setTaux(f.tauxAvancement || 25);
    setStatut(f.statut === "NON_CONFORME_0" ? "PARTIELLEMENT_25" : f.statut);
    setPreuveDifferee(f.preuveDifferee || "");
    setActionsExistantes(f.actionsExistantes || "");
    setPreuvesExistantes(f.preuvesExistantes || "");
    setPreuveFichier(
      f.preuveFichierNom && f.preuveFichierDonnees
        ? {
            nom: f.preuveFichierNom,
            mime: f.preuveFichierMime || "application/octet-stream",
            donnees: f.preuveFichierDonnees,
          }
        : null,
    );
    setNoteResp(false);
    setMessage(null);
  }

  async function rejeter(f: FicheApprobation) {
    if (!peutStatuerAssignation(buConnectee, f.departement)) {
      setMessage(`🔒 ${messageAccesRefuse(buConnectee, f.departement)} Basculez la BU connectée (en haut) vers ${f.departement} pour statuer.`);
      return;
    }
    setTraitement(true);
    setMessage(null);
    // Optimiste : la fiche repart au juridique (retirée de la file métier).
    setFiches((prev) => {
      if (prev.some((p) => p.id === f.id)) {
        return prev.map((p) => (p.id === f.id ? { ...p, fluxStatut: "REJETE_METIER" as FluxStatut } : p));
      }
      return [...prev, { ...f, fluxStatut: "REJETE_METIER" as FluxStatut }];
    });
    try {
      const reponse = await fetch(`/api/veille/${encodeURIComponent(f.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...entetesAuteur(buConnectee, emailConnecte) },
        body: JSON.stringify({ fluxStatut: "REJETE_METIER" }),
      });
      if (!reponse.ok) {
        const payload = (await reponse.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Rejet refusé (droits BU).");
        return;
      }
    } catch {
      /* démo locale : transition optimiste suffisante */
    } finally {
      setTraitement(false);
      setMessage(`Fiche ${f.numeroOrdre} renvoyée au juridique (rejet d'assignation).`);
      if (formOuvert === f.id) setFormOuvert(null);
    }
  }

  async function approuver(f: FicheApprobation) {
    if (!peutStatuerAssignation(buConnectee, f.departement)) {
      setMessage(`🔒 ${messageAccesRefuse(buConnectee, f.departement)} Basculez la BU connectée (en haut) vers ${f.departement} pour approuver.`);
      return;
    }
    if (!libelleAction.trim()) {
      setMessage("Renseignez l'action de mise en conformité avant d'approuver.");
      return;
    }
    setTraitement(true);
    setMessage(null);
    setNoteResp(false);
    setFiches((prev) => {
      const maj: FicheApprobation = {
        ...f,
        fluxStatut: "APPROUVE_METIER",
        statut,
        tauxAvancement: taux,
        libelleAction: libelleAction.trim(),
        responsable: responsable.trim(),
        delai,
        preuveDifferee,
        actionsExistantes,
        preuvesExistantes,
        preuveFichierNom: preuveFichier?.nom ?? "",
        preuveFichierMime: preuveFichier?.mime ?? "",
        preuveFichierDonnees: preuveFichier?.donnees ?? "",
      };
      if (prev.some((p) => p.id === f.id)) {
        return prev.map((p) => (p.id === f.id ? maj : p));
      }
      return [...prev, maj];
    });
    try {
      const reponse = await fetch(`/api/veille/${encodeURIComponent(f.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...entetesAuteur(buConnectee, emailConnecte) },
        body: JSON.stringify({
          fluxStatut: "APPROUVE_METIER",
          libelleAction: libelleAction.trim(),
          responsable: responsable.trim(),
          delai,
          tauxAvancement: taux,
          statutConformite: statut,
          preuveDifferee,
          actionsExistantes,
          preuvesExistantes,
          preuveFichierNom: preuveFichier?.nom ?? "",
          preuveFichierMime: preuveFichier?.mime ?? "",
          preuveFichierDonnees: preuveFichier?.donnees ?? "",
          actionId: f.actionId,
        }),
      });
      const payload = (await reponse.json().catch(() => null)) as {
        success?: boolean;
        responsableNonLie?: boolean;
        error?: string;
      } | null;
      if (!reponse.ok) {
        setMessage(payload?.error ?? "Approbation refusée (droits BU).");
        return;
      }
      if (payload?.responsableNonLie) setNoteResp(true);
    } catch {
      /* démo locale : transition optimiste suffisante */
    } finally {
      setTraitement(false);
      setFormOuvert(null);
      setMessage(
        `Fiche ${f.numeroOrdre} approuvée : conformité initialisée à ${taux} % (${FLUX_STATUT_LABELS.APPROUVE_METIER}).`,
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* En-tête AGL sticky */}
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-sm font-black text-brand-blue">
              AGL
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">
                Approbations métier — JuriDesk
              </p>
              <p className="text-xs text-slate-300">
                Double validation : le juridique a validé, la BU approuve ou rejette
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelecteurBUConnectee />
            <Link
              href="/dashboard/historique"
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              🕘 Historique
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-gold hover:text-brand-blue"
            >
              ← Pilotage juridique
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {/* File affichée (filtre démo) + cloisonnement par BU connectée */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-brand-blue">
                File d&apos;approbation affichée
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Filtre d&apos;affichage (DRH, DAF…) — mais seules les fiches de votre BU
                connectée ({buConnectee}) sont approuvables / rejetables (les autres sont
                verrouillées 🔒). Basculez la BU connectée en haut pour changer de périmètre d&apos;action.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                BU
              </span>
              <select
                value={bu}
                onChange={(e) => {
                  setBu(e.target.value as BUConcernee);
                  setFormOuvert(null);
                  setMessage(null);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-bold text-brand-blue"
              >
                {BU_PROPOSITIONNABLES.map((code) => (
                  <option key={code} value={code}>
                    {code} — {DEPARTEMENTS[code]}
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

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="bg-brand-blue px-5 py-3 text-base font-bold text-white">
            File d&apos;attente d&apos;approbation — {bu} ({enAttente.length})
          </h2>
          {enAttente.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              Aucune fiche en attente d&apos;approbation pour {bu}. Les fiches
              validées par le juridique apparaîtront ici.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {enAttente.map((f) => (
                <li key={f.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-brand-blue">
                        {f.numeroOrdre} · {f.natureTexte}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {f.referenceTexte}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {f.resumeTexte}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-slate-500">
                        Entrée en vigueur : {f.dateEntreeVigueur}
                      </p>
                      <p className="mt-1 text-xs font-bold tabular-nums text-brand-blue">
                        Statut de conformité : {STATUTS_CONFORMITE.find((s) => s.code === f.statut)?.label ?? f.statut} · {f.tauxAvancement} %
                      </p>
                      {f.preuveFichierNom && f.preuveFichierDonnees && (
                        <p className="mt-1">
                          <a
                            href={urlPreuve(f.preuveFichierMime, f.preuveFichierDonnees)}
                            download={f.preuveFichierNom}
                            title="Télécharger le document de preuve"
                            className="inline-block max-w-full truncate text-xs font-semibold text-brand-blue underline decoration-brand-gold decoration-2 underline-offset-2"
                          >
                            📎 {f.preuveFichierNom}
                          </a>
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                      {FLUX_STATUT_LABELS.ATTENTE_APPROBATION_METIER}
                    </span>
                  </div>

                  {formOuvert === f.id ? (
                    <div className="grid gap-4 rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">
                        Approuver et remplir la conformité (réservé à {bu})
                      </p>
                      {noteResp && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                          Responsable non rattaché (aucun User avec cet email) — autres champs enregistrés.
                        </p>
                      )}
                      {/* Texte assigné — déjà rempli, lecture seule */}
                      <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <legend className="bg-white px-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Texte assigné par le juridique (lecture seule)
                        </legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Lecture label="N° d'ordre" valeur={f.numeroOrdre} mono />
                          <Lecture label="Nature du texte" valeur={f.natureTexte} />
                        </div>
                        <Lecture label="Référence du texte" valeur={f.referenceTexte} />
                        <Lecture label="Résumé du texte" valeur={f.resumeTexte} />
                        <Lecture label="Libellé applicable" valeur={f.libelleApplicable || "—"} />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Lecture label="Article" valeur={f.article || "—"} />
                          <Lecture label="Entrée en vigueur" valeur={f.dateEntreeVigueur || "—"} />
                          <Lecture label="Moyen de communication" valeur={f.moyenCommunication || "—"} />
                        </div>
                      </fieldset>
                      {/* Conformité BU — à remplir / compléter */}
                      <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <legend className="bg-white px-2 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                          Conformité {bu} — à remplir
                        </legend>
                        <label className="block text-sm">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Actions conformité existantes
                          </span>
                          <textarea
                            value={actionsExistantes}
                            onChange={(e) => setActionsExistantes(e.target.value)}
                            rows={2}
                            className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue"
                            placeholder="Ex. Registre des traitements déjà tenu à jour"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Preuves de conformité existantes
                          </span>
                          <textarea
                            value={preuvesExistantes}
                            onChange={(e) => setPreuvesExistantes(e.target.value)}
                            rows={2}
                            className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue"
                            placeholder="Ex. PV du comité de conformité du 12/03"
                          />
                          <span className="mt-2 block">
                            <PreuveFichierInput valeur={preuveFichier} onChange={setPreuveFichier} />
                          </span>
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm">
                            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                              Statut de conformité
                            </span>
                            <select
                              value={statut}
                              onChange={(e) => setStatut(e.target.value as ConformiteStatut)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-semibold text-brand-blue"
                            >
                              {STATUTS_CONFORMITE.map((s) => (
                                <option key={s.code} value={s.code}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                              Preuve de conformité différée
                            </span>
                            <textarea
                              value={preuveDifferee}
                              onChange={(e) => setPreuveDifferee(e.target.value)}
                              rows={2}
                              className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue"
                              placeholder="Ex. Attestation à transmettre après l'audit de juin"
                            />
                          </label>
                        </div>
                      </fieldset>
                      {/* Plan d'action BU */}
                      <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <legend className="bg-white px-2 text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                          Plan d&apos;action {bu}
                        </legend>
                        <label className="block text-sm">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Action de mise en conformité *
                          </span>
                          <textarea
                            value={libelleAction}
                            onChange={(e) => setLibelleAction(e.target.value)}
                            rows={2}
                            className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue"
                            placeholder="Ex. Mettre à jour le règlement intérieur et former les managers"
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block text-sm">
                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Responsable (email d&apos;un User existant)
                            </span>
                            <input
                              type="text"
                              value={responsable}
                              onChange={(e) => setResponsable(e.target.value)}
                              placeholder="prenom.nom@agl-ci.com"
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800 outline-none focus:border-brand-blue"
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Délai
                            </span>
                            <input
                              type="date"
                              value={delai}
                              onChange={(e) => setDelai(e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-800"
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                              Niveau de conformité — {taux} %
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={taux}
                              onChange={(e) => setTaux(Number(e.target.value))}
                              className="w-full accent-[#1C3359]"
                            />
                          </label>
                        </div>
                      </fieldset>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => approuver(f)}
                          disabled={traitement}
                          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {traitement ? "Enregistrement…" : "Approuver & Enregistrer la Conformité"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormOuvert(null)}
                          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-brand-blue hover:text-brand-blue"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {peutStatuerAssignation(buConnectee, f.departement) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => rejeter(f)}
                            disabled={traitement}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
                          >
                            Rejeter l&apos;assignation
                          </button>
                          <button
                            type="button"
                            onClick={() => ouvrirFormulaire(f)}
                            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:flex-none sm:px-6"
                          >
                            Approuver & Initialiser la Conformité
                          </button>
                        </>
                      ) : (
                        <p
                          title={messageAccesRefuse(buConnectee, f.departement)}
                          className="w-full rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500"
                        >
                          🔒 Fiche {f.departement} en lecture seule — connectez-vous en {f.departement} (sélecteur en haut) pour approuver ou rejeter.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

/** Champ en lecture seule : valeur déjà remplie à l'assignation. */
function Lecture({
  label,
  valeur,
  mono = false,
}: {
  label: string;
  valeur: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5 text-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-0.5 text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {valeur}
      </p>
    </div>
  );
}
