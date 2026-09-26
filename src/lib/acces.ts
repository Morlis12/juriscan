/**
 * JuriScan AI — Lecture de l'auteur côté serveur (pont prototype → Entra ID).
 *
 * Prototype : l'auteur vient des en-têtes `x-bu-connectee` / `x-user-email`
 * posés par le client (`entetesAuteur`). Migration Microsoft : remplacer le
 * corps de `lireAuteur` par la vérification du JWT Entra ID / Power Pages
 * (Web Roles → BU) sans toucher les routes appelantes.
 */

import { DEPARTEMENT_CODES, type DepartementCode } from "@/domain/veille";

export interface AuteurRequete {
  bu: DepartementCode | null;
  email: string | null;
}

export function lireAuteur(req: Request): AuteurRequete {
  const raw = req.headers.get("x-bu-connectee")?.trim().toUpperCase() ?? "";
  const bu =
    (DEPARTEMENT_CODES as string[]).includes(raw) ? (raw as DepartementCode) : null;
  const emailRaw = req.headers.get("x-user-email")?.trim() ?? "";
  const email = emailRaw.includes("@") ? emailRaw : null;
  // Corps JSON de repli (clients qui postent { buConnectee }) — lu par les routes.
  return { bu, email };
}

/** Même lecture depuis un corps JSON déjà parsé (repli prototype). */
export function lireAuteurDepuisCorps(b: {
  buConnectee?: unknown;
  emailConnecte?: unknown;
}): AuteurRequete {
  const raw =
    typeof b.buConnectee === "string" ? b.buConnectee.trim().toUpperCase() : "";
  const bu =
    (DEPARTEMENT_CODES as string[]).includes(raw) ? (raw as DepartementCode) : null;
  const emailRaw = typeof b.emailConnecte === "string" ? b.emailConnecte.trim() : "";
  return { bu, email: emailRaw.includes("@") ? emailRaw : null };
}

/** Fusionne en-têtes + corps (les en-têtes priment). */
export function fusionnerAuteur(a: AuteurRequete, b: AuteurRequete): AuteurRequete {
  return { bu: a.bu ?? b.bu, email: a.email ?? b.email };
}
