import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeZip } from "./lib/zip.mjs";
import { buildPackage } from "./lib/package.mjs";
import { Slide, C, card, circle, icon, iconBadge, line, t, transition } from "./lib/dml.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "AGL-JuriCompliance-Presentation.pptx");

const SW = 960;
const M = 56;
const CW = SW - M * 2;
const HEAD = 92;
const REPO = "https://github.com/Morlis12/juriscan";

const bodyPara = (text, extra = {}) => ({
  lnSpc: 1.25,
  runs: [t(text, { sz: 9.5, color: C.body, ...extra })],
});
const chipWidth = (text, sz = 9.5, pad = 20) => pad + text.length * sz * 0.56;

function header(slide, { num, eyebrow, title, logo }) {
  slide.shape({ x: 0, y: 0, w: SW, h: HEAD, fill: { color: C.blue } });
  slide.shape({ x: 0, y: HEAD, w: SW, h: 3, fill: { color: C.gold } });
  circle(slide, { x: 26, y: 27, d: 38, fill: null, line: { w: 1.25, color: C.gold } });
  slide.text({
    x: 26,
    y: 27,
    w: 38,
    h: 38,
    anchor: "ctr",
    paras: [{ align: "ctr", runs: [t(num, { sz: 15, b: true, color: C.gold })] }],
  });
  slide.text({
    x: 84,
    y: 18,
    w: 640,
    h: 14,
    paras: [{ runs: [t(eyebrow, { sz: 9, b: true, color: C.gold, caps: true, spc: 140 })] }],
  });
  slide.text({
    x: 84,
    y: 36,
    w: 700,
    h: 40,
    paras: [{ runs: [t(title, { sz: 24, b: true, color: C.white })] }],
  });
  if (logo) slide.picture({ x: SW - M - 67, y: 30, w: 67, h: 32, rId: logo });
}

function footer(slide, page, total = 6) {
  line(slide, { x: M, y: 504, w: CW, color: C.border });
  slide.text({
    x: M,
    y: 511,
    w: 560,
    h: 12,
    paras: [
      {
        runs: [
          t("AGL JuriCompliance", { sz: 8.5, b: true, color: C.muted }),
          t("  ·  Veille réglementaire assistée par IA  ·  Prototype", { sz: 8.5, color: C.muted }),
        ],
      },
    ],
  });
  slide.text({
    x: SW - M - 160,
    y: 511,
    w: 160,
    h: 12,
    paras: [{ align: "r", runs: [t(`${page} / ${total}`, { sz: 8.5, b: true, color: C.blue })] }],
  });
}

function featureCard(slide, { x, y, w, h, iconName, title, body, badge = C.blue }) {
  card(slide, { x, y, w, h });
  slide.shape({ x, y, w: 4, h, geom: "roundRect", adj: { radius: 2 }, fill: { color: C.gold } });
  iconBadge(slide, iconName, { x: x + 20, y: y + 20, size: 38, bg: badge });
  slide.text({
    x: x + 20,
    y: y + 68,
    w: w - 40,
    h: 34,
    paras: [{ lnSpc: 1.06, runs: [t(title, { sz: 12.5, b: true, color: C.blue })] }],
  });
  slide.text({
    x: x + 20,
    y: y + 104,
    w: w - 40,
    h: h - 118,
    paras: [bodyPara(body)],
  });
}

function chip(slide, { x, y, w, text, sz = 9.5, fill, lineColor, color = C.blue, h = 22, pad = 20, bold = true }) {
  const width = w || chipWidth(text, sz, pad);
  slide.shape({
    x,
    y,
    w: width,
    h,
    geom: "roundRect",
    adj: { radius: h / 2 },
    fill: fill ? { color: fill } : null,
    line: lineColor ? { w: 0.75, color: lineColor } : null,
  });
  slide.text({
    x,
    y,
    w: width,
    h,
    anchor: "ctr",
    paras: [{ align: "ctr", runs: [t(text, { sz, b: bold, color })] }],
  });
  return width;
}

