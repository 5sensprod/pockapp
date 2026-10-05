// frontend/modules/stick/labels/components/MasqueTexture.jsx
//
// Réglages d'une TEXTURE (`maskTexture`, `utils/bruit.js`), dans la section
// « Masque » des réglages et dans le sélecteur de couleur. L'aperçu est la
// carte elle-même, calculée par la MÊME fonction que le dessin
// (`carteNiveaux`).
//
// Des mots de boutique depuis le 3 octobre 2026 — les clés écrites n'ont pas
// changé : « Graine » est « Variante » (`seed`), « Octaves » « Détail »
// (`octaves`), « Seuil » « Coupure » (`threshold`), « Distance : F1, F2,
// F2 − F1 » « Motif : cellules pleines, cloisons larges, bords » (`distance`).
// « Douceur » (`softness`) garde son nom : le masque a déjà un « Fondu ».

import React, { useEffect, useRef } from 'react';
import { Shuffle } from 'lucide-react';
import ChampValide from './ui/ChampValide';
import Curseur from './ui/Curseur';
import Interrupteur from './ui/Interrupteur';
import { BOUTON_ICONE, CHAMP } from './ui/styles';
import { TEXTURE_PAR_DEFAUT, TYPES_TEXTURE, carteNiveaux, sanitizeTexture } from '../utils/bruit';

const APERCU = 64;

const LIGNE = 'flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300';
const LIBELLE = 'w-14 shrink-0';

const MasqueTexture = ({ valeur, onChange }) => {
  const tex = sanitizeTexture(valeur);
  const apercu = useRef(null);
  const cle = tex ? JSON.stringify(tex) : '';

  useEffect(() => {
    const canvas = apercu.current;
    if (!canvas || !cle) return;
    const niveaux = carteNiveaux(JSON.parse(cle), APERCU, APERCU, 1);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(APERCU, APERCU);
    niveaux.forEach((n, i) => {
      img.data[i * 4] = n;
      img.data[i * 4 + 1] = n;
      img.data[i * 4 + 2] = n;
      img.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);
  }, [cle]);

  const maj = (champ) => onChange({ ...tex, ...champ });

  return (
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 px-1 space-y-2">
      <label className={LIGNE}>
        <span className={LIBELLE}>Texture</span>
        <select
          value={tex?.type ?? ''}
          onChange={(e) =>
            onChange(e.target.value ? { ...(tex ?? TEXTURE_PAR_DEFAUT), type: e.target.value } : null)
          }
          className={`${CHAMP} flex-1 min-w-0`}
        >
          <option value="">Aucune</option>
          {TYPES_TEXTURE.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {tex && (
        <>
          <div className="flex items-center gap-2">
            <canvas
              ref={apercu}
              width={APERCU}
              height={APERCU}
              className="w-16 h-16 flex-none rounded-md ring-1 ring-inset ring-gray-200 dark:ring-gray-600"
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              {/* Le même motif, tiré autrement : un numéro, ou un autre au hasard */}
              <div className={LIGNE}>
                <span className={LIBELLE}>Variante</span>
                <ChampValide valeur={tex.seed} onValeur={(seed) => maj({ seed })} min={0} titre="Numéro de la variante" className="w-16" />
                <button
                  type="button"
                  title="Une autre variante, au hasard"
                  aria-label="Une autre variante, au hasard"
                  onClick={() => maj({ seed: Math.floor(Math.random() * 100000) })}
                  className={BOUTON_ICONE}
                >
                  <Shuffle className="h-4 w-4" />
                </button>
              </div>
              <div className={LIGNE}>
                <span className={LIBELLE}>Inverser</span>
                <Interrupteur actif={tex.invert} onActif={(invert) => maj({ invert })} label="Inverser la texture" />
              </div>
            </div>
          </div>
          <Curseur largeurLabel="w-14" label="Échelle" min={0.5} max={32} step={0.5} valeur={tex.scale} onValeur={(scale) => maj({ scale })} />
          {(tex.type === 'value' || tex.type === 'perlin') && (
            <Curseur largeurLabel="w-14" label="Détail" min={1} max={6} step={1} valeur={tex.octaves} onValeur={(octaves) => maj({ octaves })} />
          )}
          {tex.type === 'voronoi' && (
            <label className={LIGNE}>
              <span className={LIBELLE}>Motif</span>
              <select value={tex.distance} onChange={(e) => maj({ distance: e.target.value })} className={`${CHAMP} flex-1 min-w-0`}>
                <option value="f1">Cellules pleines</option>
                <option value="f2">Cloisons larges</option>
                <option value="f2-f1">Bords</option>
              </select>
            </label>
          )}
          <Curseur largeurLabel="w-14" label="Contraste" min={0} max={5} step={0.1} valeur={tex.contrast} onValeur={(contrast) => maj({ contrast })} />
          <Curseur largeurLabel="w-14" label="Coupure" min={0} max={1} step={0.01} valeur={tex.threshold} onValeur={(threshold) => maj({ threshold })} />
          <Curseur largeurLabel="w-14" label="Douceur" min={0} max={1} step={0.01} valeur={tex.softness} onValeur={(softness) => maj({ softness })} />
        </>
      )}
    </div>
  );
};

export default MasqueTexture;
