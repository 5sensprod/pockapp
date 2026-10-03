// frontend/modules/stick/labels/components/templates/DonneesProduitPanel.jsx
//
// L'onglet « Données produit » : d'un coup d'œil, quels éléments de l'affiche
// sont liés à la fiche produit, à quel champ, avec quelle valeur pour le
// produit affiché — et on change la liaison ici, par le MÊME bloc que les
// Propriétés (`LiaisonProduit`).
//
// On y ajoute aussi un texte lié, champ par champ (ce que faisait l'ancien
// panneau « Tableau »), la photo du produit, le QR vers la page du produit et
// les sections de la fiche (`utils/ajoutsProduit.js`) : c'est le SEUL endroit
// où ils s'ajoutent liés — les onglets Images et QR Code sont statiques, et
// les onglets Fiche produit et Code-barres sont supprimés (le choix du
// format du code-barres est ici, grisé quand le numéro ne s'y plie pas).
//
// Orange : la couleur de PocketStock, d'où viennent ces données.
import React from 'react';
import {
  Type as TypeIcon,
  Image as ImageIcon,
  QrCode,
  Barcode,
  ListChecks,
  Link as LinkIcon,
  Package,
} from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import LiaisonProduit from '../LiaisonProduit';
import { useImagesCatalogue } from '../../lib/use-images-catalogue';
import { champsPourType, elementsLies, libelleLiaison, photosGalerie } from '../../utils/champsProduit';
import { getProductField, resolvePropForElement } from '../../utils/dataBinding';
import { SECTIONS_FICHE, contenuFiche } from '../../utils/ficheProduit';
import {
  FORMATS_CODE_BARRES,
  ajouterCodeBarres,
  ajouterFiche,
  ajouterImageFixe,
  ajouterImageLiee,
  ajouterPhotoProduit,
  ajouterQRProduit,
  formatCompatible,
} from '../../utils/ajoutsProduit';
import { mesurerTexte } from '../../utils/mesurerTexte';

const ICONES = { text: TypeIcon, image: ImageIcon, qrcode: QrCode, barcode: Barcode, fiche: ListChecks };

/** Style d'un texte ajouté, selon le champ : les prix se voient. */
const STYLE_TEXTE = {
  price: { fontSize: 48, bold: true, color: '#ef4444' },
  sale_price: { fontSize: 48, bold: true, color: '#22c55e' },
  name: { fontSize: 32, bold: true },
  description: { fontSize: 14, bold: false },
};

const BOUTON_AJOUT =
  'w-full p-2 flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Une carte de l'onglet : un titre, une phrase d'aide, et ce qu'on y ajoute.
 * Texte, Médias, Éditorial — pour qu'on voie d'un coup d'œil ce qui arrive
 * sur l'affiche en TEXTE (le numéro du code-barres, par exemple) et ce qui
 * arrive en DESSIN (les barres).
 */
const Carte = ({ icone: Icone, titre, aide, children }) => (
  <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <Icone className="h-4 w-4 text-orange-500" />
      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{titre}</div>
    </div>
    {aide && <div className="text-xs text-gray-500 dark:text-gray-400">{aide}</div>}
    {children}
  </section>
);

const couper = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** La valeur que l'élément affiche pour ce produit, en une ligne. */
const apercu = (el, product) => {
  if (!product) return '';
  if (el.type === 'fiche') {
    const c = contenuFiche(product.description, el.section);
    const n = c?.rows?.length ?? c?.items?.length ?? c?.paragraphs?.length;
    return c ? (n ? `${n} ligne(s)` : 'Présente') : 'Absente de la fiche';
  }
  if (el.type === 'image') return el.dataBinding ? (resolvePropForElement(el.src, el, product) ? 'Photo présente' : 'Vide pour ce produit') : '';
  const prop = { text: 'text', qrcode: 'qrValue', barcode: 'barcodeValue' }[el.type];
  const v = resolvePropForElement(el[prop], el, product);
  const s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  return s || 'Vide pour ce produit';
};


