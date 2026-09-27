import { redirect } from "next/navigation";

/**
 * AGL JuriCompliance — Page racine : le pilotage juridique (`/dashboard`) est
 * l'unique page générale (il regroupe tout : filtres BU/date/type, statuts,
 * workflow). La racine redirige donc vers le tableau de bord.
 */
export default function Home() {
  redirect("/dashboard");
}