function bandCard(slide, { x, y, w, h, iconName, title, body, fill = C.blueTint, titleColor = C.blue }) {
  slide.shape({ x, y, w, h, geom: "roundRect", adj: { radius: 12 }, fill: { color: fill } });
  slide.shape({ x, y, w: 4.5, h, geom: "roundRect", adj: { radius: 2 }, fill: { color: C.gold } });
  if (iconName) iconBadge(slide, iconName, { x: x + 20, y: y + (h - 40) / 2, size: 40, bg: titleColor });
  const tx = x + (iconName ? 76 : 24);
  slide.text({
    x: tx,
    y: y + 18,
    w: w - (tx - x) - 24,
    h: h - 36,
    anchor: "ctr",
    paras: [
      {
        lnSpc: 1.2,
        runs: [
          t(title, { sz: 11.5, b: true, color: titleColor }),
          t(body, { sz: 10, color: C.body }),
        ],
      },
    ],
  });
}

const slides = [];
const titles = [];
const notes = [];

/* ---------------------------------------------------------------- 1 */
{
  const slide = new Slide(C.blue);
  slide.shape({ x: 700, y: -130, w: 440, h: 440, geom: "ellipse", fill: { color: C.blueSoft, alpha: 13 } });
  slide.shape({ x: 800, y: 250, w: 300, h: 300, geom: "ellipse", fill: { color: C.gold, alpha: 6 } });
  slide.shape({ x: 560, y: 40, w: 200, h: 200, geom: "ellipse", fill: null, line: { w: 1, color: C.gold, alpha: 26 } });
  slide.shape({ x: 56, y: 176, w: 4, h: 78, fill: { color: C.gold } });

  const logoRel = slide.rel("../media/logo-agl.png", "image");
  slide.picture({ x: 56, y: 54, w: 138, h: 66, rId: logoRel });

  slide.text({
    x: 82,
    y: 172,
    w: 620,
    h: 14,
    paras: [
      {
        runs: [
          t("AGL  ·  Veille réglementaire  ·  Africa Global Logistics", {
            sz: 9.5,
            b: true,
            color: C.gold,
            caps: true,
            spc: 160,
          }),
        ],
      },
    ],
  });
  slide.text({
    x: 82,
    y: 194,
    w: 760,
    h: 74,
    paras: [
      {
        runs: [
          t("AGL ", { sz: 52, b: true, color: C.white }),
          t("JuriCompliance", { sz: 52, b: true, color: C.gold }),
        ],
      },
    ],
  });
  slide.text({
    x: 82,
    y: 278,
    w: 700,
    h: 26,
    paras: [{ runs: [t("Veille réglementaire assistée par IA", { sz: 19, color: "DCE5F2" })] }],
  });
  slide.text({
    x: 82,
    y: 312,
    w: 720,
    h: 20,
    paras: [
      {
        runs: [
          t("Du Journal Officiel à la conformité terrain : capter, extraire, assigner, piloter.", {
            sz: 12,
            color: "A9BAD2",
          }),
        ],
      },
    ],
  });

  let cx = 56;
  for (const label of [
    "Prototype fonctionnel",
    "8 directions",
    "Traçabilité intégrale",
    "Power Pages / Dataverse ready",
  ]) {
    const w = chipWidth(label, 9.5, 26);
    slide.shape({
      x: cx,
      y: 372,
      w,
      h: 30,
      geom: "roundRect",
      adj: { radius: 15 },
      fill: { color: C.white, alpha: 10 },
      line: { w: 0.75, color: C.white, alpha: 26 },
    });
    slide.text({
      x: cx,
      y: 372,
      w,
      h: 30,
      anchor: "ctr",
      paras: [{ align: "ctr", runs: [t(label, { sz: 9.5, b: true, color: "E8EEF7" })] }],
    });
    cx += w + 12;
  }

  line(slide, { x: 56, y: 452, w: CW, h: 1, color: "5D7093" });
  slide.text({
    x: 56,
    y: 468,
    w: 620,
    h: 16,
    paras: [
      {
        runs: [
          t("Présentation de projet  ·  ", { sz: 10, color: "A9BAD2" }),
          t(REPO.replace("https://", ""), { sz: 10, b: true, color: C.gold }),
        ],
      },
    ],
  });
  slide.text({
    x: SW - M - 320,
    y: 468,
    w: 320,
    h: 16,
    paras: [
      {
        align: "r",
        runs: [t("Next.js 16 · Prisma / PostgreSQL · Entra ID ready", { sz: 10, color: "A9BAD2" })],
      },
    ],
  });

  titles.push("AGL JuriCompliance");
  notes.push([
    "Bonjour, je vous présente AGL JuriCompliance, notre prototype de veille réglementaire.",
    "L'idée tient en une phrase : transformer le Journal Officiel en plans d'actions de conformité suivis, par direction.",
    "Trois idées à retenir aujourd'hui : l'IA fait le dépouillement, la centrale répartit les textes, chaque direction pilote la sienne en vase clos.",
    "Le prototype est fonctionnel et a été écrit pour ne pas être jeté : il est prêt à migrer vers Power Pages et Dataverse.",
    "Durée indicative : 6 slides, on garde 5 minutes pour la démo et les questions.",
  ]);
  slides.push({ slide, transition: transition("fade") });
}

