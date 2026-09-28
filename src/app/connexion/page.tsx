"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoAGL } from "@/components/LogoAGL";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";

/**
 * AGL JuriCompliance — Écran de connexion.
 *
 * Remplace l'ancien sélecteur de BU : la direction et l'identité sont désormais
 * décidées par le serveur, plus jamais choisies dans le navigateur.
 * - Un compte par personne (email AGL) : les droits suivent sa direction, et le
 *   journal SCD2 sait QUI a fait quoi.
 * - Un accès par direction (`direction-<bu>@agl.ci`) : mot de passe propre à
 *   chaque direction, sans compte nominatif.
 *
 * Aucun message ne distingue « compte inconnu » de « mot de passe faux ».
 */

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, motDePasse }),
      });
      const payload = (await reponse.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!reponse.ok || !payload?.success) {
        setErreur(payload?.error ?? "Connexion impossible. Réessayez.");
        setEnCours(false);
        return;
      }
      // Rechargement complet : toutes les pages relisent la session serveur.
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErreur("Connexion impossible : le serveur ne répond pas.");
      setEnCours(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-xl bg-brand-blue p-3">
            <LogoAGL />
          </div>
          <h1 className="mt-4 text-2xl font-black text-brand-blue">AGL JuriCompliance</h1>
          <p className="mt-1 text-sm text-slate-600">
            Veille réglementaire — connexion à votre direction
          </p>
        </div>

        <form
          onSubmit={seConnecter}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Identifiant
            </span>
            <input
              type="text"
              id="identifiant"
              name="identifiant"
              required
              autoComplete="username"
              autoFocus
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="veille@agl.ci ou direction-dj@agl.ci"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
            />
          </label>

          <ChampMotDePasse
            id="mot-de-passe"
            label="Mot de passe"
            value={motDePasse}
            onChange={setMotDePasse}
            autoComplete="current-password"
            error={erreur}
          />

          <button
            type="submit"
            disabled={enCours}
            className="w-full rounded-lg bg-brand-gold px-5 py-3 text-sm font-bold text-brand-blue shadow transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours ? "Connexion en cours…" : "Se connecter"}
          </button>
        </form>

        <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600 shadow-sm">
          <p className="font-bold uppercase tracking-wide text-brand-blue">
            Chaque direction a son accès
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Un compte par personne</strong> (email AGL) : vous ne voyez et ne
              modifiez que les fiches de votre direction, et vos modifications sont
              tracées à votre nom.
            </li>
            <li>
              <strong>Un accès par direction</strong> (<code>direction-dj@agl.ci</code>) :
              mot de passe propre à la direction, sans compte nominatif.
            </li>
            <li>
              Seul l&apos;accès de la <strong>Veille Réglementaire Générale</strong>{" "}
              assigne les textes aux directions.
            </li>
          </ul>
          <p className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">
            Identifiants perdus ou premier démarrage ? Lancez{" "}
            <code className="rounded bg-slate-100 px-1">npm run acces:init</code> — les
            mots de passe ne sont affichés qu&apos;à la création. Sur un déploiement
            en ligne, l&apos;administrateur doit à la place définir la variable
            d&apos;environnement <code className="rounded bg-slate-100 px-1">JURISCAN_COMPTES</code>{" "}
            puis redéployer.
          </p>
        </div>
      </div>
    </div>
  );
}
