"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ConformiteStatut, DepartementCode, NatureTexte } from "@/domain/veille";
import { NATURES_TEXTE } from "@/domain/veille";
import { estJuridique, messageAccesRefuse, peutModifierFiche } from "@/domain/acces";
import { SelecteurBUConnectee, entetesAuteur, useBuConnectee } from "@/components/ContexteBU";
import type { JournalEntree } from "@/domain/historique";
import { HISTORIQUE_ACTION_LABELS } from "@/domain/historique";
import {
  DEPARTEMENT_OPTIONS,
  creerAlerteVierge,
  type AlerteAnalyse21,
} from "@/domain/nouvelle-alerte";
import {
  PreuveFichierInput,
  type PreuveFichierValeur,
} from "@/components/PreuveFichierInput";
import { MOCK_ALERTES } from "@/data/veille-mock";

/**
 * JuriScan AI — Modification d'une fiche (21 colonnes, toujours éditable).
 * - Ligne persistée (`db-…`) : GET /api/veille/[id] (findUnique) → PUT → /dashboard.
 * - Ligne de démonstration (`mock-*`) : pré-remplissage local depuis les mocks,
 *   sauvegarde simulée (800ms) → /dashboard avec message de succès.
 */

const STATUTS = [
  { code: "NON_CONFORME_0", label: "Non Conforme (0 %)" },
  { code: "PARTIELLEMENT_25", label: "Partiellement Conforme (25 %)" },
  { code: "PARTIELLEMENT_50", label: "Partiellement Conforme (50 %)" },
  { code: "PARTIELLEMENT_75", label: "Partiellement Conforme (75 %)" },
  { code: "CONFORME_100", label: "Conforme (100 %)" },
] as const;

interface ApiGetData {
  alerte: {
    numeroOrdre: string;
    qssfte: string | null;
    natureTexte: string;
    referenceTexte: string;
    article: string | null;
    resumeTexte: string;
    libelleApplicable: string;
    lienHypertexte: string | null;
    dateEntreeVigueur: string | null;
    contenu: string;
    moyenCommunication: string | null;
    applicableA_AGL_CI: boolean;
    propositionBU?: DepartementCode | null;
  };
  fiche: {
    departement: DepartementCode;
    actionsExistantes: string | null;
    preuvesExistantes: string | null;
    statutConformite: ConformiteStatut;
    preuveDifferee: string | null;
    preuveFichierNom?: string | null;
    preuveFichierMime?: string | null;
    preuveFichierDonnees?: string | null;
  };
  action: {
    id: string;
    libelleAction: string;
    delai: string | null;
    tauxAvancement: number;
  } | null;
}

const isoJour = (v: string | null): string => (v ?? "").slice(0, 10);

