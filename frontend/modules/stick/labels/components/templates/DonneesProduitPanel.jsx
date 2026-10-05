// frontend/modules/stick/labels/components/templates/DonneesProduitPanel.jsx
//
// L'onglet « Données produit » : on y AJOUTE ce qui vient de la fiche — un
// texte lié, champ par champ, la photo du produit, le logo de sa marque, le QR
// vers sa page, son code-barres, les sections de sa fiche
// (`utils/ajoutsProduit.js`) : c'est le SEUL endroit où ils s'ajoutent liés.
// Les onglets Texte, Médias et Formes n'ajoutent que du statique (le choix du
// format du code-barres est ici, grisé quand le numéro ne s'y plie pas).
//
// Puis, d'un coup d'œil, quels éléments de l'affiche sont liés, à quel champ,
// avec quelle valeur pour le produit affiché — et on change la liaison ici,
// par le MÊME bloc que les réglages (`LiaisonProduit`).
//
// Refait le 3 octobre 2026 : ajouter D'ABORD (c'est ce qu'on vient faire, et
// la liste est vide au début), la liste ensuite ; trois groupes à filets au
// lieu de trois cartes encadrées à phrase d'aide — ~1 400 px devenus ~650. Le
// rangement dit ce que disaient les phrases : sous « Textes » le numéro du
// code-barres arrive en TEXTE, sous « Images et codes » en barres DESSINÉES.
// Le logo de l'entreprise, qui n'est lié à rien, n'est plus ici : Médias ›
// PocketStock.
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
import { champsPourType, elementsLies, libelleLiaison, photosGalerie } from '../../utils/champsProduit';
import { getProductField, resolvePropForElement } from '../../utils/dataBinding';
import { SECTIONS_FICHE, contenuFiche } from '../../utils/ficheProduit';
import {
  FORMATS_CODE_BARRES,
  ajouterCodeBarres,
  ajouterFiche,
  ajouterImageLiee,
  ajouterPhotoProduit,
  ajouterQRProduit,
  formatCompatible,
} from '../../utils/ajoutsProduit';
import { mesurerTexte } from '../../utils/mesurerTexte';
import Bouton from '../ui/Bouton';
import CarteProposition from '../ui/CarteProposition';
import GrilleVignettes from '../ui/GrilleVignettes';
import LigneListe from '../ui/LigneListe';
import Note from '../ui/Note';
import Section from '../ui/Section';
import TitreGroupe from '../ui/TitreGroupe';
import Vignette from '../ui/Vignette';
import { AIDE, PANNEAU, TUILE_PRODUIT } from '../ui/styles';

const ICONES = { text: TypeIcon, image: ImageIcon, qrcode: QrCode, barcode: Barcode, fiche: ListChecks };

/** Style d'un texte ajouté, selon le champ : les prix se voient. */
const STYLE_TEXTE = {
  price: { fontSize: 48, bold: true, color: '#ef4444' },
  sale_price: { fontSize: 48, bold: true, color: '#22c55e' },
  name: { fontSize: 32, bold: true },
  description: { fontSize: 14, bold: false },
};

const ORANGE = 'text-orange-600 dark:text-orange-400';

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

/** Ce qu'une vignette montre quand le produit n'a pas cette image. */
const SansImage = ({ texte }) => (
  <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400">
    <ImageIcon className="h-4 w-4" />
    {texte && <span className="text-[10px] leading-tight text-center">{texte}</span>}
  </span>
);

