import type { FluxStatut } from "@/domain/veille";
import type { JournalEntree } from "@/domain/historique";
import { MOCK_ALERTES } from "@/data/veille-mock";

/**
 * JuriScan AI — Historique de démonstration (sans base de données).
 *
 * Les fiches visibles (`mock-*`) ne sont pas persistées : aucun journal SCD2
 * n'existe pour elles. Ce jeu déterministe rejoue un historique plausible
 * (création centrale → validation → approbation/rejet BU → pilotage du taux)
 * aligné sur le cycle `FLUX_DEMO` du tableau de bord (même index → même flux),
 * pour observer la traçabilité avant la connexion SQL.
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

function decalerJours(iso: string, jours: number, heure: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + jours);
  const base = d.toISOString().slice(0, 10);
  return `${base}T${String(heure).padStart(2, "0")}:00:00`;
}

function emailBU(dept: string): string {
  return `${dept.toLowerCase().replace(/[^a-z]/g, "")}@agl-ci.com`;
}

function construire(): JournalEntree[] {
  const entrees: JournalEntree[] = [];
  MOCK_ALERTES.forEach((m, i) => {
    const flux = FLUX_DEMO[i % FLUX_DEMO.length];
    const id = (k: string): string => `demo-${m.id}-${k}`;
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
      createdAt: decalerJours(m.dateEntreeVigueur, -12, 9 + (i % 8)),
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
        createdAt: decalerJours(m.dateEntreeVigueur, -9, 10 + (i % 7)),
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
        createdAt: decalerJours(m.dateEntreeVigueur, -6, 11 + (i % 6)),
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
          createdAt: decalerJours(m.dateEntreeVigueur, -2, 14 + (i % 4)),
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
        createdAt: decalerJours(m.dateEntreeVigueur, -6, 11 + (i % 6)),
      });
    }
  });
  return entrees.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const HISTORIQUE_DEMO: JournalEntree[] = construire();
