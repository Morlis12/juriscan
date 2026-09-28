import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionOuverte } from "@/lib/acces";
import { PDFDocument } from "pdf-lib";

/**
 * AGL JuriCompliance — OCR multi-actes + recommandation BU (IA via OpenRouter).
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
 * - Contexte métier AGL CI + FILTRE STRICT DE RAPIDITÉ : pages sans rapport
 *   avec transit/douane/port/AGL ignorées immédiatement (tableau vide admis).
 * - Champs toujours renseignés : article, libelleVersion, dateEntreeVigueur,
 *   lienHypertexte (URL exacte lue, jamais inventée) valent « N/A » si rien.
 * - PDF > ~10 pages : tranches de 5 pages (+1 chevauchement) traitées en
 *   PARALLÈLE (×3), puis fusion + dédoublonnage (clé nature|référence|article).
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

/** Vide (ou marqueur d'absence) → "N/A" : champs que l'IA doit toujours renseigner. */
function normaliserNA(v: unknown): string {
  if (typeof v !== "string") return "N/A";
  const t = v.trim();
  if (!t || /^(-+|non applicable|sans objet)$/i.test(t)) return "N/A";
  return t;
}

/**
 * Répare un JSON mal échappé (cas réel : antislash isolés `\2`, `\C…` et
 * sauts de ligne bruts dans les transcriptions). Balayage en respectant les
 * chaînes : antislash invalide → doublé, caractère de contrôle brut → échappé.
 * Extrait aussi le tableau si du texte l'entoure (premier `[` … dernier `]`).
 */
function reparerJson(texte: string): string {
  const debut = texte.indexOf("[");
  const fin = texte.lastIndexOf("]");
  const s = debut >= 0 && fin > debut ? texte.slice(debut, fin + 1) : texte;
  let out = "";
  let dansChaine = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (dansChaine) {
      if (c === "\\") {
        const suivant = s[i + 1];
        if (suivant === undefined) {
          out += "\\\\";
          break;
        }
        if ('"\\/bfnrt'.includes(suivant)) {
          out += c + suivant;
          i += 1;
        } else if (
          suivant === "u" &&
          /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))
        ) {
          out += s.slice(i, i + 6);
          i += 5;
        } else {
          // Antislash invalide (\C, \2…) : on le neutralise en le doublant,
          // sinon JSON.parse rejette toute la réponse (« Bad escaped character »).
          out += `\\\\${suivant}`;
          i += 1;
        }
      } else if (c === '"') {
        dansChaine = false;
        out += c;
      } else {
        const code = c.charCodeAt(0);
        if (code < 0x20) {
          if (c === "\n") out += "\\n";
          else if (c === "\r") out += "\\r";
          else if (c === "\t") out += "\\t";
          else out += " ";
        } else {
          out += c;
        }
      }
    } else {
      if (c === '"') dansChaine = true;
      out += c;
    }
  }
  return out;
}

/** Découpe les objets de premier niveau d'un tableau (respect des chaînes). */
function decouperObjets(tableau: string): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let dansChaine = false;
  let echappe = false;
  let debut = -1;
  for (let i = 0; i < tableau.length; i += 1) {
    const c = tableau[i];
    if (dansChaine) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dansChaine = false;
    } else if (c === '"') {
      dansChaine = true;
    } else if (c === "{") {
      if (profondeur === 0) debut = i;
      profondeur += 1;
    } else if (c === "}") {
      profondeur -= 1;
      if (profondeur === 0 && debut >= 0) {
        morceaux.push(tableau.slice(debut, i + 1));
        debut = -1;
      }
    }
  }
  return morceaux;
}

/**
 * Parse robuste en 3 temps : direct → réparé → sauvetage objet par objet.
 * Ne lève jamais : retourne les objets exploitables + compteurs.
 */
function parserTableauRobuste(texte: string): {
  morceaux: unknown[];
  tentes: number;
} {
  try {
    const direct: unknown = JSON.parse(texte);
    const arr = Array.isArray(direct) ? direct : [];
    return { morceaux: arr, tentes: arr.length };
  } catch {
    /* passe à la réparation */
  }
  try {
    const repare: unknown = JSON.parse(reparerJson(texte));
    const arr = Array.isArray(repare) ? repare : [];
    return { morceaux: arr, tentes: arr.length };
  } catch {
    /* passe au sauvetage */
  }
  const gardes: unknown[] = [];
  const pieces = decouperObjets(reparerJson(texte));
  for (const piece of pieces) {
    try {
      gardes.push(JSON.parse(piece));
    } catch {
      /* objet irrécupérable : ignoré et compté */
    }
  }
  return { morceaux: gardes, tentes: pieces.length };
}

