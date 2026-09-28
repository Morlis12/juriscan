import Link from "next/link";

/**
 * AGL JuriCompliance — barre de boutons de l'en-tête, partagée par tous les
 * écrans. Interface de base : « Tableau de bord » (page d'accueil, redirigée
 * par `/`), puis le parcours de travail de gauche à droite.
 *
 *   Tableau de bord → Assignation → Approbation → Rejet → Historique → Mémo
 *
 * « Assignation » est le seul bouton plein (or) : c'est là qu'on charge le PDF
 * ou la saisie manuelle, puis qu'on affecte chaque acte à sa direction. C'est
 * l'action principale de la centrale, elle doit sauter aux yeux sans écraser la
 * navigation (les 5 autres restent discrets).
 *
 * Portabilité Power Pages : composant purement déclaratif, ordre et libellés
 * centralisés ici — à reprendre tel quel dans la navigation du portail. Aucun
 * `usePathname` : le bouton actif est passé en propriété.
 */

export type OngletActif =
  | "pilotage"
  | "assignation"
  | "approbation"
  | "rejet"
  | "historique"
  | "memo";

/** Les 6 boutons, dans l'ordre du parcours (interface de base = Tableau de bord). */
const TOUS: {
  cle: OngletActif;
  href: string;
  icone: string;
  libelle: string;
  titre: string;
  principal?: boolean;
  /** Réservé à la centrale (veille réglementaire générale). */
  centrale?: boolean;
}[] = [
  {
    cle: "pilotage",
    href: "/dashboard",
    icone: "▦",
    libelle: "Tableau de bord",
    titre: "Page d'accueil : filtres, indicateurs et suivi de la veille",
  },
  {
    cle: "assignation",
    href: "/dashboard/nouvelle-alerte",
    icone: "＋",
    libelle: "Assignation",
    titre: "Charger un PDF ou faire la saisie manuelle, puis affecter chaque acte à sa direction",
    principal: true,
    centrale: true,
  },
  {
    cle: "approbation",
    href: "/dashboard/approbations",
    icone: "✔",
    libelle: "Approbation",
    titre: "File d'approbation : votre direction approuve ou rejette ses assignations",
  },
  {
    cle: "rejet",
    href: "/dashboard/rejets",
    icone: "⚠",
    libelle: "Rejet",
    titre: "Assignations refusées par les BU, à retraiter par la centrale",
    centrale: true,
  },
  {
    cle: "historique",
    href: "/dashboard/historique",
    icone: "🕘",
    libelle: "Historique",
    titre: "Chaque modification est consultable ici",
  },
  {
    cle: "memo",
    href: "/dashboard/memo",
    icone: "ⓘ",
    libelle: "Mémo",
    titre: "Mémo : comprendre les indicateurs et les règles",
  },
];

const ONGLE_TRANQUILLE =
  "bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white";
const ONGLE_ACTIF = "bg-white text-brand-blue hover:bg-white focus-visible:outline-white";
const ONGLE_CTA =
  "bg-brand-gold text-brand-blue font-bold shadow hover:brightness-95 focus-visible:outline-white";

export function NavOnglets({
  actif,
  rejets,
  historiqueHref,
  estCentrale = true,
}: {
  actif?: OngletActif;
  /** Nombre de rejets à traiter — pastille rouge sur le bouton (optionnel). */
  rejets?: number;
  /** Cible de l'onglet Historique — la fiche peut passer son propre filtre. */
  historiqueHref?: string;
  /**
   * Une direction ne voit pas les écrans de la centrale (Assignation, Rejet) :
   * sa vue s'arrête là où ses droits s'arrêtent. L'API applique la même règle
   * côté serveur (403) — l'interface ne fait que ne pas proposer l'écran.
   */
  estCentrale?: boolean;
}) {
  const onglets = estCentrale ? TOUS : TOUS.filter((o) => !o.centrale);
  return (
    <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1.5">
      {onglets.map((onglet) => {
        const href =
          onglet.cle === "historique" && historiqueHref
            ? historiqueHref
            : onglet.href;
        const estActif = actif === onglet.cle;
        const classes = [
          "inline-flex items-center gap-1.5 rounded-full transition-colors",
          onglet.principal
            ? `${ONGLE_CTA} px-5 py-2 text-sm ring-1 ring-brand-gold/60 ${
                estActif ? "ring-2 ring-white" : ""
              }`
            : `${estActif ? ONGLE_ACTIF : ONGLE_TRANQUILLE} px-4 py-1.5 text-sm ${
                estActif ? "font-bold" : "font-medium"
              }`,
        ].join(" ");
        return (
          <Link
            key={onglet.cle}
            href={href}
            title={onglet.titre}
            aria-current={estActif ? "page" : undefined}
            className={classes}
          >
            <span aria-hidden="true" className={onglet.principal ? "text-base" : "text-xs"}>
              {onglet.icone}
            </span>
            {onglet.libelle}
            {onglet.cle === "rejet" && typeof rejets === "number" && rejets > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {rejets}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
