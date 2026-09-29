// Le TIRAGE : quels produits, combien de fois, et sous quel format. Le canvas
// reste le modèle ; cette liste dit qui l'imprime. Les pages en découlent
// (`lib/tirage.js`). Voir `PocketStick-docs/03-tirage.md`.
import React, { useMemo, useState } from 'react';
import { Minus, Plus, X, PackagePlus } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { casesDuTirage, pagination, QUANTITE_MAX } from '../../lib/tirage';
import ProductSelector from '../ProductSelector';

const Quantite = ({ valeur, onChange, libelle }) => (
  <div className="flex items-center shrink-0" role="group" aria-label={`Quantité ${libelle}`}>
    <button
      type="button"
      onClick={() => onChange(valeur - 1)}
      disabled={valeur <= 1}
      className="h-6 w-6 inline-flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
      aria-label="Un de moins"
    >
      <Minus className="h-3 w-3" />
    </button>
    <input
      type="number"
      min="1"
      max={QUANTITE_MAX}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      className="w-10 h-6 mx-1 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
    <button
      type="button"
      onClick={() => onChange(valeur + 1)}
      disabled={valeur >= QUANTITE_MAX}
      className="h-6 w-6 inline-flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
      aria-label="Un de plus"
    >
      <Plus className="h-3 w-3" />
    </button>
  </div>
);

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

const TiragePanel = () => {
  const ids = useLabelStore((s) => s.selectedProductIds);
  const parId = useLabelStore((s) => s.produitsParId);
  const quantites = useLabelStore((s) => s.quantites);
  const quantiteSansProduit = useLabelStore((s) => s.quantiteSansProduit);
  const courant = useLabelStore((s) => s.currentProductIndex);
  const format = useLabelStore((s) => s.formatTirage);
  const sheetSettings = useLabelStore((s) => s.sheetSettings);
  const ajouterAuTirage = useLabelStore((s) => s.ajouterAuTirage);
  const setQuantite = useLabelStore((s) => s.setQuantite);
  const retirerDuTirage = useLabelStore((s) => s.retirerDuTirage);
  const goToProductIndex = useLabelStore((s) => s.goToProductIndex);
  const setFormatTirage = useLabelStore((s) => s.setFormatTirage);
  const [choisir, setChoisir] = useState(false);

  const { total, pages, libres } = useMemo(() => {
    const cases = casesDuTirage({ selectedProductIds: ids, quantites, quantiteSansProduit });
    const r = pagination(cases, { format, rows: sheetSettings.rows, cols: sheetSettings.cols });
    return { total: cases.length, pages: r.pages.length, libres: r.libres };
  }, [ids, quantites, quantiteSansProduit, format, sheetSettings.rows, sheetSettings.cols]);

  const bouton = (actif) =>
    `flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
      actif
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
    }`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Tirage</h3>
      </div>

      <ul className="space-y-1">
        {ids.length === 0 ? (
          <li className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-900">
            <span className="flex-1 text-xs text-gray-600 dark:text-gray-400">Sans produit</span>
            <Quantite
              valeur={quantiteSansProduit}
              libelle="sans produit"
              onChange={(n) => setQuantite(null, n)}
            />
          </li>
        ) : (
          ids.map((id, i) => {
            const produit = parId[id];
            const nom = produit?.name || 'Produit';
            const actif = i === courant;
            return (
              <li
                key={id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border ${
                  actif
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
              >
                <button
                  type="button"
                  onClick={() => goToProductIndex(i)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  title={actif ? 'Affiché sur le canvas' : 'Afficher sur le canvas'}
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${actif ? 'bg-blue-500' : 'bg-transparent'}`}
                  />
                  <span className="truncate text-xs text-gray-800 dark:text-gray-200">{nom}</span>
                </button>
                <Quantite
                  valeur={quantites[id] ?? 1}
                  libelle={nom}
                  onChange={(n) => setQuantite(id, n)}
                />
                <button
                  type="button"
                  onClick={() => retirerDuTirage(id)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  aria-label={`Retirer ${nom}`}
                  title="Retirer du tirage"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })
        )}
      </ul>

      <button
        type="button"
        onClick={() => setChoisir(true)}
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600"
      >
        <PackagePlus className="h-4 w-4" />
        Ajouter des produits
      </button>

      <div className="flex gap-2" role="group" aria-label="Format du tirage">
        <button type="button" className={bouton(format === 'page')} onClick={() => setFormatTirage('page')}>
          Une par page
        </button>
        <button type="button" className={bouton(format === 'planche')} onClick={() => setFormatTirage('planche')}>
          Planche {sheetSettings.cols}×{sheetSettings.rows}
        </button>
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-400">
        {pluriel(total, format === 'page' ? 'affiche' : 'étiquette')}
        {format === 'planche' && (
          <>
            {' · '}
            {pluriel(pages, 'planche')}
            {libres > 0 && ` (${libres} ${libres > 1 ? 'cases libres' : 'case libre'})`}
          </>
        )}
      </p>

      {choisir && (
        <ProductSelector
          multiSelect
          selectedProducts={[]}
          onSelect={(produits) => {
            ajouterAuTirage(produits);
            setChoisir(false);
          }}
          onClose={() => setChoisir(false)}
        />
      )}
    </div>
  );
};

export default React.memo(TiragePanel);
