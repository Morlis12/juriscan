import type {
  ConformiteStatut,
  DepartementCode,
} from "@/domain/veille";
import { CONFORMITE_POURCENTAGE } from "@/domain/veille";

/**
 * JuriScan AI — Jeu de données simulé pour le tableau de bord.
 * 30 alertes réparties sur les 8 départements + actions d'amélioration.
 * Remplace l'alimentation SQL/Power Pages en attendant la connexion réelle.
 * Les types restent alignés sur `src/domain/veille.ts` (Dataverse-ready).
 */

export interface MockAlerte {
  id: string;
  numeroOrdre: string;
  departement: DepartementCode;
  natureTexte: string;
  referenceTexte: string;
  resumeTexte: string;
  /** ISO date (YYYY-MM-DD). */
  dateEntreeVigueur: string;
  statut: ConformiteStatut;
  /** Taux d'avancement de la mise en conformité (0–100). */
  tauxAvancement: number;
}

export interface MockAction {
  id: string;
  numeroOrdre: string;
  libelleAction: string;
  responsable: string;
  /** ISO date (YYYY-MM-DD). */
  delai: string;
  tauxAvancement: number;
}

type AlerteRow = [
  departement: DepartementCode,
  natureTexte: string,
  referenceTexte: string,
  resumeTexte: string,
  dateEntreeVigueur: string,
  statut: ConformiteStatut,
  tauxAvancement: number,
];

