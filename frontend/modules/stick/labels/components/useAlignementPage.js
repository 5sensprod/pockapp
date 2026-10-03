// frontend/modules/stick/labels/components/useAlignementPage.js
//
// ALIGNER ET RÉPARTIR la sélection — sur la page pour un élément seul, entre
// eux pour plusieurs —, pour le panneau de réglages et pour la barre du haut.
// Les cadres sont MESURÉS sur le canvas (rotation, texte sans largeur, QR,
// formes centrées), en coordonnées du document ; on déplace ensuite chaque
// élément du décalage calculé, ce qui vaut quelle que soit son origine.
// Tous les déplacements partent dans UN `updateElements` : aligner trois
// éléments s'annule d'un seul Ctrl+Z.

import useLabelStore, { idsSelectionnes } from '../store/useLabelStore';
import { alignOffsets, distributeOffsets, unionBoxes } from '../utils/layout';

export const useAlignementPage = (docNode) => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const extraIds = useLabelStore((s) => s.extraIds);
  const canvasSize = useLabelStore((s) => s.canvasSize);

  // La sélection, verrouillés exclus
  const ids = idsSelectionnes({ selectedId, extraIds, elements }).filter((id) => !elements.find((e) => e.id === id)?.locked);
  const cadre = (id) => docNode?.findOne(`#${id}`)?.getClientRect({ skipShadow: true, relativeTo: docNode }) ?? null;
  const deplacer = (offsets, liste) => {
    const parId = {};
    offsets.forEach(({ dx, dy }, i) => {
      const e = elements.find((x) => x.id === liste[i]);
      if (e && (dx || dy)) parId[e.id] = { x: (e.x ?? 0) + dx, y: (e.y ?? 0) + dy };
    });
    useLabelStore.getState().updateElements(parId);
  };
  const aligner = (alignement) => {
    const liste = ids.filter((id) => cadre(id));
    const boites = liste.map(cadre);
    if (!boites.length) return;
    const reference =
      boites.length === 1 ? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height } : unionBoxes(boites);
    deplacer(alignOffsets(boites, reference, alignement), liste);
  };
  const distribuer = (axe) => {
    const liste = ids.filter((id) => cadre(id));
    deplacer(distributeOffsets(liste.map(cadre), axe), liste);
  };

  return { ids, aligner, distribuer, pret: !!docNode };
};