/* ---------------------------------------------------------------- 2 */
{
  const slide = new Slide();
  const logoRel = slide.rel("../media/logo-agl.png", "image");
  header(slide, {
    num: "01",
    eyebrow: "Le constat",
    title: "Un flux manuel, dispersé et peu tracé",
    logo: logoRel,
  });

  const cards = [
    {
      iconName: "building",
      title: "8 directions concernées",
      body: "Veille générale, Direction Juridique, DAF, DRH, Patrimoine Immobilier, DQHSE, Commerciale & Marketing, DILS.",
    },
    {
      iconName: "list",
      title: "Un suivi dispersé",
      body: "Un fichier par direction, aucun tableau de bord commun, pas d'historique : le pilotage repose sur des échanges hors outil.",
    },
    {
      iconName: "document",
      title: "Un dépouillement manuel",
      body: "Chaque numéro du Journal Officiel est lu, recopié et affecté à la main — plusieurs jours de travail, avec un risque d'oubli.",
    },
    {
      iconName: "warning",
      title: "Des risques qui se paient",
      body: "Texte manqué, assignation floue, preuves éparpillées, actions en retard invisibles, aucune piste d'audit.",
    },
  ];

  const w = (CW - 60) / 4;
  cards.forEach((spec, i) => {
    featureCard(slide, { x: M + i * (w + 20), y: 140, w, h: 196, ...spec });
  });

  bandCard(slide, {
    x: M,
    y: 362,
    w: CW,
    h: 112,
    iconName: "refresh",
    title: "Notre réponse :  ",
    body:
      "un document = N actes. L'IA extrait, la centrale assigne chaque acte à la bonne direction, chaque direction traite et suit ses fiches, et chaque modification est tracée.",
  });

  footer(slide, 2);
  titles.push("01 — Le constat");
  notes.push([
    "Le problème que l'on adresse n'est pas technique : c'est organisationnel.",
    "Aujourd'hui la conformité réglementaire se suit dans des fichiers séparés, direction par direction, et le Journal Officiel se dépouille à la main.",
    "Les conséquences concrètes : des textes qui nous échappent, des assignations approximatives, des preuves introuvables et des retards que personne ne voit.",
    "La réponse tient dans la ligne du bas : un document, plusieurs actes, une assignation par direction, un suivi, une traçabilité.",
    "Ne pas entrer dans le détail technique ici : c'est l'objet de la slide suivante.",
  ]);
  slides.push({ slide, transition: transition("pushUp") });
}

