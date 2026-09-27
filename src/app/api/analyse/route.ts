import { NextResponse } from "next/server";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";

/**
 * JuriScan AI — OCR multi-actes + recommandation BU (IA via OpenRouter).
 *
 * Modèle : `google/gemini-2.5-flash` appelé en direct sur l'API OpenRouter
 * (`POST https://openrouter.ai/api/v1/chat/completions`, clé
 * `process.env.OPENROUTER_API_KEY`, `response_format: json_object`).
 * (Le provider officiel exige ai v7+, incompatible avec ai v4 du projet —
 * l'appel HTTP direct évite cette dépendance.)
 *
 * Modèle métier : « 1 document déposé » = « N textes extraits » (un Journal
 * Officiel contient des dizaines d'actes juridiquement distincts — jamais
 * fusionnés).
 * - PDF > ~10 pages : découpé en tranches de 5 pages avec chevauchement d'1
 *   page (anti-troncature), une extraction par tranche, puis fusion +
 *   dédoublonnage (clé nature|référence|article).
 * - Chaque objet est validé (zod, tolérant) ; les invalides sont ignorés.
 * - Mapping schéma IA → colonnes existantes (jamais renommées) :
 *   libelleVersion → libelleApplicable, contenuBrut → contenu,
 *   buSuggeree → propositionBU (+ miroir departement),
 *   dateEntreeVigueur JJ/MM/AAAA → YYYY-MM-DD, article "N/A" → "".
 * - `numeroOrdre` attribué par le serveur (`<racine>-01`, `-02`, …), jamais
 *   inventé par l'IA. `pertinenceTransit` Hors périmètre → BU forcées à vide.
 * - Diagnostic : réponse BRUTE loggée par tranche (GEMINI_RAW_*) avant tout
 *   traitement — voir les logs Vercel pour vérifier le nombre d'actes.
 *
 * Répond `{ actes: AlerteAnalyse21[], source, meta }` (pas d'objet plat).
 */

import {
  BU_PROPOSITIONNABLES,
  PERTINENCE_TRANSIT,
  type DepartementCode,
} from "@/domain/veille";

/** Schéma IA (noms du prompt) — un objet par acte détecté, jamais fusionnés. */
const ActeBrutSchema = z
  .object({
    natureTexte: z.string(),
    referenceTexte: z.string(),
    article: z.string(),
    resumeTexte: z.string(),
    libelleVersion: z.string(),
    lienHypertexte: z.string(),
    dateEntreeVigueur: z.string(),
    contenuBrut: z.string(),
    pertinenceTransit: z.string(),
    buSuggeree: z.string(),
  })
  .partial();

type ActeBrut = z.infer<typeof ActeBrutSchema>;

function normaliserBU(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const brut = v.trim();
  if (!brut || /^(n\/a|na|vide|-+|aucune?)$/i.test(brut)) return null;
  const code = brut.toUpperCase().replace(/[\s-]+/g, "_");
  const alias: Record<string, string> = {
    PATRIMO: "PATR_IMMO",
    PATRIMMO: "PATR_IMMO",
    DIRCOMMMARK: "DIR_COMM_MARK",
    DIRCOMM: "DIR_COMM_MARK",
    COMMERCIAL: "DIR_COMM_MARK",
  };
  const canon = alias[code] ?? code;
  return (BU_PROPOSITIONNABLES as readonly string[]).includes(canon) ? canon : null;
}

function normaliserPertinence(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const brut = v.trim();
  return (PERTINENCE_TRANSIT as readonly string[]).includes(brut) ? brut : null;
}

/**
 * Ramène la nature déduite vers la liste fermée (accents/casse insensibles,
 * actes JO en premier — un décret d'application peut citer « la loi »).
 * Le libellé brut est conservé si vraiment inconnu (le juridique tranche).
 */