export default function ModifierAlertePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { bu: buConnectee, email: emailConnecte } = useBuConnectee();
  const [form, setForm] = useState<AlerteAnalyse21 | null>(null);
  const [ficheBU, setFicheBU] = useState<DepartementCode | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [preuveFichier, setPreuveFichier] = useState<PreuveFichierValeur | null>(null);
  const [demo, setDemo] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [noteResp, setNoteResp] = useState(false);
  const [historique, setHistorique] = useState<JournalEntree[] | null>(null);

  useEffect(() => {
    let actif = true;

    // Démonstration : pré-remplit le formulaire depuis les données simulées.
    if (params.id.startsWith("mock-")) {
      const mock = MOCK_ALERTES.find((m) => m.id === params.id);
      if (actif) {
        if (!mock) {
          setErreur("Fiche introuvable.");
        } else {
          const socle = creerAlerteVierge();
          setFicheBU(mock.departement);
          setForm({
            ...socle,
            numeroOrdre: mock.numeroOrdre,
            natureTexte: mock.natureTexte,
            referenceTexte: mock.referenceTexte,
            resumeTexte: mock.resumeTexte,
            dateEntreeVigueur: mock.dateEntreeVigueur,
            departementResponsable: mock.departement,
            statutConformite: mock.statut,
            tauxAvancement: mock.tauxAvancement,
          });
          setDemo(true);
        }
        setChargement(false);
      }
      return () => {
        actif = false;
      };
    }

    fetch(`/api/veille/${params.id}`)
      .then(async (r) => {
        const payload = (await r.json()) as {
          success?: boolean;
          data?: ApiGetData;
          error?: string;
        };
        if (!actif) return;
        if (!r.ok || !payload.success || !payload.data) {
          setErreur(payload.error ?? "Fiche introuvable.");
          return;
        }
        const { alerte, fiche, action } = payload.data;
        setFicheBU(fiche.departement);
        setForm({
          numeroOrdre: alerte.numeroOrdre,
          qssfte: alerte.qssfte ?? "",
          natureTexte: alerte.natureTexte,
          referenceTexte: alerte.referenceTexte,
          article: alerte.article ?? "",
          resumeTexte: alerte.resumeTexte,
          libelleApplicable: alerte.libelleApplicable,
          lienHypertexte: alerte.lienHypertexte ?? "",
          dateEntreeVigueur: isoJour(alerte.dateEntreeVigueur),
          contenu: alerte.contenu,
          moyenCommunication: alerte.moyenCommunication ?? "",
          applicableAGLCI: alerte.applicableA_AGL_CI,
          propositionBU: alerte.propositionBU ?? "",
          departementResponsable: fiche.departement,
          departementsResponsables: [fiche.departement],
          actionsExistantes: fiche.actionsExistantes ?? "",
          preuvesExistantes: fiche.preuvesExistantes ?? "",
          statutConformite: fiche.statutConformite,
          preuveDifferee: fiche.preuveDifferee ?? "",
          libelleAction: action?.libelleAction ?? "",
          responsable: "",
          delai: isoJour(action?.delai ?? null),
          tauxAvancement: action ? Math.round(action.tauxAvancement) : 0,
        });
        setActionId(action?.id ?? null);
        setPreuveFichier(
          fiche.preuveFichierNom && fiche.preuveFichierDonnees
            ? {
                nom: fiche.preuveFichierNom,
                mime: fiche.preuveFichierMime ?? "application/octet-stream",
                donnees: fiche.preuveFichierDonnees,
              }
            : null,
        );
      })
      .catch(() => {
        if (actif) setErreur("Impossible de charger la fiche.");
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [params.id]);

  function set<K extends keyof AlerteAnalyse21>(key: K, value: AlerteAnalyse21[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // Historique SCD2 de la fiche (repli silencieux si DB absente / démo).
  useEffect(() => {
    if (params.id.startsWith("mock-")) return;
    let actif = true;
    fetch(`/api/veille/${params.id}/historique`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { success?: boolean; data?: { journal?: JournalEntree[] } } | null) => {
        if (actif && payload?.success && Array.isArray(payload.data?.journal)) {
          setHistorique(payload.data.journal as JournalEntree[]);
        }
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [params.id]);

  async function enregistrer() {
    if (!form) return;
    if (ficheBU && !peutModifierFiche(buConnectee, ficheBU)) {
      setErreur(messageAccesRefuse(buConnectee, ficheBU));
      return;
    }
    if (form.departementResponsable !== ficheBU && !estJuridique(buConnectee)) {
      setErreur("Réassignation vers une autre BU : réservée au juridique.");
      return;
    }
    setSaving(true);
    setErreur(null);
    setNoteResp(false);
    // Démonstration : mise à jour simulée puis retour tableau de bord.
    if (demo) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        sessionStorage.setItem("juriscan-saved", form.numeroOrdre);
      } catch {
        /* stockage indisponible : redirection quand même */
      }
      router.push("/dashboard");
      return;
    }
    try {
      const reponse = await fetch(`/api/veille/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...entetesAuteur(buConnectee, emailConnecte) },
        body: JSON.stringify({
          ...form,
          buConnectee,
          emailConnecte,
          actionId,
          preuveFichierNom: preuveFichier?.nom ?? "",
          preuveFichierMime: preuveFichier?.mime ?? "",
          preuveFichierDonnees: preuveFichier?.donnees ?? "",
        }),
      });
      const payload = (await reponse.json()) as {
        success?: boolean;
        responsableNonLie?: boolean;
        error?: string;
      };
      if (!reponse.ok || !payload.success) {
        setErreur(payload.error ?? "Échec de l'enregistrement.");
        return;
      }
      if (payload.responsableNonLie) setNoteResp(true);
      try {
        sessionStorage.setItem("juriscan-saved", form.numeroOrdre);
      } catch {
        /* stockage indisponible : redirection quand même */
      }
      router.push("/dashboard");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-sm font-black text-brand-blue">
              AGL
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">Modifier la fiche — JuriScan AI</p>
              <p className="font-mono text-xs text-slate-300">{params.id}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelecteurBUConnectee />
            <Link
              href={`/dashboard/historique?fiche=${encodeURIComponent(params.id)}`}
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              🕘 Historique
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

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {chargement && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-gold" />
            </div>
            <p className="mt-3 text-sm text-slate-500">Chargement des 21 colonnes…</p>
          </div>
        )}

        {erreur && !form && !chargement && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-brand-blue">{erreur}</p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block rounded-lg border border-brand-gold bg-brand-blue px-4 py-2 text-sm font-semibold text-white"
            >
              ← Retour tableau de bord
            </Link>
          </div>
        )}

        {form && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-blue px-5 py-3">
              <h2 className="text-base font-bold text-white">
                Fiche — 21 colonnes modifiables
              </h2>
              <span className="flex flex-wrap items-center gap-2">
                {demo && (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white">
                    Mode démonstration
                  </span>
                )}
                <span className="rounded-full bg-brand-gold px-3 py-1 font-mono text-xs font-bold text-brand-blue">
                  {form.numeroOrdre}
                </span>
              </span>
            </div>

            <div className="space-y-6 px-5 py-5">
              {erreur && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{erreur}</p>
              )}
              {noteResp && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  Responsable non rattaché (aucun User avec cet email) — autres champs enregistrés.
                </p>
              )}
              {ficheBU && !peutModifierFiche(buConnectee, ficheBU) ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  🔒 Fiche {ficheBU} en lecture seule — vous êtes connecté en {buConnectee}. Basculez la BU en haut pour modifier.
                </p>
              ) : ficheBU && !estJuridique(buConnectee) ? (
                <p className="rounded-lg bg-brand-blue/5 px-3 py-2 text-xs font-medium text-brand-blue">
                  Texte source figé (réservé au juridique) — vous pilotez la conformité {ficheBU} (preuves, statut, action, délai, taux).
                </p>
              ) : null}

              <Bloc titre="Alerte — texte source (12 champs)">
                <Champ label="01 · N° d'ordre" value={form.numeroOrdre} onChange={(v) => set("numeroOrdre", v)} mono />
                <Champ label="02 · QSSTE" value={form.qssfte} onChange={(v) => set("qssfte", v)} mono />
                <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    03 · Nature du texte
                  </span>
                  <select
                    value={NATURES_TEXTE.includes(form.natureTexte as NatureTexte) ? form.natureTexte : ""}
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
                    {form.natureTexte &&
                      !NATURES_TEXTE.includes(form.natureTexte as NatureTexte) && (
                        <option value={form.natureTexte}>{form.natureTexte}</option>
                      )}
                  </select>
                </label>
                <Champ label="04 · Référence du texte" value={form.referenceTexte} onChange={(v) => set("referenceTexte", v)} />
                <Champ label="05 · Article" value={form.article} onChange={(v) => set("article", v)} />
                <Zone label="06 · Résumé du texte" value={form.resumeTexte} onChange={(v) => set("resumeTexte", v)} />
                <Zone label="07 · Libellé / texte applicable en vigueur" value={form.libelleApplicable} onChange={(v) => set("libelleApplicable", v)} />
                <Champ label="08 · Lien hypertexte" value={form.lienHypertexte} onChange={(v) => set("lienHypertexte", v)} mono />
                <Champ label="09 · Date d'entrée en vigueur" type="date" value={form.dateEntreeVigueur} onChange={(v) => set("dateEntreeVigueur", v)} />
                <Zone label="10 · Contenu brut extrait" value={form.contenu} onChange={(v) => set("contenu", v)} compact />
                <Champ label="11 · Moyen de communication" value={form.moyenCommunication} onChange={(v) => set("moyenCommunication", v)} />
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.applicableAGLCI}
                    onChange={(e) => set("applicableAGLCI", e.target.checked)}
                    className="h-4 w-4 accent-[#1C3359]"
                  />
                  <span>
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      12 · Applicable à AGL CI
                    </span>
                    <span className="font-medium text-slate-800">{form.applicableAGLCI ? "Oui" : "Non"}</span>
                  </span>
                </label>
              </Bloc>

              <Bloc titre="Fiche — assignation département (5 champs)">
                <label className="block rounded-lg border-2 border-brand-gold/60 bg-brand-gold/10 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-blue">
                    13 · Département responsable *
                  </span>
                  <select
                    value={form.departementResponsable}
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
                <Zone label="14 · Actions conformité existantes" value={form.actionsExistantes} onChange={(v) => set("actionsExistantes", v)} compact />
                <Zone label="15 · Preuves de conformité existantes" value={form.preuvesExistantes} onChange={(v) => set("preuvesExistantes", v)} compact />
                <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Document de preuve joint (PDF, image — 8 Mo max)
                  </span>
                  <PreuveFichierInput valeur={preuveFichier} onChange={setPreuveFichier} />
                </div>
                <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    16 · Statut de conformité
                  </span>
                  <select
                    value={form.statutConformite}
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
                <Zone label="17 · Preuve de conformité différée" value={form.preuveDifferee} onChange={(v) => set("preuveDifferee", v)} compact />
              </Bloc>

              <Bloc titre="Action d'amélioration (4 champs)">
                <Zone label="18 · Action d'amélioration" value={form.libelleAction} onChange={(v) => set("libelleAction", v)} compact />
                <Champ
                  label="19 · Responsable (email d'un User existant pour rattacher)"
                  value={form.responsable}
                  onChange={(v) => set("responsable", v)}
                />
                <Champ label="20 · Délai" type="date" value={form.delai} onChange={(v) => set("delai", v)} />
                <label className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    21 · Taux d&apos;avancement — {form.tauxAvancement} %
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.tauxAvancement}
                    onChange={(e) => set("tauxAvancement", Number(e.target.value))}
                    className="w-full accent-[#1C3359]"
                  />
                </label>
              </Bloc>

              <button
                type="button"
                onClick={enregistrer}
                disabled={saving || (!!ficheBU && !peutModifierFiche(buConnectee, ficheBU))}
                title={ficheBU && !peutModifierFiche(buConnectee, ficheBU) ? messageAccesRefuse(buConnectee, ficheBU) : "Enregistrer (tracé SCD2)"}
                className="w-full rounded-xl bg-brand-blue px-5 py-3.5 text-base font-bold text-white shadow transition-colors hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Enregistrement en cours…" : "💾 Enregistrer les Modifications"}
              </button>
            </div>
          </section>
        )}

        {/* Historique SCD2 de la fiche — traçabilité consultable */}
        {form && !params.id.startsWith("mock-") && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-blue px-5 py-3">
              <h2 className="text-base font-bold text-white">🕘 Historique des modifications (SCD2)</h2>
              <Link
                href={`/dashboard/historique?fiche=${encodeURIComponent(params.id)}`}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-brand-gold hover:text-brand-blue"
              >
                Tout l&apos;historique →
              </Link>
            </div>
            <div className="px-5 py-4">
              {!historique ? (
                <p className="py-2 text-center text-xs text-slate-400">
                  Chargement de l&apos;historique… (repli silencieux si base absente).
                </p>
              ) : historique.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-400">
                  Aucune modification tracée pour l&apos;instant — chaque enregistrement apparaîtra ici (version SCD2 + journal).
                </p>
              ) : (
                <ul className="space-y-2">
                  {historique.slice(0, 10).map((h) => (
                    <li key={h.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <p className="font-bold text-brand-blue">
                        {HISTORIQUE_ACTION_LABELS[(h.action as keyof typeof HISTORIQUE_ACTION_LABELS)] ?? h.action}
                        <span className="ml-2 font-normal text-slate-500">
                          {new Date(h.createdAt).toLocaleString("fr-FR")}
                          {h.buAuteur ? ` · ${h.buAuteur}` : ""}
                          {h.emailAuteur ? ` · ${h.emailAuteur}` : ""}
                        </span>
                      </p>
                      {h.details && <p className="mt-0.5 text-slate-600">{h.details}</p>}
                      {h.champsModifies.length > 0 && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          champs : {h.champsModifies.join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
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
