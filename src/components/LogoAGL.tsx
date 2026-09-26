import Image from "next/image";

/**
 * JuriScan AI — Logo officiel AGL (`public/logo-agl.png`).
 *
 * Emblème unique des en-têtes (remplace les badges « AGL » dessinés).
 * Migration Power Pages / Dataverse : téléverser le même PNG comme
 * « Site Logo » du portail (Content Snippet `Site Logo Url`) pour garder
 * l'identité visuelle à l'identique côté Microsoft.
 */
export function LogoAGL() {
  return (
    <Image
      src="/logo-agl.png"
      alt="AGL — Africa Global Logistics"
      width={96}
      height={40}
      className="h-10 w-auto rounded-md object-contain"
      priority
    />
  );
}