/* ---------------------------------------------------------------- 3 */
{
  const slide = new Slide();
  const logoRel = slide.rel("../media/logo-agl.png", "image");
  header(slide, {
    num: "02",
    eyebrow: "Architecture",
    title: "Du PDF à la preuve : 5 couches, 6 écrans",
    logo: logoRel,
  });

  const rows = [
    {
      iconName: "scan",
      title: "Sources",
      body: "PDF ou image du Journal Officiel. Des fichiers de test sont fournis dans l'application pour la démonstration.",
      tag: "PDF · image",
    },
    {
      iconName: "sparkle",
      title: "Analyse IA",
      body: "1 document = N actes, 21 champs par acte (article, libellé, entrée en vigueur, lien), pertinence transit et contrôle de fidélité.",
      tag: "IA",
    },
    {
      iconName: "layers",
      title: "Domaine métier pur",
      body: "Types, workflow, matrice d'accès, jalons et formulaire vivent hors de Next.js et de Prisma : le noyau est portable.",
      tag: "5 modules",
    },
    {
      iconName: "database",
      title: "Persistance",
      body: "Prisma 6 / PostgreSQL : 7 tables, versions figées et journal — la traçabilité est dans le modèle, pas dans un rapport.",
      tag: "7 tables",
    },
    {
      iconName: "dashboard",
      title: "Écrans & API",
      body: "6 écrans (pilotage, nouvelle alerte, approbations, rejets, historique, mémo) et 6 routes API, les mêmes règles des deux côtés.",
      tag: "6 écrans",
    },
  ];

  rows.forEach((spec, i) => {
    const y = 140 + i * 58;
    card(slide, { x: M, y, w: CW, h: 50, radius: 10 });
    iconBadge(slide, spec.iconName, { x: M + 14, y: y + 9, size: 32, radius: 10, bg: C.blueSoft });
    slide.text({
      x: M + 58,
      y: y + 8,
      w: 168,
      h: 34,
      anchor: "ctr",
      paras: [{ runs: [t(spec.title, { sz: 11.5, b: true, color: C.blue })] }],
    });
    slide.text({
      x: M + 232,
      y: y + 8,
      w: 464,
      h: 34,
      anchor: "ctr",
      paras: [bodyPara(spec.body, { lnSpc: 1.15 })],
    });
    chip(slide, {
      x: M + 712,
      y: y + 14,
      w: CW - 712 - 14,
      text: spec.tag,
      fill: C.goldTint,
      color: C.goldDeep,
      h: 22,
    });
  });

  slide.shape({
    x: M,
    y: 442,
    w: CW,
    h: 50,
    geom: "roundRect",
    adj: { radius: 10 },
    fill: { color: C.blueTint },
  });
  slide.text({
    x: M + 20,
    y: 442,
    w: 84,
    h: 50,
    anchor: "ctr",
    paras: [{ runs: [t("Stack", { sz: 11, b: true, color: C.blue })] }],
  });
  let sx = M + 108;
  for (const tech of ["Next.js 16", "React 19", "Tailwind v4", "TypeScript strict", "ESLint", "zod", "pdf-lib"]) {
    const w = chip(slide, {
      x: sx,
      y: 456,
      text: tech,
      sz: 9,
      color: C.body,
      bold: false,
      lineColor: "C9D5E6",
      pad: 16,
    });
    sx += w + 8;
  }

  footer(slide, 3);
  titles.push("02 — Architecture");
  notes.push([
    "Voici ce que contient réellement l'application, couche par couche.",
    "En haut la source : un PDF ou une image, rien de plus. Au centre l'extraction par IA, qui transforme un document en actes distincts — un Journal Officiel contient des dizaines d'actes, on ne les fusionne jamais.",
    "Le point important est le domaine métier : il est écrit sans Next.js ni Prisma. C'est ce qui rend la migration Dataverse possible sans réécrire la logique.",
    "La persistance porte déjà le versioning et le journal : la traçabilité n'est pas une option ajoutée après coup.",
    "Et enfin six écrans, une API qui applique exactement les mêmes règles que l'interface.",
  ]);
  slides.push({ slide, transition: transition("pushLeft") });
}