const ROWS: AlerteRow[] = [
  ["DJ", "Décret", "Décret n°2024-018 portant Code des marchés publics", "Refonte des seuils de passation et dématérialisation des appels d'offres applicables aux contrats AGL.", "2024-03-15", "CONFORME_100", 100],
  ["DJ", "Loi", "Loi n°2023-875 sur la protection des données personnelles", "Obligations ARTCI : registre des traitements, DPO désigné, durées de conservation à harmoniser.", "2024-06-01", "PARTIELLEMENT_50", 52],
  ["DJ", "Ordonnance", "Ordonnance n°2024-312 sur l'arbitrage commercial OHADA", "Clause compromissoire uniformisée dans les contrats logistiques et contentieux externalisés vers la CCJA.", "2024-04-20", "CONFORME_100", 100],
  ["DJ", "Arrêté", "Arrêté n°045/MJDH relatif aux frais de greffe", "Nouvelle grille tarifaire des actes de greffe ; provision budgétaire contentieux à réévaluer.", "2025-01-10", "NON_CONFORME_0", 10],
  ["DAF", "Décret", "Décret n°2024-102 – Code général des impôts, livre foncier", "Révision des modalités déclaratives foncières ; impact sur les sites d'Abidjan et de Bouaké.", "2024-09-01", "PARTIELLEMENT_75", 78],
  ["DAF", "Loi", "Loi de finances n°2025-008 pour l'année 2025", "Nouveaux taux et acomptes provisionnels ; paramétrage comptable et formation des équipes requis.", "2025-01-05", "PARTIELLEMENT_50", 55],
  ["DAF", "Arrêté", "Arrêté n°112/DGI sur la facturation électronique normalisée", "Factures normalisées obligatoires via la plateforme DGI ; connecteur ERP restant à déployer.", "2025-07-01", "NON_CONFORME_0", 15],
  ["DAF", "Circulaire", "Circulaire BCEAO n°004-2024 – lutte anti-blanchiment", "Renforcement KYC fournisseurs et seuils de déclaration ; cellule conformité déjà opérationnelle.", "2024-05-30", "CONFORME_100", 100],
  ["DRH", "Loi", "Code du travail – Loi n°2015-532 modifiée 2024", "Nouvelles durées du travail et repos compensateurs ; règlement intérieur en cours d'actualisation.", "2024-11-01", "PARTIELLEMENT_75", 72],
  ["DRH", "Décret", "Décret n°2024-210 fixant le SMIG à 75 000 FCFA", "Revalorisation salariale appliquée sur toutes les catégories ; bulletins vérifiés.", "2024-08-01", "CONFORME_100", 100],
  ["DRH", "Arrêté", "Arrêté n°078/MEPS sur la déclaration sociale CNPS", "Télédéclaration mensuelle obligatoire ; deux agences encore en déclaration papier.", "2025-03-12", "PARTIELLEMENT_25", 30],
  ["DRH", "Circulaire", "Circulaire CNPS 2025-03 – cotisations patronales", "Assiettes élargies aux primes exceptionnelles ; rattrapage comptable non encore soldé.", "2025-04-01", "NON_CONFORME_0", 5],
  ["PATR_IMMO", "Décret", "Décret n°2024-156 portant Code de la construction", "Normes parasismiques et permis de construire unifié ; audit technique des entrepôts en cours.", "2024-10-15", "PARTIELLEMENT_50", 48],
  ["PATR_IMMO", "Arrêté", "Arrêté n°201/MCLU sur les titres fonciers définitifs", "Conversion des titres ruraux des plateformes logistiques ; dossiers bloqués au guichet unique.", "2025-02-20", "NON_CONFORME_0", 12],
  ["PATR_IMMO", "Loi", "Loi n°2020-624 sur l'urbanisme commercial", "Autorisations préalables d'extension des surfaces commerciales ; dossier Plateau à compléter.", "2024-07-07", "PARTIELLEMENT_25", 28],
  ["PATR_IMMO", "Décision", "Décision AGEROUTE n°12-2025 – domaine public routier", "Redevances d'occupation des accès entrepôts ; conventions signées sur 3 sites sur 4.", "2025-05-18", "PARTIELLEMENT_75", 70],
  ["DQHSE", "Décret", "Décret n°2024-089 portant Code de l'environnement", "Obligations de reporting carbone et plans de dépollution ; bilan GES annuel publié.", "2024-06-20", "PARTIELLEMENT_50", 55],
  ["DQHSE", "Arrêté", "Arrêté n°033/MINEDD sur les études d'impact (EIES)", "EIES préalable à toute extension portuaire ; étude du terminal à relancer.", "2025-01-25", "NON_CONFORME_0", 8],
  ["DQHSE", "Loi", "Loi n°2024-510 sur les déchets dangereux", "Traçabilité bordereaux et filières agréées ; contrat prestataire en renouvellement.", "2024-12-01", "PARTIELLEMENT_25", 22],
  ["DQHSE", "Circulaire", "Circulaire CIAPOL 2025-01 – rejets hydriques portuaires", "Seuils de rejet resserrés ; station de traitement du terminal mise à niveau.", "2025-06-10", "PARTIELLEMENT_75", 80],
  ["DQHSE", "Décret", "Décret n°2025-044 – transport de matières dangereuses", "Certification ADR des conducteurs et balisage citernes ; flotte intégralement certifiée.", "2025-09-01", "CONFORME_100", 100],
  ["DIR_COMM_MARK", "Loi", "Loi n°2016-412 sur la concurrence (mod. 2024)", "Pratiques tarifaires et ententes : guide interne diffusé, audit commercial planifié.", "2024-08-25", "PARTIELLEMENT_50", 50],
  ["DIR_COMM_MARK", "Arrêté", "Arrêté n°067/MCIPP sur l'étiquetage des marchandises", "Mentions obligatoires en français sur emballages ; contrôle qualité renforcé à l'import.", "2025-03-30", "NON_CONFORME_0", 18],
  ["DIR_COMM_MARK", "Circulaire", "Circulaire OIC 2024-11 – publicité des prix", "Affichage prix TTC harmonisé en agences ; kit PLV déployé sur tout le réseau.", "2024-11-20", "CONFORME_100", 100],
  ["DILS", "Décret", "Décret n°2024-133 – Code des douanes UEMOA", "Dédouanement anticipé et garantie globale ; cautions ajustées auprès du commissionnaire.", "2024-09-12", "PARTIELLEMENT_75", 74],
  ["DILS", "Arrêté", "Arrêté conjoint n°090 Transports – gabarits routiers", "Limitation essieux sur corridor Abidjan-Ouaga ; plan de renouvellement remorques en retard.", "2025-02-05", "NON_CONFORME_0", 10],
  ["DILS", "Loi", "Loi n°2023-902 sur la sûreté portuaire (PAA)", "Certification ISPS des installations ; audit annuel validé sans réserve.", "2024-05-10", "CONFORME_100", 100],
  ["DILS", "Circulaire", "Circulaire DGDDL 2025-06 – entrepôts sous douane", "Agrément MEA renouvelable et stocks comptables ; inventaire contradictoire à organiser.", "2025-04-22", "PARTIELLEMENT_25", 25],
  ["CENTRAL_VRG", "Ordonnance", "Ordonnance n°2024-001 de veille générale – recueil T1", "Recueil trimestriel des textes transverses ; diffusion interne effectuée.", "2024-04-01", "CONFORME_100", 100],
  ["CENTRAL_VRG", "Loi", "Loi n°2025-100 d'orientation transport-logistique", "Schéma directeur multimodal ; déclinaison par direction en cours de cadrage.", "2026-01-15", "PARTIELLEMENT_50", 45],
];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const RESPONSABLES: Record<string, string> = {
  CENTRAL_VRG: "A. Koné (Veille)",
  DJ: "M. Diarra (DJ)",
  DAF: "S. N'Guessan (DAF)",
  DRH: "F. Touré (DRH)",
  PATR_IMMO: "K. Yao (Patrimoine)",
  DQHSE: "D. Coulibaly (QHSE)",
  DIR_COMM_MARK: "L. Adjoua (Commercial)",
  DILS: "Y. Ouattara (DILS)",
};

