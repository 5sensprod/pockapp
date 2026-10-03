// frontend/modules/stick/labels/components/useFlottant.js
//
// Le style `fixed` d'une fenêtre flottante de la barre d'options, tenu à jour
// tant qu'elle est ouverte : à l'ouverture, quand son contenu change de taille
// (un sélecteur de couleur qui passe en dégradé), quand la fenêtre du
// navigateur change, et quand QUOI QUE CE SOIT défile — la barre d'options
// défile en largeur, et la fenêtre restait en place, détachée de son bouton.
// La règle est dans `utils/positionFlottante.js`.

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { positionFlottante } from '../utils/positionFlottante';

// Hors écran le temps de la première mesure : pas de saut visible
const AVANT_MESURE = { top: -9999, left: -9999, maxHeight: undefined };

/**
 * @param ouvert  la fenêtre est-elle affichée ?
 * @param ancre   ref du bouton
 * @param panneau ref de la fenêtre (elle doit porter `overflow-y-auto`)
 * @returns style à étaler sur la fenêtre : `{ top, left, maxHeight }`
 */
export const useFlottant = (ouvert, ancre, panneau, ecart = 6) => {
  const [style, setStyle] = useState(AVANT_MESURE);

  const placer = useCallback(() => {
    const a = ancre.current;
    const p = panneau.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    // `scrollHeight` : la hauteur du contenu ENTIER, même quand il défile déjà
    const { top, left, maxHeight } = positionFlottante(
      r,
      { width: p.offsetWidth, height: p.scrollHeight + (p.offsetHeight - p.clientHeight) },
      { width: window.innerWidth, height: window.innerHeight },
      ecart
    );
    setStyle((s) => (s.top === top && s.left === left && s.maxHeight === maxHeight ? s : { top, left, maxHeight }));
  }, [ancre, panneau, ecart]);

  useLayoutEffect(() => {
    if (ouvert) placer();
    else setStyle(AVANT_MESURE);
  }, [ouvert, placer]);

  useEffect(() => {
    if (!ouvert) return undefined;
    // `true` (capture) : le défilement d'un conteneur ne remonte pas
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(placer);
    if (panneau.current) {
      observateur?.observe(panneau.current);
      // Le contenu direct aussi : la fenêtre bornée ne change pas de taille quand il grandit
      Array.from(panneau.current.children).forEach((c) => observateur?.observe(c));
    }
    // … et ce qui s'y ajoute ou s'en retire (un mode qui change de contenu)
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(placer);
    if (panneau.current) mutations?.observe(panneau.current, { childList: true, subtree: true });
    return () => {
      mutations?.disconnect();
      window.removeEventListener('scroll', placer, true);
      window.removeEventListener('resize', placer);
      observateur?.disconnect();
    };
  }, [ouvert, placer, panneau]);

  return style;
};