const DonneesProduitPanel = ({ onOpenTool }) => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const selectElement = useLabelStore((s) => s.selectElement);
  const updateElement = useLabelStore((s) => s.updateElement);
  const addElementCentre = useLabelStore((s) => s.addElementCentre);
  const product = useLabelStore((s) => s.selectedProduct);

  const lies = elementsLies(elements);
  const galerie = photosGalerie(product);
  const codeBarres = product ? String(getProductField(product, 'barcode') ?? '') : '';
  const photo = product?.image?.src;

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
    <div className={PANNEAU}>
      {/* Le produit dont on voit les valeurs */}
      {product ? (
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={product.name}>
          Aperçu : <span className={`font-medium ${ORANGE}`}>{product.name}</span>
        </div>
      ) : (
        <Note
          ton="produit"
          action={
            onOpenTool && (
              <Bouton variante="secondaire" icone={Package} onClic={() => onOpenTool('sheet')}>
                Ajouter des produits
              </Bouton>
            )
          }
        >
          Aucun produit choisi.
        </Note>
      )}

      {/* Textes : chaque champ arrive en texte, sa valeur telle quelle */}
      <div className="space-y-2">
        <TitreGroupe titre="Textes" />
        <GrilleVignettes colonnes={2}>
          {champsPourType('text').map((champ) => (
            <button
              key={champ.cle}
              type="button"
              onClick={() => ajouterTexte(champ)}
              disabled={!product}
              className={`${TUILE_PRODUIT} h-10 min-w-0 px-2 flex flex-col justify-center text-left`}
            >
              <span className={`truncate text-xs ${ORANGE}`}>{champ.libelle}</span>
              <span className="truncate text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                {product ? couper(apercu({ type: 'text', dataBinding: champ.cle }, product), 40) : '—'}
              </span>
            </button>
          ))}
        </GrilleVignettes>
      </div>

      {/* Images et codes : photo, logo, galerie, QR, code-barres DESSINÉ (`ajoutsProduit.js`) */}
      <div className="space-y-2">
        <TitreGroupe titre="Images et codes" />
        <GrilleVignettes colonnes={3}>
          <Vignette produit montrerNom nom="Photo" src={photo} desactive={!product} onClic={() => ajouterPhotoProduit()}>
            <SansImage texte={product ? 'Pas de photo' : ''} />
          </Vignette>
          {/* Images de PocketStock liées au produit : elles changent avec lui */}
          {[
            ['brand_image', 'Logo marque', 'Pas de logo'],
            ['category_image', 'Catégorie', 'Pas d’image'],
          ].map(([cle, libelle, vide]) => (
            <Vignette
              key={cle}
              produit
              montrerNom
              nom={libelle}
              src={product ? getProductField(product, cle) : ''}
              desactive={!product}
              onClic={() => ajouterImageLiee(cle)}
            >
              <SansImage texte={product ? vide : ''} />
            </Vignette>
          ))}
        </GrilleVignettes>

        {galerie.length > 0 && (
          <div className="space-y-1" title="Liée au même rang pour chaque produit">
            <TitreGroupe titre="Autres photos" compte={galerie.length} />
            <GrilleVignettes colonnes={4}>
              {galerie.map((photoGalerie) => (
                <Vignette
                  key={photoGalerie.cle}
                  produit
                  nom={photoGalerie.libelle}
                  src={photoGalerie.src}
                  onClic={() => ajouterPhotoProduit(photoGalerie)}
                />
              ))}
            </GrilleVignettes>
          </div>
        )}

        <div>
          <CarteProposition
            disposition="ligne"
            produit
            icone={QrCode}
            titre="QR vers la page du produit"
            detail={!product ? '—' : product.website_url ? couper(product.website_url, 40) : 'Pas de page sur le site'}
            desactive={!product}
            onAjout={ajouterQRProduit}
          />
          {/* Le code-barres : pas un bouton, on choisit SON FORMAT */}
          <div className="px-2 py-1 flex items-start gap-2">
            <Barcode className="mt-0.5 h-4 w-4 flex-none text-orange-500" />
            <div className="flex-1 min-w-0">
              <div className={`truncate text-xs ${ORANGE}`}>Code-barres</div>
              <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                {!product ? '—' : codeBarres || 'Pas de code-barres'}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {FORMATS_CODE_BARRES.map((f) => {
                  const ok = formatCompatible(f, codeBarres);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => ajouterCodeBarres(f)}
                      disabled={!product || !ok}
                      title={ok ? f.aide : `${f.aide} : ce numéro ne convient pas`}
                      className={`${TUILE_PRODUIT} h-6 px-1.5 text-[11px] text-gray-700 dark:text-gray-300`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fiche produit : les sections de la description, mises en forme */}
      <div className="space-y-1">
        <TitreGroupe titre="Fiche produit" />
        <div>
          {SECTIONS_FICHE.map((section) => {
            const c = product ? contenuFiche(product.description, section.id) : null;
            return (
              <CarteProposition
                key={section.id}
                disposition="ligne"
                produit
                icone={ListChecks}
                titre={section.label}
                detail={!product ? 'Exemple' : c ? apercu({ type: 'fiche', section: section.id }, product) : 'Absente'}
                titreInfobulle={
                  !product
                    ? 'Contenu d’exemple tant qu’aucun produit n’est choisi'
                    : c
                      ? undefined
                      : 'Absente de ce produit : ne s’affichera pas'
                }
                onAjout={() => ajouterFiche(section)}
              />
            );
          })}
        </div>
      </div>

      {/* Ce qui est lié sur l'affiche, et sa liaison */}
      <Section titre={`Sur l’affiche · ${lies.length}`}>
        {lies.length === 0 ? (
          <p className={AIDE}>Aucun élément lié à la fiche produit.</p>
        ) : (
          <div className="space-y-0.5">
            {lies.map((el) => {
              const actif = el.id === selectedId;
              return (
                <div key={el.id}>
                  <LigneListe
                    produit
                    actif={actif}
                    icone={ICONES[el.type] ?? LinkIcon}
                    titre={<span className={ORANGE}>{libelleLiaison(el)}</span>}
                    detail={couper(apercu(el, product), 60) || '—'}
                    onClic={() => !el.locked && selectElement(el.id)}
                    title={el.locked ? 'Élément verrouillé' : 'Sélectionner l’élément'}
                  />
                  {actif && (
                    <div className="px-2 py-1.5">
                      <LiaisonProduit element={el} product={product} onUpdate={(patch) => updateElement(el.id, patch)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
};

export default DonneesProduitPanel;