const ACTION_LIBELLES: Record<ConformiteStatut, string> = {
  CONFORME_100: "",
  NON_CONFORME_0: "Plan de mise en conformité initial à engager",
  PARTIELLEMENT_25: "Poursuivre le plan de mise en conformité (phase 1)",
  PARTIELLEMENT_50: "Finaliser les pièces et preuves manquantes (phase 2)",
  PARTIELLEMENT_75: "Lever les dernières réserves avant clôture",
};

export const MOCK_ALERTES: MockAlerte[] = ROWS.map((row, i) => ({
  id: `mock-${i + 1}`,
  numeroOrdre: `AGL-2026-${String(i + 1).padStart(3, "0")}`,
  departement: row[0],
  natureTexte: row[1],
  referenceTexte: row[2],
  resumeTexte: row[3],
  dateEntreeVigueur: row[4],
  statut: row[5],
  tauxAvancement: row[6],
}));

/** Une action d'amélioration par alerte non conforme / partielle. */
export const MOCK_ACTIONS: MockAction[] = MOCK_ALERTES.filter(
  (a) => a.statut !== "CONFORME_100",
).map((a, i) => ({
  id: `mock-action-${i + 1}`,
  numeroOrdre: a.numeroOrdre,
  libelleAction: ACTION_LIBELLES[a.statut],
  responsable: RESPONSABLES[a.departement],
  delai: addDays(a.dateEntreeVigueur, a.statut === "NON_CONFORME_0" ? 60 : 120),
  tauxAvancement: Math.min(a.tauxAvancement, 95),
}));

/** Taux de conformité moyen (%) d'un lot d'alertes. */
export function tauxConformiteMoyen(alertes: MockAlerte[]): number {
  if (alertes.length === 0) return 0;
  const total = alertes.reduce(
    (sum, a) => sum + CONFORMITE_POURCENTAGE[a.statut],
    0,
  );
  return Math.round(total / alertes.length);
}

/** Actions en retard : délai dépassé et avancement < 100 %. */
export function actionsEnRetard(
  actions: MockAction[],
  now: Date = new Date(),
): MockAction[] {
  const today = now.toISOString().slice(0, 10);
  return actions.filter((a) => a.delai < today && a.tauxAvancement < 100);
}