/* ---------------------------------------------------------------- 4 */
{
  const slide = new Slide();
  const logoRel = slide.rel("../media/logo-agl.png", "image");
  header(slide, {
    num: "03",
    eyebrow: "Fonctionnement",
    title: "La centrale pilote, chaque direction décide",
    logo: logoRel,
  });

  const steps = [
    {
      iconName: "docStack",
      title: "1 · Analyse & extraction",
      body: "L'IA découpe le document en actes, propose les directions concernées et évalue la pertinence pour l'activité AGL CI.",
    },
    {
      iconName: "check",
      title: "2 · Validation juridique",
      body: "La centrale relit le texte, corrige les champs de l'alerte et valide l'envoi au métier.",
    },
    {
      iconName: "user",
      title: "3 · Approbation métier",
      body: "Chaque direction approuve ou rejette son assignation. Un refus motivé revient automatiquement à la centrale.",
    },
    {
      iconName: "chart",
      title: "4 · Conformité suivie",
      body: "Statut, preuve, action, responsable, délai et taux d'avancement : le pilotage devient chiffré.",
    },
  ];

  const w = (CW - 60) / 4;
  steps.forEach((spec, i) => {
    const x = M + i * (w + 20);
    card(slide, { x, y: 140, w, h: 200 });
    iconBadge(slide, spec.iconName, { x: x + 20, y: 160, size: 40, bg: i === 0 ? C.blue : C.blueSoft });
    slide.text({
      x: x + 20,
      y: 214,
      w: w - 40,
      h: 34,
      paras: [{ lnSpc: 1.06, runs: [t(spec.title, { sz: 12.5, b: true, color: C.blue })] }],
    });
    slide.text({ x: x + 20, y: 250, w: w - 40, h: 80, paras: [bodyPara(spec.body)] });
    if (i < 3) {
      slide.shape({
        x: x + w + 4,
        y: 226,
        w: 12,
        h: 22,
        geom: "chevron",
        fill: { color: C.gold },
      });
    }
  });

  const halfW = (CW - 24) / 2;
  const panels = [
    {
      iconName: "gear",
      title: "La centrale — Veille Réglementaire Générale",
      body: "Crée les alertes, assigne les directions, corrige le texte source, fait avancer le flux et retraite les rejets. Elle ne touche jamais à la conformité d'une direction.",
    },
    {
      iconName: "lock",
      title: "Chaque direction, cloisonnée",
      body: "Elle ne voit et ne modifie que ses propres fiches — Direction Juridique comprise, sans exception. Contrôle appliqué dans l'interface comme dans l'API (401 / 403).",
    },
  ];
  panels.forEach((spec, i) => {
    const x = M + i * (halfW + 24);
    card(slide, { x, y: 362, w: halfW, h: 118, fill: C.blueTint, line: "C9D5E6" });
    iconBadge(slide, spec.iconName, { x: x + 20, y: 382, size: 40, bg: i === 0 ? C.blue : C.goldDeep });
    slide.text({
      x: x + 76,
      y: 384,
      w: halfW - 96,
      h: 22,
      paras: [{ runs: [t(spec.title, { sz: 12, b: true, color: C.blue })] }],
    });
    slide.text({
      x: x + 76,
      y: 408,
      w: halfW - 96,
      h: 60,
      paras: [bodyPara(spec.body, { lnSpc: 1.22 })],
    });
  });

  footer(slide, 4);
  titles.push("03 — Fonctionnement");
  notes.push([
    "Le principe le plus important de la présentation est ici : qui décide quoi.",
    "Étape 1, l'IA propose. Étape 2, la centrale — la veille réglementaire générale — valide le texte et l'assigne. Étape 3, la direction concernée approuve ou rejette son assignation. Étape 4, elle pilote sa conformité : preuve, action, responsable, délai, taux.",
    "La double validation existe parce que ni l'IA ni la centrale ne décident à la place du métier.",
    "Le cloisonnement est strict : une direction ne touche qu'à ses fiches, la Direction Juridique comprise, sans exception. Les autres directions sont en lecture seule, et ce contrôle existe aussi dans l'API, pas seulement dans l'écran.",
  ]);
  slides.push({ slide, transition: transition("morph") });
}

