"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTEMENTS, type DepartementCode } from "@/domain/veille";
import { estCentrale } from "@/domain/acces";

/**
 * AGL JuriCompliance — Session connectée (lecture de l'identité côté serveur).
 *
 * ⚠️ Changement de sécurité : la BU n'est plus choisie dans le navigateur.
 * Elle est déduite du **cookie de session signé** posé à la connexion
 * (`POST /api/connexion`), et l'API ne lit plus aucun en-tête d'auteur — donc
 * impossible de se faire passer pour une autre direction depuis le client.
 *
 * `useBuConnectee` est conservé comme nom d'hook : les 7 écrans l'utilisent et
 * lisent `bu` / `email` / `estCentrale` exactement comme avant. `changerBU` et
 * `changerEmail` disparaissent : on ne change plus de BU, on se déconnecte.
 *
 * Migration Microsoft : remplacer le `GET /api/session` par l'utilisateur
 * Entra ID / Web Roles (Power Pages) — le reste de l'interface est inchangé.
 */

export type TypeCompte = "PERSONNE" | "DIRECTION";

export interface SessionBU {
  connecte: boolean;
  email: string;
  nom: string;
  bu: DepartementCode | null;
  typeCompte: TypeCompte | null;
  provisoire: boolean;
  pret: boolean;
  estCentrale: boolean;
  deconnexion: () => void;
}

const VIDE: SessionBU = {
  connecte: false,
  email: "",
  nom: "",
  bu: null,
  typeCompte: null,
  provisoire: false,
  pret: false,
  estCentrale: false,
  deconnexion: () => {},
};

export function useBuConnectee() {
  const router = useRouter();
  const [etat, setEtat] = useState<SessionBU>(VIDE);

  const relire = useCallback(async () => {
    try {
      const reponse = await fetch("/api/session", { cache: "no-store" });
      const payload = (await reponse.json()) as {
        data?: {
          connecte?: boolean;
          email?: string;
          nom?: string;
          bu?: DepartementCode;
          typeCompte?: TypeCompte;
          provisoire?: boolean;
        };
      };
      const d = payload.data;
      if (!d?.connecte || !d.bu) {
        setEtat({ ...VIDE, pret: true });
        return;
      }
      setEtat({
        connecte: true,
        email: d.email ?? "",
        nom: d.nom ?? "",
        bu: d.bu,
        typeCompte: d.typeCompte ?? "PERSONNE",
        provisoire: d.provisoire === true,
        pret: true,
        estCentrale: estCentrale(d.bu),
        deconnexion: () => {},
      });
    } catch {
      setEtat({ ...VIDE, pret: true });
    }
  }, []);

  const deconnexion = useCallback(async () => {
    await fetch("/api/connexion", { method: "DELETE" }).catch(() => null);
    setEtat({ ...VIDE, pret: true });
    router.replace("/connexion");
    router.refresh();
  }, [router]);

  useEffect(() => {
    void relire();
  }, [relire]);

  return { ...etat, deconnexion };
}

/**
 * Pastille d'identité en en-tête : affiche qui est connecté et sa direction,
 * propose la déconnexion. Remplace l'ancien menu déroulant « Connecté : … »
 * qui laissait choisir n'importe quelle BU.
 */
export function PastilleSession() {
  const { bu, email, nom, typeCompte, provisoire, pret, deconnexion } = useBuConnectee();
  if (!pret) {
    return <span className="h-7 w-40 animate-pulse rounded-full bg-white/10" />;
  }
  if (!bu) {
    return (
      <a
        href="/connexion"
        className="rounded-full bg-brand-gold px-4 py-1.5 text-xs font-bold text-brand-blue"
      >
        Se connecter
      </a>
    );
  }
  return (
    <div
      className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-3 pr-1 text-xs text-white"
      title={`${email} — accès ${typeCompte === "DIRECTION" ? "partagé de la direction" : "nominatif"}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          estCentrale(bu) ? "bg-brand-gold" : "bg-emerald-400"
        }`}
        title={estCentrale(bu) ? "Centrale : pilote le flux transverse" : "Direction : cloisonnée à ses fiches"}
      />
      <span className="min-w-0">
        <span className="block max-w-[180px] truncate font-bold leading-tight">
          {DEPARTEMENTS[bu] ?? bu}
        </span>
        <span className="block max-w-[180px] truncate text-[10px] leading-tight text-slate-300">
          {typeCompte === "DIRECTION" ? "accès direction" : nom || email}
          {provisoire ? " · mot de passe à changer" : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={() => void deconnexion()}
        className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 font-semibold text-white transition-colors hover:bg-white/30"
        title="Se déconnecter"
      >
        Sortir
      </button>
    </div>
  );
}
