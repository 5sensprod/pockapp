// frontend/modules/stick/labels/components/templates/UploadTemplate.jsx
//
// « Mes images » : la bibliothèque du POSTE (`presetImageService`, IndexedDB).
// Avec `origine="generation"`, la MÊME liste filtrée sur les images détourées
// (`lib/detourage.ts`) : sous-onglet « Génération », sans import — ces images
// viennent du bouton « Détourer » —, mêmes poses et même suppression.
// On importe, on clique une vignette pour la poser sur l'affiche — entière,
// centrée, à ses proportions.
//
// Refait le 3 octobre 2026. Les images D'ABORD : la zone en pointillés de
// 148 px, qui promettait un glisser-déposer jamais codé, est un bouton.
// **La corbeille est dans le COIN de la vignette** : elle apparaissait au
// centre, là où l'on clique pour ajouter l'image, avec le seul `confirm()` du
// navigateur pour filet. La grille ne défile plus dans le panneau qui défile.
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Scissors, Trash2 } from 'lucide-react';
import presetImageService from '../../services/presetImageService';
import useLabelStore from '../../store/useLabelStore';
import { cadreSurCanvas } from '../../utils/imagePlacement';
import { AJUSTEMENT_NOUVELLE_IMAGE } from '../../utils/ajustementImage';
import { useConfirmModal } from '../../ui/useConfirmModal';
import { useEtatDetourage } from '../../lib/detourage';
import Bouton from '../ui/Bouton';
import EtatVide from '../ui/EtatVide';
import GrilleVignettes from '../ui/GrilleVignettes';
import Note from '../ui/Note';
import TitreGroupe from '../ui/TitreGroupe';
import Vignette from '../ui/Vignette';
import { PANNEAU } from '../ui/styles';

const UploadTemplate = ({ onImageSelected, origine = 'import' }) => {
  const generation = origine === 'generation';
  const { addElementCentre } = useLabelStore();
  const [availableImages, setAvailableImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const { confirm, ConfirmModal } = useConfirmModal();

  const fileInputRef = useRef(null);

  // Une image vient d'être rangée par un détourage : la liste « Génération » s'y relit
  const rangees = useEtatDetourage((s) => s.rangees);

  // Charger les images au montage
  useEffect(() => {
    loadImages();
  }, [rangees]);

  /**
   * Charger la bibliothèque d'images
   */
  const loadImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const images = generation
        ? await presetImageService.listerGenerees()
        : await presetImageService.listerImportees();
      setAvailableImages(images || []);
    } catch (err) {
      console.error('❌ Erreur chargement images:', err);
      setError('Impossible de charger les images');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Charger l'image pour obtenir ses dimensions naturelles
   */
  const loadImageDimensions = (src) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        resolve({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          aspectRatio: img.naturalWidth / img.naturalHeight,
        });
      };
      img.onerror = () => {
        // Fallback si l'image ne charge pas
        resolve({
          naturalWidth: 160,
          naturalHeight: 160,
          aspectRatio: 1,
        });
      };
      img.src = src;
    });
  };

  /**
   * Ajouter une image au canvas en préservant ses proportions
   */
  const addImageToCanvas = async (image) => {
    // Charger les dimensions naturelles de l'image
    const { aspectRatio } = await loadImageDimensions(image.src);

    addElementCentre({
      type: 'image',
      id: undefined,
      // À la taille du canvas, entière et centrée
      ...cadreSurCanvas(aspectRatio, useLabelStore.getState().canvasSize),
      ...AJUSTEMENT_NOUVELLE_IMAGE, // Contenir : la photo entière, quel que soit le produit
      src: image.src,
      filename: image.filename,
      opacity: 1,
      rotation: 0,
      visible: true,
      locked: false,
      // Stocker le ratio original pour référence future
      aspectRatio: aspectRatio,
    });
  };

  /**
   * Gérer l'upload de fichiers
   */
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    setError(null);

    try {
      const result = await presetImageService.uploadImages(files);

      if (result.images?.length > 0) {
        // Recharger la bibliothèque
        await loadImages();

        // Ajouter automatiquement la première image uploadée au canvas
        const firstImage = result.images[0];
        await addImageToCanvas(firstImage);

        // Callback externe si fourni
        if (onImageSelected) {
          onImageSelected({
            src: firstImage.src,
            filename: firstImage.filename,
          });
        }
      }
    } catch (err) {
      console.error('❌ Erreur upload:', err);
      setError('Import impossible');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Supprimer une image
   */
  const handleDelete = async (filename, e) => {
    e.stopPropagation();

    const ok = await confirm({
      title: 'Supprimer l’image ?',
      message: `Elle sera retirée de ce poste.\nImage : « ${filename} »`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await presetImageService.deleteImage(filename);
      await loadImages();
    } catch (err) {
      console.error('❌ Erreur suppression:', err);
      setError("Impossible de supprimer l'image");
    }
  };

  /**
   * Ajouter une image de la bibliothèque au canvas
   */
  const handleImageClick = async (image) => {
    // Ajouter au canvas avec proportions préservées
    await addImageToCanvas(image);

    // Callback externe si fourni
    if (onImageSelected) {
      onImageSelected({
        src: image.src,
        filename: image.filename,
      });
    }
  };

  return (
    <div className={`${PANNEAU} h-full overflow-y-auto`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      {!generation && (
      <Bouton
        plein
        icone={Upload}
        onClic={() => fileInputRef.current?.click()}
        desactive={uploading}
        titre="PNG ou JPG, 10 Mo au plus. La première image importée est posée sur l’affiche."
      >
        {uploading ? 'Import en cours…' : 'Importer des images'}
      </Bouton>
      )}

      {error && (
        <Note
          ton="erreur"
          action={
            <Bouton variante="discret" onClic={() => setError(null)}>
              Fermer
            </Bouton>
          }
        >
          {error}
        </Note>
      )}

      <div className="space-y-2">
        <TitreGroupe
          titre={generation ? 'Génération' : 'Mes images'}
          compte={availableImages.length}
          action={
            !loading &&
            availableImages.length > 0 && (
              <Bouton variante="discret" onClic={loadImages}>
                Actualiser
              </Bouton>
            )
          }
        />

        {loading ? (
          <EtatVide chargement />
        ) : availableImages.length === 0 ? (
          generation ? (
            <EtatVide
              icone={Scissors}
              titre="Aucune image détourée."
              detail="Les images détourées avec le bouton « Détourer » d'une image de l'affiche sont rangées ici."
            />
          ) : (
            <EtatVide icone={ImageIcon} titre="Aucune image importée." />
          )
        ) : (
          <GrilleVignettes colonnes={3}>
            {availableImages.map((image) => (
              <Vignette
                key={image.filename}
                src={image.src}
                nom={image.filename}
                onClic={() => handleImageClick(image)}
                action={
                  <button
                    type="button"
                    onClick={(e) => handleDelete(image.filename, e)}
                    title="Supprimer cette image"
                    aria-label={`Supprimer ${image.filename}`}
                    className="h-6 w-6 inline-flex items-center justify-center rounded-md bg-white/90 text-red-600 shadow-sm ring-1 ring-gray-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                }
              />
            ))}
          </GrilleVignettes>
        )}
      </div>

      <ConfirmModal />
    </div>
  );
};

export default UploadTemplate;
