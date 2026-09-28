import { LogoAGL } from "@/components/LogoAGL";
import { NavOnglets } from "@/components/NavOnglets";
import { PastilleSession, useBuConnectee } from "@/components/SessionBU";

/**
 * AGL JuriCompliance — Mémo d'utilisation (guide complet, langage utilisateur).
 * Couvre toutes les fonctions : accès par direction, assignation multi-actes,
 * documents multiples, reprise du travail en cours, indicateurs, workflow,
 * droits par BU, pertinence transit, dates, historique, approbations et rejets.
 * Accessible via le bouton « ⓘ Mémo » de la barre d'en-tête.
 */

const SECTIONS: { titre: string; contenu: React.ReactNode }[] = [
  {
    titre: "Votre accès : une vue et un mot de passe par direction",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Chaque direction a sa vue.</strong> Le tableau de bord ne montre
          que vos fiches (filtre calé sur votre session), votre file
          d&apos;approbation et vos indicateurs. La pastille en haut à droite
          indique qui est connecté.
        </li>
        <li>
          <strong>Deux accès par direction</strong> : un compte nominatif (votre
          email AGL — vos modifications sont tracées à votre nom) ou un accès
          partagé de la direction (<code>direction-&lt;bu&gt;@agl.ci</code>). Le
          mot de passe de l&apos;un n&apos;ouvre pas l&apos;autre.
        </li>
        <li>
          <strong>Réservé à la Veille Réglementaire Générale</strong> (centrale) :
          l&apos;onglet <strong>Assignation</strong> (charger un PDF, affecter
          chaque acte) et l&apos;onglet <strong>Rejet</strong>. Ces boutons
          n&apos;apparaissent pas pour les autres directions, et l&apos;API
          refuse l&apos;opération (403) même si l&apos;on contourne
          l&apos;interface.
        </li>
        <li>
          <strong>« Sortir »</strong> en haut à droite ferme la session. Sans
          session, plus aucun écran ni aucune donnée n&apos;est accessible.
        </li>
      </ul>
    ),
  },
  {
    titre: "Nouvelle alerte : du dépôt aux actes",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Déposez <strong>un ou plusieurs PDF / images</strong> (glisser-déposer ou
          parcours, sélection multiple), ou utilisez les boutons « Tester avec
          l&apos;exemple » (JO n°53 intégré), puis « Scanner ». La saisie manuelle
          reste possible.
        </li>
        <li>
          <strong>1 document = N actes</strong> : un Journal Officiel contient
          des dizaines d&apos;actes distincts — l&apos;IA les extrait un par un,
          sans les fusionner.
        </li>
        <li>
          Naviguez avec <strong>« Acte X / N »</strong> (←/→ ou liste) : nature,
          référence complète, <strong>articles</strong>, résumé,{" "}
          <strong>texte brut transcrit</strong>, pertinence — tout est vérifiable
          et modifiable avant assignation.
        </li>
        <li>
          « Valider » passe à l&apos;acte suivant ; « Enregistrer » crée{" "}
          <strong>un N° d&apos;ordre par acte</strong> (-01, -02, …). Les actes
          sans BU cochée sont ignorés (signalés à l&apos;écran).
        </li>
      </ul>
    ),
  },
  {
    titre: "Reprendre où vous étiez (un scan IA coûte des tokens)",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Rien ne se perd.</strong> Chaque document scanné reste dans la
          liste <strong>« Documents scannés · conservés »</strong> tant qu&apos;il
          n&apos;est pas enregistré : vous pouvez changer d&apos;onglet, quitter la
          page, revenir le lendemain, déposer un nouveau document… le scan est
          conservé à chaque modification.
        </li>
        <li>
          À votre retour, un bandeau <strong>« Reprise »</strong> vous annonce le
          nombre de documents retrouvés et combien d&apos;actes restent sans
          direction cochée. Chaque document porte un badge{" "}
          <strong>« X à assigner »</strong> ou <strong>« prêt »</strong>.
        </li>
        <li>
          <strong>Plusieurs documents d&apos;un coup</strong> : déposez 3 PDF
          ensemble, ils sont analysés l&apos;un après l&apos;autre (chaque résultat
          est conservé dès qu&apos;il arrive — un échec n&apos;annule pas les autres).
        </li>
        <li>
          Seul le document que vous enregistrez disparaît de la liste. Si d&apos;autres
          restent en attente, l&apos;écran vous y reste : rien n&apos;est perdu, vous
          enchaînez.
        </li>
        <li>
          Le <strong>fichier</strong> seul n&apos;est pas conservé (il pèse trop pour
          le navigateur) : pour relancer une analyse sur le même document, il faut
          le re-déposer — vos actes et vos assignations restent intacts entre-temps.
        </li>
        <li>
          Si le navigateur refuse de tout stocker (navigation privée stricte), un
          bandeau orange vous prévient : enregistrez alors vos assignations avant
          de quitter la page.
        </li>
      </ul>
    ),
  },
  {
    titre: "Lire un texte en entier (vue immersive)",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Dans le graphique <strong>« Niveau de conformité par texte »</strong>,
          cliquez une barre : le texte juridique s&apos;ouvre en pleine page —
          article, libellé applicable, transcription brute et métadonnées.
        </li>
        <li>
          <strong>Taille S / M / L</strong> pour lire confortablement, bouton{" "}
          <strong>Copier</strong> pour la transcription brute, et{" "}
          <strong>🔗 Consulter le texte officiel</strong> si le lien est connu.
        </li>
        <li>
          <strong>←</strong> et <strong>→</strong> passent au texte précédent /
          suivant, <strong>Échap</strong> referme. Rien n&apos;est enregistré par cette
          lecture : c&apos;est une consultation.
        </li>
      </ul>
    ),
  },
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
          aujourd&apos;hui (plus récente des fiches du texte) ; chaque BU
          affiche aussi la sienne dans le détail.
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
    titre: "La pertinence transit (Directe / Indirecte / Hors périmètre)",
    contenu: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Directe</strong> : le texte régit une activité d&apos;AGL CI
          (transport, transit, douane, port, foncier d&apos;exploitation).
        </li>
        <li>
          <strong>Indirecte</strong> : il peut affecter AGL CI sans la viser
          (ex : réglementation générant du fret, urbanisme d&apos;une zone avec
          installations).
        </li>
        <li>
          <strong>Hors périmètre</strong> : aucun lien avec l&apos;activité
          (⛔ aucune BU recommandée) — la centrale reste seule décideuse.
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
  const { estCentrale: estCentraleSession } = useBuConnectee();
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 bg-brand-blue text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoAGL />
            <div>
              <p className="text-lg font-bold leading-tight">Mémo — mode d&apos;emploi AGL JuriCompliance</p>
              <p className="text-xs text-slate-300">
                Indicateurs, workflow, droits, dates et historique expliqués
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NavOnglets actif="memo" estCentrale={estCentraleSession} />
            <span aria-hidden="true" className="hidden h-6 w-px bg-white/20 sm:block" />
            <PastilleSession />
          </div>
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