function normaliserNature(v: unknown): string {
  if (typeof v !== "string") return "";
  const brut = v.trim();
  if (!brut) return "";
  const cle = brut
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const table: [string, string[]][] = [
    ["Avis d'enquête publique / commodo et incommodo", ["enquete publique", "commodo"]],
    ["Certificat foncier individuel", ["certificat foncier individuel"]],
    ["Certificat foncier collectif", ["certificat foncier collectif"]],
    ["Certificat de mutation de propriété foncière", ["mutation de propriete", "mutation fonciere"]],
    ["Récépissé de déclaration d'association", ["recepisse", "declaration d'association"]],
    ["Formulaire de modification RCCM", ["rccm"]],
    ["Décret", ["decret"]],
    ["Arrêté", ["arrete"]],
    ["Ordonnance", ["ordonnance"]],
    ["Circulaire", ["circulaire"]],
    ["Décision", ["decision"]],
    ["Loi", ["loi"]],
    ["Autre", ["autre"]],
  ];
  for (const [canon, mots] of table) {
    if (mots.some((mot) => cle.includes(mot))) return canon;
  }
  return brut;
}

/** JJ/MM/AAAA → YYYY-MM-DD (passe-plat si déjà ISO, vide sinon). */
function normaliserDate(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

/** "N/A" (et variantes) → chaîne vide ; le reste est conservé tel quel. */
function normaliserArticle(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (!t || /^(n\/a|na|-+|non applicable|sans objet)$/i.test(t)) return "";
  return t;
}

const SYSTEME = "Tu es l'expert en OCR et en droit ivoirien d'Africa Global Logistics (AGL CI). CONTEXTE MÉTIER : AGL CI est une entreprise de TRANSIT ET LOGISTIQUE (manutention portuaire, transport de marchandises, douane, entreposage, gestion de son patrimoine immobilier et de ses infrastructures). Sa veille juridique ne porte que sur les textes qui affectent DIRECTEMENT ou INDIRECTEMENT son activité : réglementation du transport, du transit, de la douane, du commerce extérieur ; droit portuaire, maritime, ferroviaire, routier ; foncier et urbanisme UNIQUEMENT s'il concerne un terrain, un lotissement ou une zone où AGL CI ou une société liée est partie prenante (jamais les certificats fonciers de particuliers sans lien identifiable avec l'entreprise) ; droit du travail, fiscalité, environnement (HSE) applicables aux entreprises du secteur ; droit des sociétés/RCCM si l'entité concernée est AGL CI ou une filiale/partenaire connu. Un acte du Journal Officiel qui ne touche à AUCUN de ces domaines (ex : promotion d'un enseignant-chercheur, certificat foncier d'un particulier sans rapport avec l'entreprise, nomination d'un administrateur civil sans lien avec le secteur) N'EST PAS DE LA VEILLE JURIDIQUE PERTINENTE pour AGL CI, même s'il est bien présent dans le JO. RÈGLE FONCIER/CMPF : ne classer 'Directe' ou 'Indirecte' QUE si le nom d'AGL CI, d'une de ses filiales connues, ou d'un lotissement/zone logistique/portuaire apparaît dans l'acte ; par défaut, un certificat foncier concernant un particulier ou une société sans rapport apparent est 'Hors périmètre' — ne jamais assigner Patr Immo par réflexe sur tout ce qui touche au foncier. FIDÉLITÉ ABSOLUE : tu copies mot à mot les références officielles, les numéros d'articles et le contenu brut — tu ne tronques jamais, tu ne reformules jamais ces champs. MULTI-ACTES : le document peut contenir PLUSIEURS actes juridiquement distincts (un Journal Officiel = des dizaines d'actes) : tu dois systématiquement DÉDUIRE la nature de CHAQUE acte et recommander une BU par acte — sauf texte 'Hors périmètre', pour lequel tu ne suggères AUCUNE BU.";

const TACHE = "TÂCHE : Analyse le document joint et extrais TOUS ses actes sous forme de TABLEAU JSON (un objet par acte détecté — schéma ci-dessous). CONSIGNE : ne fusionne JAMAIS deux actes distincts (deux arrêtés consécutifs, deux certificats fonciers consécutifs = deux objets séparés). Si le document contient 49 actes, le tableau doit contenir 49 objets. Schéma d'un acte : { \"natureTexte\": \"Décret | Arrêté | Avis d'enquête publique / commodo et incommodo | Certificat foncier individuel | Certificat foncier collectif | Certificat de mutation de propriété foncière | Récépissé de déclaration d'association | Formulaire de modification RCCM | Autre — nature de CET acte uniquement\", \"referenceTexte\": \"Référence officielle COMPLÈTE de CET acte — copie exacte sans tronquer\", \"article\": \"Articles concernés de CET acte copiés tels quels, ou N/A\", \"resumeTexte\": \"2-3 phrases sur CET acte uniquement\", \"libelleVersion\": \"Libellé complet de la version en vigueur\", \"lienHypertexte\": \"\", \"dateEntreeVigueur\": \"JJ/MM/AAAA ou chaîne vide\", \"contenuBrut\": \"Transcription brute complète de CET acte : COPIE EXACTE mot à mot — jamais tronquée, jamais inventée\", \"pertinenceTransit\": \"Directe | Indirecte | Hors périmètre\", \"buSuggeree\": \"DJ | DAF | DRH | Patr Immo | DQHSE | DIR_COMM_MARK | DILS — vide si Hors périmètre\" } Règle d'or : information absente = chaîne vide — n'invente JAMAIS.";

interface Tranche {
  donnees: string;
  etiquette: string;
  /** Type MIME du morceau (application/pdf ou image/*). */
  mime: string;
}

/** Découpe un PDF en tranches de 5 pages avec chevauchement d'1 page (> 10 pages). */
async function decouperPdf(base64Data: string): Promise<Tranche[]> {
  const pdf = await PDFDocument.load(Buffer.from(base64Data, "base64"), {
    ignoreEncryption: true,
  });
  const n = pdf.getPageCount();
  if (n <= 10) return [{ donnees: base64Data, etiquette: "intégral", mime: "application/pdf" }];
  const tranches: Tranche[] = [];
  const TAILLE = 5;
  const PAS = TAILLE - 1;
  for (let debut = 0; debut < n; debut += PAS) {
    const fin = Math.min(debut + TAILLE, n);
    const morceau = await PDFDocument.create();
    const indices: number[] = [];
    for (let p = debut; p < fin; p += 1) indices.push(p);
    const pages = await morceau.copyPages(pdf, indices);
    pages.forEach((page) => morceau.addPage(page));
    const octets = await morceau.save();
    tranches.push({
      donnees: Buffer.from(octets).toString("base64"),
      etiquette: `pages ${debut + 1}-${fin}/${n}`,
      mime: "application/pdf",
    });
    if (fin >= n) break;
  }
  return tranches;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { base64Data, mimeType } = body;

    if (!base64Data) {
      return NextResponse.json({ error: "Aucune donnée de fichier reçue" }, { status: 400 });
    }

    // Clé OpenRouter configurée sur Vercel (variable OPENROUTER_API_KEY).
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Configuration : Clé API OpenRouter manquante sur le serveur (OPENROUTER_API_KEY)." },
        { status: 500 },
      );
    }

    // Découpage anti-troncature (PDF longs : JO) — images : appel unique.
    const tranches: Tranche[] =
      mimeType === "application/pdf"
        ? await decouperPdf(base64Data)
        : [
            {
              donnees: base64Data,
              etiquette: "intégral",
              mime: mimeType || "image/png",
            },
          ];

    // Extraction par tranche (un appel OpenRouter `google/gemini-2.5-flash` chacun).
    const bruts: ActeBrut[] = [];
    for (const tranche of tranches) {
      bruts.push(...(await extraireTranche(apiKey, tranche, TACHE, tranches.length)));
    }

