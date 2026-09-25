"use client";

import { useRef, useState } from "react";

/** Document de preuve joint aux preuves de conformité existantes. */
export interface PreuveFichierValeur {
  nom: string;
  mime: string;
  /** Base64 pur (sans préfixe `data:`). */
  donnees: string;
}

const ACCEPT_PREUVE =
  ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

/** 8 Mo maximum (base64 ≈ +33 % en base, limite serveur ~11 Mo de caractères). */
const TAILLE_MAX = 8 * 1024 * 1024;

/** Construit l'URL de téléchargement d'un document stocké en base64. */
export function urlPreuve(mime: string, donnees: string): string {
  return `data:${mime || "application/octet-stream"};base64,${donnees}`;
}

function fichierVersBase64Pur(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const url = typeof lecteur.result === "string" ? lecteur.result : "";
      const pur = url.includes(",") ? url.split(",")[1] : "";
      if (!pur) reject(new Error("Impossible de lire le document."));
      else resolve(pur);
    };
    lecteur.onerror = () => reject(new Error("Impossible de lire le document."));
    lecteur.readAsDataURL(f);
  });
}

/**
 * Sélecteur de document de preuve (PDF, PNG, JPG, WEBP — 8 Mo max).
 * `valeur` pré-remplie = document déjà enregistré ; `null` = aucun.
 */
export function PreuveFichierInput({
  valeur,
  onChange,
}: {
  valeur: PreuveFichierValeur | null;
  onChange: (v: PreuveFichierValeur | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lecture, setLecture] = useState(false);

  async function prendreFichier(f: File | undefined) {
    setErreur(null);
    if (!f) return;
    const ok =
      f.type === "application/pdf" ||
      f.type.startsWith("image/") ||
      /\.(pdf|png|jpe?g|webp)$/i.test(f.name);
    if (!ok) {
      setErreur("Format non pris en charge : PDF, PNG, JPG ou WEBP.");
      return;
    }
    if (f.size > TAILLE_MAX) {
      setErreur("Document trop volumineux (8 Mo maximum).");
      return;
    }
    setLecture(true);
    try {
      const donnees = await fichierVersBase64Pur(f);
      onChange({
        nom: f.name.slice(0, 255),
        mime: f.type || "application/octet-stream",
        donnees,
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible.");
    } finally {
      setLecture(false);
    }
  }

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_PREUVE}
        className="hidden"
        onChange={(e) => {
          prendreFichier(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {valeur ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <a
            href={urlPreuve(valeur.mime, valeur.donnees)}
            download={valeur.nom}
            title="Télécharger le document de preuve"
            className="min-w-0 truncate font-semibold text-brand-blue underline decoration-brand-gold decoration-2 underline-offset-2"
          >
            📎 {valeur.nom}
          </a>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-full px-2 py-0.5 font-medium text-brand-blue hover:bg-brand-blue/10"
            >
              Remplacer
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-full px-2 py-0.5 font-medium text-red-600 hover:bg-red-50"
            >
              Retirer
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={lecture}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-50"
        >
          {lecture ? "Lecture du document…" : "📎 Joindre un document de preuve (PDF, image — 8 Mo max)"}
        </button>
      )}
      {erreur && (
        <p className="mt-1 text-xs font-medium text-red-600">{erreur}</p>
      )}
    </div>
  );
}