const DonneesProduitPanel = ({ onOpenTool }) => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const selectElement = useLabelStore((s) => s.selectElement);
  const updateElement = useLabelStore((s) => s.updateElement);
  const addElementCentre = useLabelStore((s) => s.addElementCentre);
  const product = useLabelStore((s) => s.selectedProduct);
  const logoEntreprise = useImagesCatalogue().entreprise;

  const lies = elementsLies(elements);
  const galerie = photosGalerie(product);
  const codeBarres = product ? String(getProductField(product, 'barcode') ?? '') : '';

  const ajouterTexte = (champ) => {
    const style = STYLE_TEXTE[champ.cle] ?? { fontSize: 24, bold: false };
    const el = {
      type: 'text',
      text: String(resolvePropForElement('', { type: 'text', dataBinding: champ.cle }, product) ?? ''),
      fontSize: style.fontSize,
      bold: style.bold,
      color: style.color || '#000000',
      dataBinding: champ.cle,
    };
    addElementCentre(el, mesurerTexte(el));
  };

  return (
    <div className="p-4 space-y-5">
      {/* Le produit dont on voit les valeurs */}
      {product ? (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Valeurs de : <span className="font-medium text-orange-600 dark:text-orange-400">{product.name}</span>
        </div>
      ) : (
        <div className="p-3 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-900/10 text-sm text-gray-700 dark:text-gray-300">
          Aucun produit au tirage : les liaisons restent, mais aucune valeur ne s'affiche.
          {onOpenTool && (
            <button
              onClick={() => onOpenTool('sheet')}
              className="mt-2 flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline"
            >
              <Package className="h-4 w-4" />
              Ajouter des produits
            </button>
          )}
        </div>
      )}

      {/* Ce qui est lié sur l'affiche */}
      <section className="space-y-2">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Sur l'affiche ({lies.length})
        </div>
        {lies.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">Aucun élément lié à la fiche produit.</div>
        )}
        {lies.map((el) => {
          const Icone = ICONES[el.type] ?? LinkIcon;
          const actif = el.id === selectedId;
          return (
            <div
              key={el.id}
              className={`rounded-lg border transition-colors ${
                actif
                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-orange-300'
              }`}
            >
              <button
                onClick={() => !el.locked && selectElement(el.id)}
                className="w-full p-2 flex items-center gap-2 text-left"
                title={el.locked ? 'Élément verrouillé' : "Sélectionner l'élément"}
              >
                <Icone className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-orange-600 dark:text-orange-400">
                    {libelleLiaison(el)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {couper(apercu(el, product), 60)}
                  </div>
                </div>
              </button>
              {actif && (
                <div className="px-2 pb-2">
                  <LiaisonProduit
                    element={el}
                    product={product}
                    onUpdate={(patch) => updateElement(el.id, patch)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Texte : chaque champ arrive en texte, sa valeur telle quelle */}
      <Carte icone={TypeIcon} titre="Texte" aide="Chaque champ s’ajoute en texte lié : sa valeur telle quelle, code-barres compris (le numéro seul).">
        <div className="grid grid-cols-2 gap-2">
          {champsPourType('text').map((champ) => (
            <button
              key={champ.cle}
              onClick={() => ajouterTexte(champ)}
              disabled={!product}
              className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-xs text-orange-600 dark:text-orange-400">{champ.libelle}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {product
                  ? couper(apercu({ type: 'text', dataBinding: champ.cle }, product), 40)
                  : '—'}
              </div>
            </button>
          ))}
        </div>
      </Carte>

      {/* Médias : photo, galerie, QR, code-barres dessiné (`ajoutsProduit.js`) */}
      <Carte icone={ImageIcon} titre="Médias" aide="Photo, logo de la marque, image de la catégorie, QR code et code-barres dessiné, liés au produit.">
        <button
          onClick={() => ajouterPhotoProduit()}
          disabled={!product}
          className={BOUTON_AJOUT}
        >
          <ImageIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <div>
            <div className="text-sm text-orange-600 dark:text-orange-400">Photo du produit</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {!product ? '—' : product.image?.src ? 'Entière, centrée dans son cadre' : 'Ce produit n’a pas de photo'}
            </div>
          </div>
        </button>
        {galerie.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Galerie ({galerie.length}) — liée au même rang pour chaque produit
            </div>
            <div className="grid grid-cols-4 gap-2">
              {galerie.map((photo) => (
                <button
                  key={photo.cle}
                  onClick={() => ajouterPhotoProduit(photo)}
                  className="aspect-square rounded-lg border border-gray-200 dark:border-gray-700 hover:border-orange-400 overflow-hidden bg-gray-50 dark:bg-gray-900"
                  title={photo.libelle}
                >
                  <img src={photo.src} alt={photo.libelle} className="w-full h-full object-contain" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Images de PocketStock liées au produit : elles changent avec lui */}
        {[
          ['brand_image', 'Logo de la marque', 'Cette marque n’a pas de logo : rien ne s’affichera'],
          ['category_image', 'Image de la catégorie', 'Aucune catégorie de ce produit n’a d’image : rien ne s’affichera'],
        ].map(([cle, libelle, vide]) => {
          const src = product ? getProductField(product, cle) : '';
          return (
            <button key={cle} onClick={() => ajouterImageLiee(cle)} disabled={!product} className={BOUTON_AJOUT}>
              {src ? (
                <img src={src} alt="" className="h-8 w-8 object-contain flex-none" loading="lazy" />
              ) : (
                <ImageIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              )}
              <div>
                <div className="text-sm text-orange-600 dark:text-orange-400">{libelle}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {!product ? '—' : src ? 'Suit le produit affiché' : vide}
                </div>
              </div>
            </button>
          );
        })}
        {/* Le logo de l'entreprise ne dépend d'aucun produit : image fixe */}
        <button onClick={() => ajouterImageFixe(logoEntreprise)} disabled={!logoEntreprise} className={BOUTON_AJOUT}>
          {logoEntreprise ? (
            <img src={logoEntreprise.src} alt="" className="h-8 w-8 object-contain flex-none" loading="lazy" />
          ) : (
            <ImageIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          )}
          <div>
            <div className="text-sm text-gray-800 dark:text-gray-200">Logo de l’entreprise</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {logoEntreprise ? 'Image fixe, la même pour tous les produits' : 'L’entreprise n’a pas de logo (Réglages de l’entreprise)'}
            </div>
          </div>
        </button>
        <button onClick={ajouterQRProduit} disabled={!product} className={BOUTON_AJOUT}>
          <QrCode className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <div>
            <div className="text-sm text-orange-600 dark:text-orange-400">QR code vers la page du produit</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {!product ? '—' : product.website_url ? couper(product.website_url, 40) : 'Ce produit n’a pas d’adresse : le QR ne s’affichera pas'}
            </div>
          </div>
        </button>
        <div className={`${BOUTON_AJOUT} cursor-default hover:border-gray-200 hover:bg-transparent dark:hover:bg-transparent`}>
          <Barcode className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <div className="min-w-0">
            <div className="text-sm text-orange-600 dark:text-orange-400">Code-barres</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {!product ? '—' : codeBarres || 'Ce produit n’a pas de code-barres'}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {FORMATS_CODE_BARRES.map((f) => {
                const ok = formatCompatible(f, codeBarres);
                return (
                  <button
                    key={f.id}
                    onClick={() => ajouterCodeBarres(f)}
                    disabled={!product || !ok}
                    title={ok ? f.aide : `${f.aide} : ce numéro ne convient pas`}
                    className="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Carte>

      {/* Éditorial : les sections de la fiche produit */}
      <Carte icone={ListChecks} titre="Éditorial" aide="Les sections de la description du produit, mises en forme.">
        {SECTIONS_FICHE.map((section) => {
          const c = product ? contenuFiche(product.description, section.id) : null;
          return (
            <button key={section.id} onClick={() => ajouterFiche(section)} className={BOUTON_AJOUT}>
              <ListChecks className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <div>
                <div className="text-sm text-orange-600 dark:text-orange-400">Fiche : {section.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {!product
                    ? 'Contenu d’exemple tant qu’aucun produit n’est choisi'
                    : c
                      ? apercu({ type: 'fiche', section: section.id }, product)
                      : 'Absente de ce produit : ne s’affichera pas'}
                </div>
              </div>
            </button>
          );
        })}
      </Carte>
    </div>
  );
};

export default DonneesProduitPanel;