/* ---------------------------------------------------------------- 5 */
{
  const slide = new Slide();
  const logoRel = slide.rel("../media/logo-agl.png", "image");
  header(slide, {
    num: "04",
    eyebrow: "Garanties",
    title: "Rien ne se perd, tout se prouve",
    logo: logoRel,
  });

  const cards = [
    {
      iconName: "clock",
      title: "Historique SCD type 2",
      body: "Chaque enregistrement fige la version précédente (validFrom, validTo, isCurrent) et écrit dans un journal lisible.",
    },
    {
      iconName: "lock",
      title: "Cloisonnement strict",
      body: "Une direction ne modifie que ses propres fichiers. La matrice d'accès est appliquée côté interface et côté API, pas seulement affichée.",
    },
    {
      iconName: "check",
      title: "Fidélité de l'extraction",
      body: "Articles copiés mot à mot, références complètes, URL jamais inventée : « N/A » si l'information manque.",
    },
    {
      iconName: "calendar",
      title: "Jalons & fraîcheur",
      body: "Assignée le, validée le, rejetée le, en attente depuis N jours, dernière mise à jour et date d'application de l'outil.",
    },
  ];

  const w = (CW - 60) / 4;
  cards.forEach((spec, i) => {
    featureCard(slide, { x: M + i * (w + 20), y: 140, w, h: 196, ...spec });
  });

  slide.shape({
    x: M,
    y: 362,
    w: CW,
    h: 112,
    geom: "roundRect",
    adj: { radius: 12 },
    fill: { color: C.blue },
  });
  iconBadge(slide, "layers", { x: M + 22, y: 398, size: 40, bg: C.blueSoft });
  slide.text({
    x: M + 78,
    y: 376,
    w: CW - 110,
    h: 20,
    paras: [
      {
        runs: [
          t("Une fiche modifiée trois fois reste consultable dans chacun de ses états", {
            sz: 11.5,
            b: true,
            color: C.white,
          }),
        ],
      },
    ],
  });
  slide.text({
    x: M + 78,
    y: 398,
    w: CW - 110,
    h: 18,
    paras: [
      {
        runs: [
          t("Auteur, date et détail des champs modifiés sont conservés à chaque version.", {
            sz: 10,
            color: "C3D0E2",
          }),
        ],
      },
    ],
  });
  const chain = ["Version 1 · figée", "Version 2 · courante", "Version 3 · en cours", "Journal complet"];
  const chainX = M + 78;
  const chainW = CW - 116;
  const chipW = chain.map((label) => chipWidth(label, 9, 22));
  const gap = (chainW - chipW.reduce((a, b) => a + b, 0)) / (chain.length - 1);
  line(slide, { x: chainX, y: 438, w: chainW, h: 1, color: "5D7093" });
  let cx = chainX;
  chain.forEach((label, i) => {
    slide.shape({
      x: cx,
      y: 424,
      w: chipW[i],
      h: 28,
      geom: "roundRect",
      adj: { radius: 8 },
      fill: { color: i === 1 ? C.blueSoft : C.blue, alpha: i === 1 ? 100 : 100 },
      line: { w: 0.75, color: C.gold, alpha: i === 1 ? 100 : 45 },
    });
    slide.text({
      x: cx,
      y: 424,
      w: chipW[i],
      h: 28,
      anchor: "ctr",
      paras: [{ align: "ctr", runs: [t(label, { sz: 9, b: true, color: i === 1 ? C.gold : "D5DFEE" })] }],
    });
    cx += chipW[i];
    if (i < chain.length - 1) {
      slide.shape({ x: cx + gap / 2 - 6, y: 431, w: 13, h: 14, geom: "chevron", fill: { color: C.gold } });
      cx += gap;
    }
  });

  footer(slide, 5);
  titles.push("04 — Garanties");
  notes.push([
    "Une veille réglementaire n'a de valeur que si elle est défendable. Voici les quatre garanties.",
    "Premièrement l'historique : on ne remplace pas une donnée, on la fige. Une fiche modifiée trois fois reste consultable dans ses trois états, avec l'auteur, la date et le détail des champs modifiés.",
    "Deuxièmement le cloisonnement : contrôle réel, dans l'interface comme dans l'API.",
    "Troisièmement la fidélité : l'IA recopie les articles mot à mot et ne construit jamais une référence. Si l'information n'est pas dans le document, la fiche affiche « N/A » et le juridique corrige.",
    "Quatrièmement la fraîcheur : on sait toujours de quand datent les données et de quand date la version de l'outil affichée.",
  ]);
  slides.push({ slide, transition: transition("morph") });
}

