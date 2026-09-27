import Link from "next/link";
import { LogoAGL } from "@/components/LogoAGL";

/**
 * JuriScan AI — Mémo d'utilisation (guide structuré, langage utilisateur).
 * Explique les indicateurs, le workflow, les droits par BU, les dates et
 * l'historique. Accessible via l'icône « ⓘ Mémo » de chaque en-tête.
 */

const SECTIONS: { titre: string; contenu: React.ReactNode }[] = [
  {
    titre: "Les 3 indicateurs du pilotage",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Alertes globales</strong> : nombre de fiches BU suivies sur le
          périmètre affiché (tient compte des filtres).
        </li>
        <li>
          <strong>Taux de conformité moyen (%)</strong> : moyenne des niveaux de
          conformité des fiches affichées.
        </li>
        <li>
          <strong>Actions en retard</strong> : actions dont le délai est dépassé
          avec un avancement inférieur à 100 %.
        </li>
      </ul>
    ),
  },
  {
    titre: "Le workflow en 4 étapes",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Attente validation juridique</strong> : le texte vient
          d&apos;être analysé et assigné, la centrale le contrôle.
        </li>
        <li>
          <strong>Attente approbation métier</strong> : la centrale a validé, la
          BU doit approuver ou rejeter depuis « Approbations métier ».
        </li>
        <li>
          <strong>Approuvé métier</strong> : la BU a accepté et pilote sa
          conformité (preuves, actions, taux).
        </li>
        <li>
          <strong>Rejeté métier</strong> : la BU a refusé l&apos;assignation, la
          centrale retraite depuis « Rejets ».
        </li>
      </ul>
    ),
  },
  {
    titre: "Le graphique « Niveau de conformité par texte »",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Chaque carte = un texte, avec son <strong>taux moyen</strong> (⌀).
        </li>
        <li>
          Si le texte concerne <strong>2 ou 3 BU</strong>, le pourcentage de
          <strong> chaque BU</strong> est détaillé sous la moyenne.
        </li>
        <li>
          Couleurs : vert ≥ 75 %, or 25 – 74 %, rouge &lt; 25 %.
        </li>
        <li>Cliquez une carte pour ouvrir son détail dans le tableau.</li>
      </ul>
    ),
  },
  {
    titre: "Le tableau « Suivi des textes »",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Les textes sont regroupés par N° d&apos;ordre (un texte → N fiches BU).</li>
        <li>
          <strong>Dernière modif</strong> : date de l&apos;état affiché
          aujourd&apos;hui (plus récente des fiches du texte).
        </li>
        <li>
          Cliquez un texte pour voir <strong>chaque BU</strong> : statut,
          workflow, preuves, taux (modifiable uniquement par sa BU).
        </li>
      </ul>
    ),
  },
  {
    titre: "Les filtres",
    contenu: (
      <p>
        BU, date d&apos;entrée en vigueur, type de texte, statut workflow et
        recherche libre (N° d&apos;ordre, référence, mot-clé) : ils s&apos;appliquent
        aux indicateurs, au graphique et au tableau. « Réinitialiser les
        filtres » revient à la vue générale.
      </p>
    ),
  },
  {
    titre: "Qui peut modifier quoi ?",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Votre BU</strong> (sélecteur « Connecté » en haut) : modifie
          <strong> uniquement ses assignations</strong> — conformité, preuves,
          actions, taux, approbation ou rejet. Le reste est en lecture seule 🔒.
        </li>
        <li>
          <strong>La centrale (CENTRAL_VRG)</strong> : crée les alertes, assigne
          les BU, valide vers le métier, retraite les rejets, corrige les textes
          — sans jamais toucher à la conformité d&apos;une BU.
        </li>
        <li>
          <strong>DJ, DAF, DRH…</strong> : toutes les BU sont cloisonnées de la
          même façon, sans exception.
        </li>
      </ul>
    ),
  },
  {
    titre: "Les dates affichées",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Assignée le</strong> : date d&apos;assignation de la fiche à la BU.
        </li>
        <li>
          <strong>Rejetée le</strong> : date du refus de la BU (+ ancienneté).
        </li>
        <li>
          <strong>En attente depuis</strong> : ancienneté de l&apos;attente
          d&apos;approbation (depuis la validation, ou le renvoi après rejet).
        </li>
        <li>
          <strong>Dernière mise à jour</strong> (barre du haut, à droite) : date
          et heure de la plus récente des données regardées — le survol précise
          l&apos;ancienneté et la date de l&apos;application.
        </li>
      </ul>
    ),
  },
  {
    titre: "L'historique des modifications",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Chaque création, validation, approbation, rejet et pilotage est tracé
          (qui, quoi, quand) et consultable dans « 🕘 Historique ».
        </li>
        <li>
          Pastilles <strong>démo</strong> (données de démonstration) et{" "}
          <strong>réel</strong> (données enregistrées).
        </li>
        <li>Chaque fiche a aussi son historique en bas de sa page « Modifier ».</li>
      </ul>
    ),
  },
  {
    titre: "Nouvelle alerte : les actes un par un",
    contenu: (
      <ol className="list-decimal space-y-1 pl-5">
        <li>Analyse automatique (dépôt PDF/image) ou saisie manuelle libre.</li>
        <li>
          Un document = N actes détectés : naviguez avec « Acte X / N »,
          vérifiez chaque acte (nature, référence, articles, texte brut) puis
          cochez les BU concernées.
        </li>
        <li>
          « Valider » fait avancer vers l&apos;acte suivant ; « Enregistrer »
          crée un N° d&apos;ordre par acte (-01, -02, …). Les actes sans BU
          (dont « Hors périmètre ») sont ignorés.
        </li>
      </ol>
    ),
  },
  {
    titre: "Approbations & Rejets : mode d'emploi",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Approbations</strong> : choisissez la file d&apos;une BU (cela
          la connecte), approuvez en renseignant l&apos;action de mise en
          conformité, ou rejetez l&apos;assignation.
        </li>
        <li>
          <strong>Rejets</strong> : la centrale modifie / réassigne puis renvoie
          la fiche vers la BU.
        </li>
      </ul>
    ),
  },
];

export default function MemoPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoAGL />
            <div>
              <p className="text-lg font-bold leading-tight">Mémo — mode d&apos;emploi JuriScan</p>
              <p className="text-xs text-slate-300">
                Indicateurs, workflow, droits, dates et historique expliqués
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full bg-brand-gold px-4 py-1.5 text-sm font-bold text-brand-blue transition-colors hover:brightness-95"
          >
            ← Pilotage juridique
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <p className="rounded-xl border border-brand-gold/50 bg-brand-gold/10 px-4 py-3 text-sm text-brand-blue">
          Ce mémo explique ce que vous voyez à l&apos;écran. Pensez à vérifier votre
          BU connectée (sélecteur en haut) : chaque BU ne modifie que ses
          assignations.
        </p>
        {SECTIONS.map((s, i) => (
          <details
            key={s.titre}
            open={i === 0}
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <summary className="cursor-pointer bg-slate-50 px-5 py-3 text-sm font-bold text-brand-blue transition-colors hover:bg-brand-blue/5">
              <span className="mr-2 inline-block w-4 text-brand-gold transition-transform group-open:rotate-90">
                ▸
              </span>
              {s.titre}
            </summary>
            <div className="px-5 py-3 text-sm leading-relaxed text-slate-700">{s.contenu}</div>
          </details>
        ))}
      </main>
    </div>
  );
}
