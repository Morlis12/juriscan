"use client";

import { useCallback, useEffect, useState } from "react";
import { DEPARTEMENTS, type DepartementCode } from "@/domain/veille";
import { CLE_BU_CONNECTEE, CLE_EMAIL_CONNECTE, estJuridique } from "@/domain/acces";

/**
 * JuriScan AI — BU connectée (prototype localStorage).
 *
 * Le sélecteur simule la connexion métier : seule la BU connectée peut
 * modifier / répondre à ses assignations (les autres fiches restent en
 * lecture seule). Le juridique (CENTRAL_VRG / DJ) garde un accès global.
 * Migration Microsoft : remplacer ce hook par l'utilisateur Entra ID
 * (Power Pages Web Roles) — l'API lira alors le JWT (voir `src/lib/acces.ts`).
 */

const BU_DEFAUT: DepartementCode = "DJ";

/** Event même-onglet : `storage` ne se déclenche que entre onglets distincts. */
const EVENT_BU = "juriscan:bu-connectee-change";

function lireBU(): DepartementCode {
  try {
    const v = window.localStorage.getItem(CLE_BU_CONNECTEE) as DepartementCode | null;
    if (v && v in DEPARTEMENTS) return v;
  } catch {
    /* stockage indisponible */
  }
  return BU_DEFAUT;
}

function lireEmail(): string {
  try {
    return window.localStorage.getItem(CLE_EMAIL_CONNECTE) ?? "";
  } catch {
    return "";
  }
}

/** BU connectée partagée via localStorage (+ event inter-onglets). */
export function useBuConnectee() {
  const [bu, setBu] = useState<DepartementCode>(BU_DEFAUT);
  const [email, setEmail] = useState("");
  const [pret, setPret] = useState(false);

  useEffect(() => {
    // Relecture du choix persisté (même onglet via EVENT_BU, autres onglets via storage).
    const resync = () => {
      setBu(lireBU());
      setEmail(lireEmail());
    };
    window.addEventListener("storage", resync);
    window.addEventListener(EVENT_BU, resync);
    // Synchronise l'onglet courant après hydratation (choix persisté) :
    // lecture différée intentionnelle — évite le mismatch d'hydratation SSR.
    const raf = requestAnimationFrame(() => {
      resync();
      setPret(true);
    });
    return () => {
      window.removeEventListener("storage", resync);
      window.removeEventListener(EVENT_BU, resync);
      cancelAnimationFrame(raf);
    };
  }, []);

  const changerBU = useCallback((code: DepartementCode) => {
    setBu(code);
    try {
      window.localStorage.setItem(CLE_BU_CONNECTEE, code);
      // Propage aux autres instances du même onglet (écran + contrôles d'accès).
      window.dispatchEvent(new Event(EVENT_BU));
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const changerEmail = useCallback((v: string) => {
    setEmail(v);
    try {
      window.localStorage.setItem(CLE_EMAIL_CONNECTE, v);
      window.dispatchEvent(new Event(EVENT_BU));
    } catch {
      /* stockage indisponible */
    }
  }, []);

  return { bu, email, changerBU, changerEmail, pret, estJuridique: estJuridique(bu) };
}

/** En-têtes d'auteur envoyés à l'API (pont prototype → JWT Entra ID). */
export function entetesAuteur(bu: DepartementCode, email: string): Record<string, string> {
  const h: Record<string, string> = { "x-bu-connectee": bu };
  if (email.trim()) h["x-user-email"] = email.trim();
  return h;
}

/** Sélecteur de BU connectée — affiché dans chaque en-tête (haut de page). */
export function SelecteurBUConnectee({ compact = false }: { compact?: boolean }) {
  const { bu, changerBU } = useBuConnectee();
  return (
    <label
      className={`flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ${
        compact ? "" : ""
      }`}
      title="Simulation de connexion : seule votre BU peut modifier ses assignations (le juridique garde un accès global). Remplacé par Entra ID côté Microsoft."
    >
      <span className="text-slate-300">Connecté :</span>
      <select
        value={bu}
        onChange={(e) => changerBU(e.target.value as DepartementCode)}
        className="rounded-md bg-transparent font-bold text-white outline-none [&>option]:text-slate-900"
        aria-label="BU connectée"
      >
        {(Object.keys(DEPARTEMENTS) as DepartementCode[]).map((code) => (
          <option key={code} value={code}>
            {code}
            {estJuridique(code) ? " (juridique)" : ""}
          </option>
        ))}
      </select>
      <span
        className={`h-2 w-2 rounded-full ${estJuridique(bu) ? "bg-brand-gold" : "bg-emerald-400"}`}
        title={estJuridique(bu) ? "Juridique : accès global" : "BU métier : cloisonnée à ses assignations"}
      />
    </label>
  );
}
