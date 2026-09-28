"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoAGL } from "@/components/LogoAGL";
import { NavOnglets } from "@/components/NavOnglets";
import { PastilleSession, useBuConnectee } from "@/components/SessionBU";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";
import { DEPARTEMENTS } from "@/domain/veille";

/**
 * AGL JuriCompliance — Mon compte : identité et mot de passe.
 *
 * Deux usages :
 * - changer son propre mot de passe (l'ancien est exigé) ;
 * - vérifier l'identité avec laquelle on est connecté, et l'accès de sa
 *   direction — utile avant une démonstration ou une recette.
 *
 * Tant que le mot de passe est celui de la création du compte, un bandeau
 * invite à le changer : ces mots de passe ont été générés puis affichés une
 * fois : ne le communiquez pas et changez-le.
 */

export default function ComptePage() {
  const router = useRouter();
  const { bu, email, nom, typeCompte, provisoire, estCentrale: estCentraleSession, pret } =
    useBuConnectee();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setErreur(null);
    setSucces(null);
    if (nouveau !== confirmation) {
      setErreur("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/mot-de-passe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ancien, nouveau }),
      });
      const payload = (await reponse.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!reponse.ok || !payload?.success) {
        setErreur(payload?.error ?? "Changement impossible.");
        setEnCours(false);
        return;
      }
      setAncien("");
      setNouveau("");
      setConfirmation("");
      setSucces("Mot de passe mis à jour. Il sera demandé à la prochaine connexion.");
      setEnCours(false);
      router.refresh();
    } catch {
      setErreur("Changement impossible : le serveur ne répond pas.");
      setEnCours(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoAGL />
            <div>
              <p className="text-lg font-bold leading-tight">Mon compte</p>
              <p className="text-xs text-slate-300">
                Identité, direction et mot de passe
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NavOnglets actif="memo" estCentrale={estCentraleSession} />
            <span aria-hidden="true" className="hidden h-6 w-px bg-white/20 sm:block" />
            <PastilleSession />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {provisoire && pret && (
          <p className="rounded-xl border-2 border-brand-gold bg-brand-gold/10 px-4 py-3 text-sm font-semibold text-brand-blue">
            ⚠ Votre mot de passe est celui de la création du compte. Changez-le
            ci-dessous : il a été généré et affiché une seule fois.
          </p>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-brand-blue">Identité connectée</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Ligne libelle="Nom" valeur={nom || "—"} />
            <Ligne libelle="Identifiant" valeur={email || "—"} />
            <Ligne
              libelle="Direction"
              valeur={bu ? `${DEPARTEMENTS[bu]}` : "—"}
            />
            <Ligne
              libelle="Type d'accès"
              valeur={
                typeCompte === "DIRECTION"
                  ? "Accès partagé de la direction"
                  : "Compte nominatif (tracé à votre nom)"
              }
            />
            <Ligne
              libelle="Droits"
              valeur={
                estCentraleSession
                  ? "Centrale : assignation, rejets et vue générale"
                  : "Direction : vos fiches et vos approbations uniquement"
              }
            />
          </dl>
        </section>

        <form
          onSubmit={changerMotDePasse}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="text-base font-bold text-brand-blue">Changer mon mot de passe</h2>
            <p className="mt-1 text-xs text-slate-500">
              12 caractères minimum, avec au moins trois types différents
              (minuscule, majuscule, chiffre, caractère spécial).
            </p>
          </div>

          <ChampMotDePasse
            id="mdp-actuel"
            label="Mot de passe actuel"
            value={ancien}
            onChange={setAncien}
            autoComplete="current-password"
          />

          <ChampMotDePasse
            id="mdp-nouveau"
            label="Nouveau mot de passe"
            value={nouveau}
            onChange={setNouveau}
            autoComplete="new-password"
          />

          <ChampMotDePasse
            id="mdp-confirmation"
            label="Confirmer le nouveau mot de passe"
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
          />

          {erreur && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700" role="alert">
              {erreur}
            </p>
          )}
          {succes && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              ✅ {succes}
            </p>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="w-full rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-blue shadow transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Changer mon mot de passe"}
          </button>
        </form>
      </main>
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {libelle}
      </dt>
      <dd className="min-w-0 text-right font-medium text-slate-800">{valeur}</dd>
    </div>
  );
}
