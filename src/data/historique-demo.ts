import type { FluxStatut } from "@/domain/veille";
import type { JournalEntree } from "@/domain/historique";
import { JALONS_VIDES, type JalonsFiche } from "@/domain/jalons";
import { MOCK_ALERTES } from "@/data/veille-mock";

/**
 * JuriScan AI — Historique de démonstration (sans base de données).
 *
 * Les fiches visibles (`mock-*`) ne sont pas persistées : aucun journal réel
 * n'existe pour elles. Ce jeu rejoue un historique plausible (création
 * centrale → validation → approbation/rejet BU → pilotage du taux) aligné sur
 * le cycle `FLUX_DEMO` du tableau de bord (même index → même flux).
 * Les dates sont ancrées à AUJOURD'HUI (activité récente simulée) pour que la
 * « Dernière mise à jour » et les anciennetés reflètent une fraîcheur juste ;
 * en base connectée, ce sont les vraies dates SQL qui s'affichent.
 * Dès que GET /api/historique renvoie des lignes réelles, elles s'ajoutent
 * devant (triées par date décroissante) ; la démo reste en repli.
 */

/** Même cycle que le tableau de bord (index MOCK_ALERTES → flux). */
const FLUX_DEMO: FluxStatut[] = [
  "ATTENTE_VALIDATION_JURIDIQUE",
  "ATTENTE_APPROBATION_METIER",
  "APPROUVE_METIER",
  "REJETE_METIER",
];

const EMAIL_CENTRALE = "veille.reglementaire@agl-ci.com";

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Date ancrée à aujourd'hui (heure locale) : la démo simule une activité
 * récente pour une fraîcheur juste (pastille « Dernière mise à jour »,
 * anciennetés rejets/approbations). Ordre préservé par fiche :
 * création < validation < approbation/rejet < pilotage du taux.
 */
function jourRelatif(decalageJours: number, heure: number): string {
  const d = new Date();
  d.setDate(d.getDate() + decalageJours);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(heure)}:00:00`;
}

function emailBU(dept: string): string {
  return `${dept.toLowerCase().replace(/[^a-z]/g, "")}@agl-ci.com`;
}

function construire(): JournalEntree[] {
  const entrees: JournalEntree[] = [];
  MOCK_ALERTES.forEach((m, i) => {
    const flux = FLUX_DEMO[i % FLUX_DEMO.length];
    const id = (k: string): string => `demo-${m.id}-${k}`;
    // Ancienneté de la fiche (10 à 18 jours) + étapes +3/+6/+9 jours.
    const anciennete = 10 + (i % 9);
    entrees.push({
      id: id("creation"),
      alerteId: null,
      ficheId: m.id,
      actionId: null,
      numeroOrdre: m.numeroOrdre,
      ficheDepartement: m.departement,
      entite: "FICHE",
      action: "CREATION",
      buAuteur: "CENTRAL_VRG",
      emailAuteur: EMAIL_CENTRALE,
      details: `Assignée à ${m.departement} par la centrale (texte ${m.numeroOrdre}).`,
      champsModifies: ["departement", "fluxStatut"],
      createdAt: jourRelatif(-anciennete, 9 + (i % 8)),
    });
    if (flux !== "ATTENTE_VALIDATION_JURIDIQUE") {
      entrees.push({
        id: id("validation"),
        alerteId: null,
        ficheId: m.id,
        actionId: null,
        numeroOrdre: m.numeroOrdre,
        ficheDepartement: m.departement,
        entite: "FICHE",
        action: "VALIDATION_JURIDIQUE",
        buAuteur: "CENTRAL_VRG",
        emailAuteur: EMAIL_CENTRALE,
        details: `Validée vers ${m.departement} par la centrale.`,
        champsModifies: ["fluxStatut"],
        createdAt: jourRelatif(-anciennete + 3, 10 + (i % 7)),
      });
    }
    if (flux === "APPROUVE_METIER") {
      entrees.push({
        id: id("approbation"),
        alerteId: null,
        ficheId: m.id,
        actionId: null,
        numeroOrdre: m.numeroOrdre,
        ficheDepartement: m.departement,
        entite: "FICHE",
        action: "APPROBATION_BU",
        buAuteur: m.departement,
        emailAuteur: emailBU(m.departement),
        details: `Approuvée par ${m.departement} à ${m.tauxAvancement} %.`,
        champsModifies: ["fluxStatut", "statutConformite", "tauxAvancement"],
        createdAt: jourRelatif(-anciennete + 6, 11 + (i % 6)),
      });
      if (m.tauxAvancement > 0) {
        entrees.push({
          id: id("taux"),
          alerteId: null,
          ficheId: m.id,
          actionId: null,
          numeroOrdre: m.numeroOrdre,
          ficheDepartement: m.departement,
          entite: "FICHE",
          action: "MODIFICATION_TAUX",
          buAuteur: m.departement,
          emailAuteur: emailBU(m.departement),
          details: `Taux piloté à ${m.tauxAvancement} % par ${m.departement}.`,
          champsModifies: ["tauxAvancement"],
          createdAt: jourRelatif(-anciennete + 9, 14 + (i % 4)),
        });
      }
    }
    if (flux === "REJETE_METIER") {
      entrees.push({
        id: id("rejet"),
        alerteId: null,
        ficheId: m.id,
        actionId: null,
        numeroOrdre: m.numeroOrdre,
        ficheDepartement: m.departement,
        entite: "FICHE",
        action: "REJET_BU",
        buAuteur: m.departement,
        emailAuteur: emailBU(m.departement),
        details: `Assignation refusée par ${m.departement} (retour centrale).`,
        champsModifies: ["fluxStatut"],
        createdAt: jourRelatif(-anciennete + 6, 11 + (i % 6)),
      });
    }
  });
  return entrees.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const HISTORIQUE_DEMO: JournalEntree[] = construire();

/**
 * Jalons d'une fiche démo (assignation, validation, rejet, approbation,
 * dernière modification) déduits de son journal simulé — même contrat que
 * les `jalons` renvoyés par GET /api/veille pour les fiches SQL.
 */
export function jalonsDemoPourFiche(ficheId: string): JalonsFiche {
  const j: JalonsFiche = { ...JALONS_VIDES };
  for (const h of HISTORIQUE_DEMO) {
    if (h.ficheId !== ficheId) continue;
    if (h.action === "CREATION") {
      if (!j.assigneeLe || h.createdAt < j.assigneeLe) j.assigneeLe = h.createdAt;
    } else if (h.action === "VALIDATION_JURIDIQUE") {
      if (!j.valideeLe || h.createdAt > j.valideeLe) j.valideeLe = h.createdAt;
    } else if (h.action === "REJET_BU") {
      if (!j.rejeteeLe || h.createdAt > j.rejeteeLe) j.rejeteeLe = h.createdAt;
    } else if (h.action === "APPROBATION_BU") {
      if (!j.approuveeLe || h.createdAt > j.approuveeLe) j.approuveeLe = h.createdAt;
    }
    if (!j.derniereModif || h.createdAt > j.derniereModif) j.derniereModif = h.createdAt;
  }
  return j;
}
