"use client";

import { useState } from "react";

/**
 * AGL JuriCompliance — Champ mot de passe avec œil de visibilité.
 *
 * Saisir un mot de passe sans le voir est la première cause d'erreur à la
 * connexion (et de blocage pour une saisie manuelle). L'œil permet de vérifier
 * la saisie — les deux états sont annoncés aux lecteurs d'écran
 * (`aria-pressed` + `aria-label` qui bascule).
 *
 * Partagé par l'écran de connexion et l'écran « Mon compte » pour que le
 * comportement soit identique partout.
 */
export function ChampMotDePasse({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required = true,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (valeur: string) => void;
  autoComplete: string;
  required?: boolean;
  placeholder?: string;
  error?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <span className="relative block">
          <input
            id={id}
            type={visible ? "text" : "password"}
            required={required}
            autoComplete={autoComplete}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            className="w-full rounded-md border border-slate-300 py-2 pl-3 pr-11 text-slate-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? `Masquer le ${label.toLowerCase()}` : `Afficher le ${label.toLowerCase()}`}
            title={visible ? "Masquer" : "Afficher"}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-blue"
          >
            {visible ? (
              <span aria-hidden="true">🙈</span>
            ) : (
              <span aria-hidden="true">👁</span>
            )}
          </button>
        </span>
      </label>
      {error && (
        <p className="mt-1 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
