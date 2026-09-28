import { NextResponse } from "next/server";
import { hacherMotDePasse, verifierMotDePasse } from "@/lib/mots-de-passe";
import { chargerComptes, mettreAJourMotDePasse, type Compte } from "@/lib/comptes";
import { creerCookieSession, optionsCookie, COOKIE_SESSION } from "@/lib/session";
import { lireAuteur } from "@/lib/acces";

/**
 * AGL JuriCompliance — Changement de mot de passe par l'utilisateur.
 *
 * - `POST` `{ ancien, nouveau }` : on exige le mot de passe **actuel** (ce n'est
 *   pas un simple formulaire de nouveau mot de passe : sans l'ancien, un accès
 *   volé permettrait de verrouiller le titulaire hors de son poste). Puis on
 *   réécrit le condensat dans la source des identifiants et on repose une session
 *   marquée « définitive » (le drapeau `provisoire` tombe).
 * - `GET` : état du compte connecté (utile aux vérifications avant déploiement).
 *
 * Règles minimales : 12 caractères, différent de l'ancien, et pas un mot de
 * passe trivial. Limitation de débit comme à la connexion.
 */

const FENETRE_MS = 15 * 60 * 1000;
const MAX_TENTATIVES = 5;
const tentatives = new Map<string, { n: number; depuis: number }>();

/** Contrôles de solidité (message volontairement actionnable). */
function verifierRobustesse(nouveau: string, ancien: string): string | null {
  if (nouveau.length < 12) return "Le mot de passe doit contenir au moins 12 caractères.";
  if (nouveau === ancien) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (/^(motdepasse|password|azerty|qwerty|1234|admin|agl)/i.test(nouveau)) {
    return "Mot de passe trop prévisible : évitez les mots courants et les suites de chiffres.";
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(nouveau)).length;
  if (classes < 3) {
    return "Mélangez au moins trois types : minuscule, majuscule, chiffre, caractère spécial.";
  }
  return null;
}

export async function GET(req: Request) {
  const auteur = await lireAuteur(req);
  if (!auteur.session || !auteur.bu) {
    return NextResponse.json({ error: "Session expirée ou absente." }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    data: {
      email: auteur.email,
      nom: auteur.nom,
      bu: auteur.bu,
      typeCompte: auteur.typeCompte,
      provisoire: auteur.session.provisoire,
    },
  });
}

export async function POST(req: Request) {
  const auteur = await lireAuteur(req);
  if (!auteur.session || !auteur.email) {
    return NextResponse.json({ error: "Session expirée ou absente." }, { status: 401 });
  }
  let corps: { ancien?: unknown; nouveau?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const ancien = typeof corps.ancien === "string" ? corps.ancien : "";
  const nouveau = typeof corps.nouveau === "string" ? corps.nouveau : "";
  if (!ancien || !nouveau) {
    return NextResponse.json({ error: "Ancien et nouveau mot de passe requis." }, { status: 400 });
  }

  const cle = auteur.email.toLowerCase();
  const maintenant = Date.now();
  const entree = tentatives.get(cle);
  if (!entree || maintenant - entree.depuis > FENETRE_MS) {
    tentatives.set(cle, { n: 1, depuis: maintenant });
  } else if (++entree.n > MAX_TENTATIVES) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429 },
    );
  }

  const { comptes } = await chargerComptes();
  const compte: Compte | undefined = comptes.find((c) => c.email === cle);
  if (!compte || !verifierMotDePasse(ancien, compte.motDePasseHash)) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 401 });
  }

  const faiblesse = verifierRobustesse(nouveau, ancien);
  if (faiblesse) {
    return NextResponse.json({ error: faiblesse }, { status: 400 });
  }

  const ecriture = await mettreAJourMotDePasse(cle, hacherMotDePasse(nouveau));
  if (!ecriture.ok) {
    if (ecriture.motif === "ENVIRONNEMENT") {
      return NextResponse.json(
        {
          error:
            "Les accès de ce déploiement sont définis par variable d'environnement : ils ne peuvent pas être modifiés depuis l'application. Demandez une réinitialisation à l'administrateur IT.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Écriture impossible — contactez l'administrateur." },
      { status: 500 },
    );
  }

  // Nouveau cookie : la session n'est plus marquée « provisoire ».
  const cookie = await creerCookieSession({ ...compte, provisoire: false });
  const opts = optionsCookie();
  tentatives.delete(cle);
  return NextResponse.json(
    { success: true, data: { message: "Mot de passe mis à jour." } },
    {
      headers: {
        "Set-Cookie": `${COOKIE_SESSION}=${encodeURIComponent(cookie)}; Path=/; Max-Age=${
          opts.maxAge
        }${opts.httpOnly ? "; HttpOnly" : ""}; SameSite=Lax${opts.secure ? "; Secure" : ""}`,
      },
    },
  );
}