/** Un appel d'extraction OpenRouter sur une tranche (tableau d'actes validés). */
async function extraireTranche(
  apiKey: string,
  tranche: Tranche,
  tache: string,
  tranchesTotal: number,
): Promise<ActeBrut[]> {
  // Pièce jointe : PDF en partie `file` (base64), image en `image_url` (data URL).
  const piece =
    tranche.mime === "application/pdf"
      ? {
          type: "file",
          file: {
            filename: "document.pdf",
            file_data: `data:application/pdf;base64,${tranche.donnees}`,
          },
        }
      : {
          type: "image_url",
          image_url: { url: `data:${tranche.mime};base64,${tranche.donnees}` },
        };
  const reponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://juriscan.app",
      "X-Title": "JuriScan AI",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.1,
      max_tokens: 16000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEME },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                tranchesTotal > 1
                  ? `${tache} CONTEXTE DE TRANCHE : ceci est la tranche « ${tranche.etiquette} » d'un document plus long — extrais UNIQUEMENT les actes visibles dans CETTE tranche, sans deviner la suite ni répéter les autres tranches.`
                  : tache,
            },
            piece,
          ],
        },
      ],
    }),
  });
  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => "");
    throw new Error(`OpenRouter ${reponse.status} : ${detail.slice(0, 500)}`);
  }
  const payload = (await reponse.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const contenu = payload?.choices?.[0]?.message?.content;
  if (typeof contenu !== "string" || !contenu.trim()) {
    throw new Error("Réponse vide du modèle.");
  }
  // DIAGNOSTIC : réponse BRUTE avant tout traitement (voir logs Vercel).
  console.log(`GEMINI_RAW tranche=${tranche.etiquette} caracteres=${contenu.length}`);
  console.log(`GEMINI_RAW_START ${tranche.etiquette}\n${contenu}\nGEMINI_RAW_END`);
  let nettoye = contenu.trim();
  if (nettoye.startsWith("```")) {
    nettoye = nettoye.replace(/```json|```/g, "").trim();
  }
  const parse: unknown = JSON.parse(nettoye);
  const tableau = Array.isArray(parse) ? parse : [];
  // Valide chaque objet (tolérant : champs manquants = "") ; ignore les invalides.
  const valides: ActeBrut[] = [];
  for (const o of tableau) {
    const r = ActeBrutSchema.safeParse(o);
    if (r.success) valides.push(r.data);
  }
  console.log(
    `GEMINI_RAW_PARSE tranche=${tranche.etiquette} objets=${tableau.length} valides=${valides.length}`,
  );
  return valides;
}

    // Fusion + dédoublonnage (chevauchement d'1 page) sur nature|référence|article.
    const vus = new Set<string>();
    const retenus: ActeBrut[] = [];
    for (const a of bruts) {
      const cle = [a.natureTexte, a.referenceTexte, a.article, a.resumeTexte]
        .map((v) => (typeof v === "string" ? v : "").toLowerCase().replace(/\s+/g, " ").trim())
        .join("|");
      if (cle.replace(/\|/g, "") === "") continue;
      if (vus.has(cle)) continue;
      vus.add(cle);
      retenus.push(a);
    }

    // Normalisation vers les colonnes existantes + N° d'ordre serveur (-01, -02…).
    const annee = new Date().getFullYear();
    const racine = `AGL-${annee}-${Date.now().toString(36).toUpperCase()}`;
    const actes = retenus.map((a, i) => {
      const pertinence = normaliserPertinence(a.pertinenceTransit);
      const horsPerimetre = pertinence === "Hors périmètre";
      const propositionBU = horsPerimetre ? null : normaliserBU(a.buSuggeree);
      const bu = propositionBU as DepartementCode | null;
      return {
        numeroOrdre: `${racine}-${String(i + 1).padStart(2, "0")}`,
        qssfte: "",
        natureTexte: normaliserNature(a.natureTexte),
        referenceTexte: typeof a.referenceTexte === "string" ? a.referenceTexte.trim() : "",
        article: normaliserArticle(a.article),
        resumeTexte: typeof a.resumeTexte === "string" ? a.resumeTexte.trim() : "",
        libelleApplicable: typeof a.libelleVersion === "string" ? a.libelleVersion.trim() : "",
        lienHypertexte: "",
        dateEntreeVigueur: normaliserDate(a.dateEntreeVigueur),
        contenu: typeof a.contenuBrut === "string" ? a.contenuBrut.trim() : "",
        moyenCommunication: "",
        applicableAGLCI: !horsPerimetre,
        propositionBU: bu,
        pertinenceTransit: pertinence,
        departementResponsable: bu ?? "DJ",
        departementsResponsables: bu ? [bu] : [],
        actionsExistantes: "",
        preuvesExistantes: "",
        statutConformite: "NON_CONFORME_0",
        preuveDifferee: "",
        libelleAction: "",
        responsable: "",
        delai: "",
        tauxAvancement: 0,
      };
    });

    console.log(
      `GEMINI_RESULT tranches=${tranches.length} bruts=${bruts.length} retenus=${actes.length}`,
    );
    return NextResponse.json({
      success: true,
      data: { actes },
      source: "gemini",
      meta: {
        tranches: tranches.length,
        actesBruts: bruts.length,
        actesRetenus: actes.length,
      },
    });
  } catch (error: unknown) {
    console.error("Erreur critique OCR OpenRouter :", error);
    const message = error instanceof Error ? error.message : "Erreur interne de traitement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
