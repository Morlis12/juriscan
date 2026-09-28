import { NextResponse } from "next/server";
import { chargerComptes, connecter } from "@/lib/comptes";
import { creerCookieSession, COOKIE_SESSION, optionsCookie } from "@/lib/session";

/**
 * AGL JuriCompliance — Connexion / déconnexion.
 *
 * - `POST` : `{ email, motDePasse }` → vérifie le couple → pose le cookie de
 *   session signé (httpOnly). Réponses volontairement neutres (« identifiants
 *   invalides ») pour ne pas révéler quels comptes existent. Limitation de
 *   débit en mémoire : 10 tentatives par adresse et par quart d'heure.
 * - `DELETE` : efface le cookie (déconnexion).
 *
 * C'est la seule porte d'entrée : sans cookie signé, toutes les routes métier
 * répondent 401. Le mot de passe n'est jamais renvoyé ni journalisé.
 */

const FENETRE_MS = 15 * 60 * 1000;
const MAX_TENTATIVES = 10;
const tentatives = new Map<string, { n: number; depuis: number }>();

function tropDeTentatives(cle: string): boolean {
  const maintenant = Date.now();
  const entree = tentatives.get(cle);
  if (!entree || maintenant - entree.depuis > FENETRE_MS) {
    tentatives.set(cle, { n: 1, depuis: maintenant });
    return false;
  }
  entree.n += 1;
  return entree.n > MAX_TENTATIVES;
}

export async function POST(req: Request) {
  let corps: { email?: unknown; motDePasse?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const email = typeof corps.email === "string" ? corps.email.trim() : "";
  const motDePasse = typeof corps.motDePasse === "string" ? corps.motDePasse : "";
  if (!email || !motDePasse) {
    return NextResponse.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
  }
  if (tropDeTentatives(email.toLowerCase())) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429 },
    );
  }
  const resultat = await connecter(email, motDePasse);
  if (!resultat.ok) {
    if (resultat.motif === "AUCUN_COMPTE") {
      // L'aide dépend de l'environnement : en local on a un fichier, en ligne
      // (Vercel) il n'y a ni base ni fichier persistant → variable d'env.
      return NextResponse.json(
        {
          error:
            process.env.NODE_ENV === "production"
              ? "Aucun accès configuré sur ce serveur. L'administrateur doit définir la variable d'environnement JURISCAN_COMPTES (voir docs/deploiement-vercel.md), puis redéployer."
              : "Aucun accès configuré sur ce serveur. Lancez « npm run acces:init » puis réessayez.",
          source: (await chargerComptes()).source,
        },
        { status: 503 },
      );
    }
    if (resultat.motif === "COMPTE_INACTIF") {
      return NextResponse.json(
        { error: "Ce compte est désactivé. Contactez l'administrateur." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Identifiants invalides." }, { status: 401 });
  }
  const compte = resultat.compte!;
  const cookie = await creerCookieSession(compte);
  tentatives.delete(email.toLowerCase());
  return NextResponse.json(
    {
      success: true,
      data: {
        email: compte.email,
        nom: compte.nom,
        bu: compte.bu,
        type: compte.type,
        provisoire: compte.provisoire,
      },
    },
    { headers: { "Set-Cookie": `${COOKIE_SESSION}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}` } },
  );
}

export async function DELETE() {
  const opts = optionsCookie(0);
  return NextResponse.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": `${COOKIE_SESSION}=; Path=/; Max-Age=0${opts.httpOnly ? "; HttpOnly" : ""}; SameSite=Lax${opts.secure ? "; Secure" : ""}`,
      },
    },
  );
}