const SYSTEME = "Tu es l'expert en OCR et en droit ivoirien d'Africa Global Logistics (AGL CI). CONTEXTE MÉTIER : AGL CI est une entreprise de TRANSIT ET LOGISTIQUE (manutention portuaire, transport de marchandises, douane, entreposage, gestion de son patrimoine immobilier et de ses infrastructures). Sa veille juridique ne porte que sur les textes qui affectent DIRECTEMENT ou INDIRECTEMENT son activité : réglementation du transport, du transit, de la douane, du commerce extérieur ; droit portuaire, maritime, ferroviaire, routier ; foncier et urbanisme UNIQUEMENT s'il concerne un terrain, un lotissement ou une zone où AGL CI ou une société liée est partie prenante (jamais les certificats fonciers de particuliers sans lien identifiable avec l'entreprise) ; droit du travail, fiscalité, environnement (HSE) applicables aux entreprises du secteur ; droit des sociétés/RCCM si l'entité concernée est AGL CI ou une filiale/partenaire connu. Un acte du Journal Officiel qui ne touche à AUCUN de ces domaines (ex : promotion d'un enseignant-chercheur, certificat foncier d'un particulier sans rapport avec l'entreprise, nomination d'un administrateur civil sans lien avec le secteur) N'EST PAS DE LA VEILLE JURIDIQUE PERTINENTE pour AGL CI, même s'il est bien présent dans le JO. RÈGLE FONCIER/CMPF : ne classer 'Directe' ou 'Indirecte' QUE si le nom d'AGL CI, d'une de ses filiales connues, ou d'un lotissement/zone logistique/portuaire apparaît dans l'acte ; par défaut, un certificat foncier concernant un particulier ou une société sans rapport apparent est 'Hors périmètre' — ne jamais assigner Patr Immo par réflexe sur tout ce qui touche au foncier. FIDÉLITÉ ABSOLUE : tu copies mot à mot les références officielles, les numéros d'articles et le contenu brut — tu ne tronques jamais, tu ne reformules jamais ces champs. MULTI-ACTES : le document peut contenir PLUSIEURS actes juridiquement distincts (un Journal Officiel = des dizaines d'actes) : tu dois systématiquement DÉDUIRE la nature de CHAQUE acte et recommander une BU par acte — sauf texte 'Hors périmètre', pour lequel tu ne suggères AUCUNE BU. FILTRE STRICT DE RAPIDITÉ : ignore immédiatement toute page ou section sans rapport avec le transit, la douane, les infrastructures portuaires/maritimes, ou AGL directement ou indirectement — si rien de pertinent sur une page, passe à la suivante sans la transcrire ; si toute la tranche est hors sujet, renvoie un tableau vide []. Ne transcris jamais les pages non pertinentes : l'analyse doit être rapide et ciblée.";

const TACHE = "TÂCHE : Analyse le document joint et extrais TOUS ses actes sous forme de TABLEAU JSON (un objet par acte détecté — schéma ci-dessous). CONSIGNE : ne fusionne JAMAIS deux actes distincts (deux arrêtés consécutifs, deux certificats fonciers consécutifs = deux objets séparés). Si le document contient 49 actes, le tableau doit contenir 49 objets. JSON STRICT : dans les chaînes, n'utilise que des échappements JSON valides — aucun saut de ligne brut ni antislash isolé, sinon la réponse est rejetée. CHAMPS TOUJOURS RENSEIGNÉS : article, libelleVersion, dateEntreeVigueur et lienHypertexte ne sont JAMAIS vides — si rien n'est trouvé, écris exactement « N/A » (lienHypertexte = URL exacte lue dans le document, jamais inventée). Schéma d'un acte : { \"natureTexte\": \"Décret | Arrêté | Avis d'enquête publique / commodo et incommodo | Certificat foncier individuel | Certificat foncier collectif | Certificat de mutation de propriété foncière | Récépissé de déclaration d'association | Formulaire de modification RCCM | Autre — nature de CET acte uniquement\", \"referenceTexte\": \"Référence officielle COMPLÈTE de CET acte — copie exacte sans tronquer\", \"article\": \"Articles concernés de CET acte copiés tels quels, ou N/A\", \"resumeTexte\": \"2-3 phrases sur CET acte uniquement\", \"libelleVersion\": \"Libellé complet de la version en vigueur\", \"lienHypertexte\": \"\", \"dateEntreeVigueur\": \"JJ/MM/AAAA ou chaîne vide\", \"contenuBrut\": \"Transcription brute complète de CET acte : COPIE EXACTE mot à mot — jamais tronquée, jamais inventée\", \"pertinenceTransit\": \"Directe | Indirecte | Hors périmètre\", \"buSuggeree\": \"DJ | DAF | DRH | Patr Immo | DQHSE | DIR_COMM_MARK | DILS — vide si Hors périmètre\" } Règle d'or : information absente = chaîne vide — n'invente JAMAIS.";

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
  if (!(await sessionOuverte(req))) {
    return NextResponse.json(
      { error: "Session expirée ou absente : reconnectez-vous." },
      { status: 401 },
    );
  }
  try {
    const body = await req.json();
    const { base64Data, mimeType } = body;

    if (!base64Data) {
      return NextResponse.json({ error: "Aucune donnée de fichier reçue" }, { status: 400 });
    }

    // Clé OpenRouter configurée sur Vercel (variable OPENROUTER_API_KEY).
    const apiKey: string = process.env.OPENROUTER_API_KEY ?? "";
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

    // Extraction par tranches en PARALLÈLE (×3 — divise le temps total) :
    // un appel OpenRouter `google/gemini-2.5-flash` par tranche, ordre préservé.
    // Une tranche en échec n'annule plus tout le lot (partiel + message).
    const CONCURRENCE = 3;
    const resultats: { actes: ActeBrut[]; ignores: number }[] = tranches.map(
      () => ({ actes: [], ignores: 0 }),
    );
    let tranchesEchouees = 0;
    let curseur = 0;
    async function traiterTranche(): Promise<void> {
      while (curseur < tranches.length) {
        const i = curseur;
        curseur += 1;
        const tranche = tranches[i];
        if (!tranche) continue;
        try {
          resultats[i] = await extraireTranche(apiKey, tranche, TACHE, tranches.length);
        } catch (e) {
          tranchesEchouees += 1;
          console.error(
            `GEMINI_TRANCHE_ERREUR ${tranche.etiquette} :`,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCE, tranches.length) }, () =>
        traiterTranche(),
      ),
    );
    const bruts: ActeBrut[] = [];
    let objetsIgnores = 0;
    for (const r of resultats) {
      bruts.push(...r.actes);
      objetsIgnores += r.ignores;
    }
    if (bruts.length === 0) {
      throw new Error(
        tranchesEchouees > 0
          ? `Aucun acte exploitable (${tranchesEchouees} tranche(s) en échec — voir logs GEMINI_TRANCHE_ERREUR).`
          : "Aucun acte exploitable dans la réponse du modèle.",
      );
    }

/** Appel HTTP OpenRouter avec 1 retry sur 429/5xx (2 s d'attente). */
async function appelerOpenRouter(
  apiKey: string,
  tranche: Tranche,
  tache: string,
  tranchesTotal: number,
): Promise<Response> {
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
  const corps = JSON.stringify({
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
  });
  let reponse: Response | null = null;
  for (let essai = 1; essai <= 2; essai += 1) {
    reponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://agl-juricompliance.app",
        "X-Title": "AGL JuriCompliance",
      },
      body: corps,
    });
    if (reponse.ok) return reponse;
    const rejouable = reponse.status === 429 || reponse.status >= 500;
    if (!rejouable || essai === 2) return reponse;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  // Inatteignable (2 essais) — garde-fou de typage.
  if (!reponse) throw new Error("Échec OpenRouter.");
  return reponse;
}

