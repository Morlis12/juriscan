import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { lireSession } from "@/lib/session";
import { COOKIE_SESSION } from "@/lib/session";

/**
 * AGL JuriCompliance — Garde d'accès des écrans métier.
 *
 * Tout `/dashboard/**` exige une session serveur valide : sans cookie signé, on
 * renvoie vers l'écran de connexion. C'est la barrière qui remplace l'ancien
 * sélecteur de BU (purement décoratif côté navigateur).
 *
 * La lecture du cookie est faite par `lireSession`, qui en vérifie la signature
 * et l'expiration : un cookie forgé ou expiré est traité comme absent.
 */

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const brut = store.get(COOKIE_SESSION)?.value ?? "";
  const req = new Request("http://interne/dashboard", {
    headers: { cookie: brut ? `${COOKIE_SESSION}=${brut}` : "" },
  });
  const session = await lireSession(req);
  if (!session) redirect("/connexion");
  return <>{children}</>;
}
