// Le TIRAGE : quels produits, combien de fois, et sous quel format. Le canvas
// reste le modèle ; cette liste dit qui l'imprime. Les pages en découlent
// (`lib/tirage.js`). Voir `PocketStick-docs/03-tirage.md`.
//
// Sur les composants communs depuis le 3 octobre 2026 (`ui/LigneListe`,
// `Segments`, `ChampValide`) : mêmes actions du store, mêmes bornes.
import React, { useMemo, useState } from 'react';
import { Minus, Plus, X, PackagePlus } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { casesDuTirage, pagination, QUANTITE_MAX } from '../../lib/tirage';
import ProductSelector from '../ProductSelector';
import Bouton from '../ui/Bouton';
import ChampValide from '../ui/ChampValide';
import LigneListe from '../ui/LigneListe';
import Segments from '../ui/Segments';
import TitreGroupe from '../ui/TitreGroupe';
import { AIDE } from '../ui/styles';

const PAS =
  'h-7 w-6 inline-flex items-center justify-center rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:pointer-events-none';

// Dans une rangée cliquable : un clic sur la quantité n'affiche pas le produit
const Quantite = ({ valeur, onChange, libelle }) => (
  <div className="flex items-center" role="group" aria-label={`Quantité ${libelle}`} onClick={(e) => e.stopPropagation()}>
    <button type="button" onClick={() => onChange(valeur - 1)} disabled={valeur <= 1} className={PAS} aria-label="Un de moins">
      <Minus className="h-3 w-3" />
    </button>
    <ChampValide valeur={valeur} onValeur={onChange} min={1} max={QUANTITE_MAX} titre={`Quantité ${libelle}`} sansPas className="w-10" />
    <button
      type="button"
      onClick={() => onChange(valeur + 1)}
      disabled={valeur >= QUANTITE_MAX}
      className={PAS}
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

  return (
    <div className="space-y-2">
      <TitreGroupe
        titre="À imprimer"
        compte={ids.length || undefined}
        action={
          <Bouton icone={PackagePlus} onClic={() => setChoisir(true)} titre="Ajouter des produits">
            Ajouter
          </Bouton>
        }
      />

      <div className="space-y-0.5">
        {ids.length === 0 ? (
          <LigneListe
            titre="Sans produit"
            etats={<Quantite valeur={quantiteSansProduit} libelle="sans produit" onChange={(n) => setQuantite(null, n)} />}
          />
        ) : (
          ids.map((id, i) => {
            const nom = parId[id]?.name || 'Produit';
            const actif = i === courant;
            return (
              <LigneListe
                key={id}
                actif={actif}
                // Le point : le produit que la page montre
                avant={<span className={`h-2 w-2 flex-none rounded-full ${actif ? 'bg-blue-500' : 'bg-transparent'}`} />}
                titre={nom}
                onClic={() => goToProductIndex(i)}
                title={actif ? 'Affiché sur la page' : 'Afficher sur la page'}
                etats={
                  <>
                    <Quantite valeur={quantites[id] ?? 1} libelle={nom} onChange={(n) => setQuantite(id, n)} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        retirerDuTirage(id);
                      }}
                      className="ml-1 h-7 w-6 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      aria-label={`Retirer ${nom}`}
                      title="Retirer du tirage"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                }
              />
            );
          })
        )}
      </div>

      <div className="pt-1">
        <Segments
          label="Format du tirage"
          valeur={format}
          onValeur={setFormatTirage}
          options={[
            { id: 'page', label: 'Une par page' },
            { id: 'planche', label: `Planche ${sheetSettings.cols}×${sheetSettings.rows}` },
          ]}
        />
      </div>

      <p className={AIDE}>
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