/** Un appel d'extraction OpenRouter sur une tranche (actes validés + compteurs). */
async function extraireTranche(
  apiKey: string,
  tranche: Tranche,
  tache: string,
  tranchesTotal: number,
): Promise<{ actes: ActeBrut[]; recus: number; ignores: number }> {
  const reponse = await appelerOpenRouter(apiKey, tranche, tache, tranchesTotal);
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
  // Parse robuste : direct → réparé (antislash, contrôles) → sauvetage
  // objet par objet. Plus de crash global sur un échappement invalide.
  const { morceaux, tentes } = parserTableauRobuste(nettoye);
  const tableau = morceaux;
  // Valide chaque objet (tolérant : champs manquants = "") ; ignore les invalides.
  const valides: ActeBrut[] = [];
  for (const o of tableau) {
    const r = ActeBrutSchema.safeParse(o);
    if (r.success) valides.push(r.data);
  }
  console.log(
    `GEMINI_RAW_PARSE tranche=${tranche.etiquette} objets=${tentes} valides=${valides.length}`,
  );
  return { actes: valides, recus: tentes, ignores: tentes - valides.length };
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
        article: normaliserNA(a.article),
        resumeTexte: typeof a.resumeTexte === "string" ? a.resumeTexte.trim() : "",
        libelleApplicable: normaliserNA(a.libelleVersion),
        lienHypertexte: normaliserNA(a.lienHypertexte),
        dateEntreeVigueur: normaliserNA(normaliserDate(a.dateEntreeVigueur)),
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
      `GEMINI_RESULT tranches=${tranches.length} echecs=${tranchesEchouees} bruts=${bruts.length} retenus=${actes.length} ignores=${objetsIgnores}`,
    );
    const avertissement =
      tranchesEchouees > 0 || objetsIgnores > 0
        ? `Analyse partielle : ${tranchesEchouees} tranche(s) et ${objetsIgnores} objet(s) inexploitables — les ${actes.length} actes valides sont affichés.`
        : null;
    return NextResponse.json({
      success: true,
      data: { actes },
      ...(avertissement ? { avertissement } : {}),
      source: "gemini",
      meta: {
        tranches: tranches.length,
        tranchesEchouees,
        actesBruts: bruts.length,
        actesRetenus: actes.length,
        objetsIgnores,
      },
    });
  } catch (error: unknown) {
    console.error("Erreur critique OCR OpenRouter :", error);
    const message = error instanceof Error ? error.message : "Erreur interne de traitement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
