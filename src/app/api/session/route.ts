import { NextResponse } from "next/server";
import { lireAuteur } from "@/lib/acces";
import { chargerComptes } from "@/lib/comptes";

/**
 * AGL JuriCompliance — État de la session (« qui suis-je ? »).
 *
 * Appelée par l'interface au chargement : renvoie l'identité déduite du cookie
 * de session signé. Le client ne choisit plus sa BU, il la reçoit.
 * Renvoie aussi la configuration des comptes pour que l'écran de connexion
 * puisse expliquer quoi faire quand aucun compte n'existe.
 */

export async function GET(req: Request) {
  const auteur = await lireAuteur(req);
  const { source, comptes } = await chargerComptes();
  if (!auteur.session) {
    return NextResponse.json({
      success: true,
      data: {
        connecte: false,
        source,
        // Aucun détail nominatif n'est exposé tant qu'on n'est pas connecté.
        nbComptes: comptes.length,
      },
    });
  }
  return NextResponse.json({
    success: true,
    data: {
      connecte: true,
      source,
      email: auteur.email,
      nom: auteur.nom,
      bu: auteur.bu,
      typeCompte: auteur.typeCompte,
      provisoire: auteur.session.provisoire,
    },
  });
}
