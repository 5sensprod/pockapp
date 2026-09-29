// frontend/modules/stick/labels/components/MasqueTexture.jsx
//
// Réglages du masque TEXTURE d'une image (`maskTexture`, `utils/bruit.js`),
// dans le menu « Masque » de PropertyPanel. L'aperçu est la carte elle-même,
// calculée par la MÊME fonction que le dessin (`carteNiveaux`).

import React, { useEffect, useRef } from 'react';
import { TEXTURE_PAR_DEFAUT, TYPES_TEXTURE, carteNiveaux, sanitizeTexture } from '../utils/bruit';

const APERCU = 64;

const Curseur = ({ label, min, max, step, value, onChange }) => (
  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
    <span className="w-14 shrink-0">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 min-w-0"
    />
    <span className="w-8 text-right">{Math.round(value * 100) / 100}</span>
  </label>
);

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
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 px-1 space-y-1.5">
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="w-14 shrink-0">Texture</span>
        <select
          value={tex?.type ?? ''}
          onChange={(e) =>
            onChange(e.target.value ? { ...(tex ?? TEXTURE_PAR_DEFAUT), type: e.target.value } : null)
          }
          className="flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-0.5"
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
              className="w-16 h-16 rounded border border-gray-300 dark:border-gray-600"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                <span className="w-10">Graine</span>
                <input
                  type="number"
                  min={0}
                  value={tex.seed}
                  onChange={(e) => maj({ seed: Number(e.target.value) })}
                  className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1"
                />
                <button
                  type="button"
                  title="Graine au hasard"
                  onClick={() => maj({ seed: Math.floor(Math.random() * 100000) })}
                  className="px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  🎲
                </button>
              </div>
              <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={tex.invert} onChange={(e) => maj({ invert: e.target.checked })} />
                Inverser
              </label>
            </div>
          </div>
          <Curseur label="Échelle" min={0.5} max={32} step={0.5} value={tex.scale} onChange={(scale) => maj({ scale })} />
          {(tex.type === 'value' || tex.type === 'perlin') && (
            <Curseur label="Octaves" min={1} max={6} step={1} value={tex.octaves} onChange={(octaves) => maj({ octaves })} />
          )}
          {tex.type === 'voronoi' && (
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="w-14 shrink-0">Distance</span>
              <select
                value={tex.distance}
                onChange={(e) => maj({ distance: e.target.value })}
                className="flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-0.5"
              >
                <option value="f1">F1 (cellules)</option>
                <option value="f2">F2</option>
                <option value="f2-f1">F2 − F1 (bords)</option>
              </select>
            </label>
          )}
          <Curseur label="Contraste" min={0} max={5} step={0.1} value={tex.contrast} onChange={(contrast) => maj({ contrast })} />
          <Curseur label="Seuil" min={0} max={1} step={0.01} value={tex.threshold} onChange={(threshold) => maj({ threshold })} />
          <Curseur label="Douceur" min={0} max={1} step={0.01} value={tex.softness} onChange={(softness) => maj({ softness })} />
        </>
      )}
    </div>
  );
};

export default MasqueTexture;
