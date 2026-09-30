import React, { useEffect, useState } from 'react';
import { Group, Rect } from 'react-konva';
import { bandesHorsPage, couleurDuFond, OPACITE_VOILE } from '../../utils/voileHorsPage';

/**
 * Voile de la couleur du fond sur tout ce qui dépasse de la page. Écran
 * seulement : posé HORS du groupe du document, jamais exporté. Ne capte aucun
 * événement — on attrape un élément par sa partie voilée comme avant.
 */
export default function VoileHorsPage({ stageRef, sceneWidth, sceneHeight, page }) {
  const [couleur, setCouleur] = useState(null);

  // La couleur est lue dans le DOM (fond de l'espace de travail) et relue
  // quand le thème change : classe de <html> ou préférence du système.
  useEffect(() => {
    const lire = () => {
      const conteneur = stageRef.current?.container();
      if (conteneur) setCouleur(couleurDuFond(conteneur));
    };
    lire();
    const obs = new MutationObserver(lire);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', lire);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.('change', lire);
    };
  }, [stageRef]);

  if (!couleur) return null;
  const bandes = bandesHorsPage({ width: sceneWidth, height: sceneHeight }, page);
  return (
    <Group listening={false} opacity={OPACITE_VOILE}>
      {bandes.map((b) => (
        <Rect key={b.cle} x={b.x} y={b.y} width={b.width} height={b.height} fill={couleur} listening={false} />
      ))}
    </Group>
  );
}
