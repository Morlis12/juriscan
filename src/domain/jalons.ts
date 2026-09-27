/**
 * AGL JuriCompliance — Jalons de dates (découplé de Next.js / Prisma).
 *
 * Exigence d'affichage :
 * - Rejets : date d'assignation + date du rejet.
 * - Approbations : date d'assignation + ancienneté de l'attente
 *   (« en attente depuis N jours »).
 * - Suivi des textes : date de dernière modification, c'est-à-dire la date
 *   de l'état affiché aujourd'hui.
 *
 * Correspondance base (aucune colonne ajoutée — réutilisation SCD2) :
 * - assignation = `VeilleFiche.createdAt` (création = assignation à la BU)
 *   + entrée `VeilleJournal` CREATION (démo : même date).
 * - validation / renvoi / rejet / approbation = dernières entrées
 *   `VeilleJournal` (VALIDATION_JURIDIQUE, RENVOI_BU, REJET_BU,
 *   APPROBATION_BU) — calculées par GET /api/veille (`jalons` par fiche).
 * - dernière modification = `VeilleFiche.updatedAt` (démo : dernière entrée
 *   du journal de la fiche).
 * - début d'attente = max(validation, renvoi) puis repli sur l'assignation.
 *
 * Portabilité Dataverse : `createdon` (assignation), `modifiedon` (dernière
 * modification), table `VeilleJournal` (validation / rejet / approbation).
 */

export interface JalonsFiche {
  assigneeLe: string | null;
  valideeLe: string | null;
  renvoyeeLe: string | null;
  rejeteeLe: string | null;
  approuveeLe: string | null;
  derniereModif: string | null;
}

export const JALONS_VIDES: JalonsFiche = {
  assigneeLe: null,
  valideeLe: null,
  renvoyeeLe: null,
  rejeteeLe: null,
  approuveeLe: null,
  derniereModif: null,
};

/** JJ/MM/AAAA depuis un ISO (date ou datetime) ; « — » si absent/invalide. */
export function formaterDateFR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** JJ/MM/AAAA à HH:MM:SS depuis un ISO (heure lue telle quelle, sans conversion de fuseau). */
export function formaterDateHeureFR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = formaterDateFR(iso);
  if (date === "—") return "—";
  const heure = iso.slice(11, 19);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(heure)) return date;
  return `${date} à ${heure}`;
}

/** Ancienneté en clair (« 1 jour », « 12 jours », « 2 mois », …). */
export function dureeDepuis(
  iso: string | null | undefined,
  maintenant: Date = new Date(),
): string | null {
  if (!iso) return null;
  const j = iso.slice(0, 10);
  const d = new Date(`${j}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const jours = Math.floor((maintenant.getTime() - d.getTime()) / 86_400_000);
  if (jours <= 0) return "moins d'un jour";
  if (jours === 1) return "1 jour";
  if (jours < 60) return `${jours} jours`;
  const mois = Math.floor(jours / 30);
  return mois <= 1 ? "1 mois" : `${mois} mois`;
}

/**
 * Début de l'attente d'approbation : renvoi le plus récent, sinon validation,
 * sinon assignation (un rejet retraité puis renvoyé rouvre l'attente).
 */
export function debutAttente(
  jalons: Pick<JalonsFiche, "valideeLe" | "renvoyeeLe">,
  assigneeLe: string | null,
): string | null {
  const candidats = [jalons.valideeLe, jalons.renvoyeeLe].filter(
    (x): x is string => !!x,
  );
  if (candidats.length === 0) return assigneeLe;
  return candidats.sort()[candidats.length - 1];
}