/* ---------------------------------------------------------------- 6 */
{
  const slide = new Slide();
  const logoRel = slide.rel("../media/logo-agl.png", "image");
  header(slide, {
    num: "05",
    eyebrow: "Perspectives",
    title: "Cap sur Microsoft : déjà préparé",
    logo: logoRel,
  });

  const leftW = 520;
  card(slide, { x: M, y: 140, w: leftW, h: 292 });
  iconBadge(slide, "cloud", { x: M + 22, y: 162, size: 40, bg: C.blue });
  slide.text({
    x: M + 78,
    y: 162,
    w: leftW - 100,
    h: 40,
    anchor: "ctr",
    paras: [
      {
        runs: [
          t("Déjà prêt pour Power Pages", { sz: 13, b: true, color: C.blue }),
        ],
      },
      { runs: [t("et Dataverse", { sz: 13, b: true, color: C.blue })] },
    ],
  });
  const ready = [
    "7 tables + 4 listes de choix décrites et mappées dans le code",
    "Une Business Unit par direction, 2 rôles de sécurité (BU / Centrale)",
    "Un seul point à basculer : l'identité, par Entra ID et Web Roles",
    "Journal d'audit lisible dans Power Pages, versions en tables dédiées",
    "Logo, couleurs et en-têtes déjà alignés sur le portail",
  ];
  ready.forEach((item, i) => {
    const y = 220 + i * 40;
    icon(slide, "check", { x: M + 24, y: y + 1, size: 15, color: C.green });
    slide.text({
      x: M + 50,
      y,
      w: leftW - 76,
      h: 34,
      anchor: "ctr",
      paras: [bodyPara(item, { sz: 10 })],
    });
  });

  const rightX = M + leftW + 24;
  const rightW = CW - leftW - 24;
  card(slide, { x: rightX, y: 140, w: rightW, h: 292, fill: C.blue, line: C.blue });
  iconBadge(slide, "stepUp", { x: rightX + 22, y: 162, size: 40, bg: C.blueSoft });
  slide.text({
    x: rightX + 78,
    y: 162,
    w: rightW - 100,
    h: 40,
    anchor: "ctr",
    paras: [
      { runs: [t("Prochaines étapes", { sz: 13, b: true, color: C.white })] },
      { runs: [t("sécurisées, sans réécriture métier", { sz: 9.5, color: "A9BAD2" })] },
    ],
  });
  const roadmap = [
    "Recréer le schéma Dataverse depuis le mapping déjà documenté",
    "Brancher l'API sur Dataverse et activer l'auditing natif",
    "Piloter la recette avec les directions, puis basculer l'identité",
  ];
  roadmap.forEach((item, i) => {
    const y = 226 + i * 66;
    circle(slide, { x: rightX + 24, y: y + 4, d: 26, fill: { color: C.gold } });
    slide.text({
      x: rightX + 24,
      y: y + 4,
      w: 26,
      h: 26,
      anchor: "ctr",
      paras: [{ align: "ctr", runs: [t(String(i + 1), { sz: 11, b: true, color: C.blue })] }],
    });
    slide.text({
      x: rightX + 62,
      y,
      w: rightW - 88,
      h: 52,
      anchor: "ctr",
      paras: [bodyPara(item, { sz: 10, color: "D5DFEE" })],  
    });
    if (i < roadmap.length - 1) {
      line(slide, { x: rightX + 36.5, y: y + 32, w: 1, h: 38, color: "44598A" });
    }
  });

  slide.shape({
    x: M,
    y: 448,
    w: CW,
    h: 44,
    geom: "roundRect",
    adj: { radius: 10 },
    fill: { color: C.blueTint },
  });
  slide.shape({ x: M, y: 448, w: 4.5, h: 44, geom: "roundRect", adj: { radius: 2 }, fill: { color: C.gold } });
  slide.text({
    x: M + 22,
    y: 448,
    w: 520,
    h: 44,
    anchor: "ctr",
    paras: [
      {
        runs: [
          t("Merci  —  ", { sz: 11, b: true, color: C.blue }),
          t("démo live : Pilotage → Nouvelle alerte → Validation → Approbation → Historique", {
            sz: 10,
            color: C.body,
          }),
        ],
      },
    ],
  });
  const linkRel = slide.rel(REPO, "hyperlink", true);
  slide.text({
    x: M + CW - 300,
    y: 448,
    w: 278,
    h: 44,
    anchor: "ctr",
    paras: [
      {
        align: "r",
        runs: [
          t("Code & documentation  ", { sz: 9.5, color: C.muted }),
          t("github.com/Morlis12/juriscan", { sz: 9.5, b: true, color: C.blue, link: linkRel }),
        ],
      },
    ],
  });

  footer(slide, 6);
  titles.push("05 — Perspectives");
  notes.push([
    "Dernière slide : pourquoi ce prototype n'est pas un prototype jetable.",
    "Le schéma Dataverse est déjà écrit dans le code, avec les listes de choix, les relations et les rôles de sécurité. Le seul point à basculer est l'identité : le sélecteur de direction sera remplacé par Entra ID et les Web Roles.",
    "Concrètement, la suite est cadrée : recréer le schéma, brancher l'API, activer l'auditing natif, puis piloter la recette avec les directions.",
    "Je propose de terminer par la démo : le même parcours que la présentation, sur des données réelles.",
    "Le code et la documentation sont sur le dépôt indiqué en bas de slide — je vous invite à les parcourir.",
  ]);
  slides.push({ slide, transition: transition("reveal") });
}

const files = buildPackage({
  slides: slides.map((entry, i) => ({ ...entry, notes: notes[i] })),
  media: { "logo-agl.png": readFileSync(join(ROOT, "public/logo-agl.png")) },
  title: "AGL JuriCompliance — veille réglementaire assistée par IA",
  author: "AGL — Veille réglementaire",
  dateIso: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  titles,
});

const buffer = writeZip(files);
writeFileSync(OUT, buffer);
process.stdout.write(`${OUT} — ${slides.length} slides, ${(buffer.length / 1024).toFixed(1)} Ko\n`);
