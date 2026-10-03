// frontend/modules/stick/labels/components/useMajSelection.js
//
// LE chemin d'écriture d'un réglage, pour le panneau de la barre latérale
// (`ReglagesPanel`) ET pour les options rapides de la barre du haut
// (`ReglagesRapides`) : l'élément principal de la sélection, et un `maj` qui
// applique le réglage à toute la sélection du même type en UN pas
// d'historique (`utils/majSelection.js`, action `updateElements`).
// Deux endroits, un seul chemin : un réglage visible en haut et à gauche ne
// peut pas diverger.

import { useCallback } from 'react';
import useLabelStore from '../store/useLabelStore';
import { redessiner } from '../utils/dessin';
import { ciblesDe, majDeSelection } from '../utils/majSelection';

const principal = (s) => s.elements.find((e) => e.id === s.selectedId) ?? null;

/**
 * @returns `{ el, maj, nombre, autres }` — `nombre` : les éléments réglés
 * ensemble ; `autres` : ceux de la sélection qui ne le sont pas (autre type,
 * ou verrouillés).
 */
export const useMajSelection = () => {
  const el = useLabelStore(principal);
  const nombre = useLabelStore((s) => ciblesDe(s, principal(s)).length);
  const total = useLabelStore((s) => (s.selectedId ? 1 + s.extraIds.length : 0));
  const id = el?.id;
  const maj = useCallback(
    (m) => {
      const etat = useLabelStore.getState();
      const cible = etat.elements.find((e) => e.id === id);
      if (cible) etat.updateElements(majDeSelection(etat, cible, m, { redessiner }));
    },
    [id]
  );
  return { el, maj, nombre, autres: Math.max(0, total - nombre) };
};
