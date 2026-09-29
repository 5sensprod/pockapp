// frontend/modules/stick/labels/components/canvas/FicheNode.jsx
//
// L'élément « Fiche » sur le canvas : un Group react-konva dont les ENFANTS
// sont fabriqués par `construireFiche` (`utils/ficheKonva.js`), la même
// fonction que l'export. Le Group porte l'id, la position et les événements —
// c'est lui que le Transformer saisit.

import React, { useEffect, useRef } from 'react';
import { Group } from 'react-konva';
import { construireFiche } from '../../utils/ficheKonva';
import { loadGoogleFont } from '../../utils/loadGoogleFont';

const FicheNode = ({ el, contenu, ...groupProps }) => {
  const ref = useRef(null);
  const cle = JSON.stringify([el, contenu]);

  useEffect(() => {
    let actif = true;
    const dessiner = () => {
      const g = ref.current;
      if (!g || !actif) return;
      g.destroyChildren();
      construireFiche(el, contenu).nodes.forEach((n) => g.add(n));
      g.getStage()?.find('Transformer').forEach((tr) => tr.forceUpdate());
      g.getLayer()?.batchDraw();
    };
    dessiner();
    // Police Google : redessiner quand elle est là, la mesure en dépend
    loadGoogleFont(el.fontFamily).then(dessiner);
    return () => {
      actif = false;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: `cle` résume el et contenu
  }, [cle]);

  return <Group ref={ref} {...groupProps} />;
};

export default FicheNode;
