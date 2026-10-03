// frontend/modules/stick/labels/components/ui/Curseur.jsx
//
// LE curseur de l'éditeur. Il y en avait sept écritures (barre d'options,
// menus, sélecteur de couleur, panneaux), chacune avec ses oublis : champ
// numérique ici, double-clic « valeur normale » là, largeurs différentes.
//
// Toujours un `input[type="range"]` : le canvas masque le cadre de sélection
// tant qu'un curseur de la page est tenu (`KonvaCanvas`), et le store compte
// un curseur tenu pour UN pas d'historique — `onValeur` reçoit un nombre, à
// l'appelant de garder les mêmes clés d'un appel à l'autre.
//
// - `disposition="ligne"` : libellé, curseur, valeur sur une ligne (menus) ;
// - `disposition="bloc"` : libellé et valeur au-dessus, curseur dessous (panneaux) ;
// - `champ` : la valeur devient un champ numérique saisissable ;
// - `defaut` : un double-clic sur le curseur y revient.

import React from 'react';

const arrondi = (v) => Math.round(v * 100) / 100;

const Curseur = ({
  label,
  valeur,
  min = 0,
  max = 100,
  step = 1,
  onValeur,
  affichage, // texte, ou fonction de la valeur ; par défaut la valeur arrondie
  defaut,
  champ = false,
  disposition = 'ligne',
  largeurLabel = 'w-16',
  className = '',
}) => {
  const texte = typeof affichage === 'function' ? affichage(valeur) : (affichage ?? arrondi(valeur));
  const glissiere = (classes) => (
    <input
      type="range"
      aria-label={typeof label === 'string' ? label : undefined}
      min={min}
      max={max}
      step={step}
      value={valeur}
      onChange={(e) => onValeur(Number(e.target.value))}
      onDoubleClick={defaut === undefined ? undefined : () => onValeur(defaut)}
      title={defaut === undefined ? undefined : 'Double-clic : valeur normale'}
      className={`${classes} cursor-pointer accent-blue-600`}
    />
  );
  const valeurAffichee = champ ? (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={valeur}
      onChange={(e) => onValeur(parseFloat(e.target.value))}
      className="w-16 px-1 py-0.5 text-right border rounded dark:bg-gray-800 dark:border-gray-600"
    />
  ) : (
    <span className="tabular-nums">{texte}</span>
  );

  if (disposition === 'bloc') {
    return (
      <div className={`text-xs text-gray-700 dark:text-gray-300 ${className}`}>
        <label className="flex items-center justify-between">
          <span>{label}</span>
          {valeurAffichee}
        </label>
        {glissiere('w-full mt-1')}
      </div>
    );
  }
  return (
    <label className={`flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 ${className}`}>
      <span className={`${largeurLabel} shrink-0`}>{label}</span>
      {glissiere('flex-1 min-w-0')}
      <span className="w-10 shrink-0 text-right">{valeurAffichee}</span>
    </label>
  );
};

export default Curseur;
