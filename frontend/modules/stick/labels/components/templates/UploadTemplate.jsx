// src/features/labels/components/templates/UploadTemplate.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Trash2, Loader2, AlertCircle, X } from 'lucide-react';
import presetImageService from '../../services/presetImageService';
import useLabelStore from '../../store/useLabelStore';

/**
 * UploadTemplate - Composant d'upload et gestion des images
 * Réutilise la logique de presetImageService
 *
 * ✅ AMÉLIORATION : Ajout automatique au canvas avec proportions préservées
 */
const UploadTemplate = ({ onImageSelected }) => {
  const { addElement, elements } = useLabelStore();
  const [availableImages, setAvailableImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedImageId, setSelectedImageId] = useState(null);

  const fileInputRef = useRef(null);

  // Charger les images au montage
  useEffect(() => {
    loadImages();
  }, []);

  /**
   * Charger la bibliothèque d'images
   */
  const loadImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const images = await presetImageService.listImages();
      console.log('📚 Images chargées:', images);
      setAvailableImages(images || []);
    } catch (err) {
      console.error('❌ Erreur chargement images:', err);
      setError('Impossible de charger les images');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🆕 Charger l'image pour obtenir ses dimensions naturelles
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
   * ✅ Ajouter une image au canvas en préservant ses proportions
   */
  const addImageToCanvas = async (image) => {
    // Charger les dimensions naturelles de l'image
    const { naturalWidth, naturalHeight, aspectRatio } = await loadImageDimensions(image.src);

    console.log('📐 Upload - Dimensions naturelles:', { naturalWidth, naturalHeight, aspectRatio });

    // Définir une taille de base (ex: largeur de 160px)
    const baseWidth = 160;
    const calculatedHeight = Math.round(baseWidth / aspectRatio);

    console.log('✅ Upload - Dimensions calculées:', {
      width: baseWidth,
      height: calculatedHeight,
    });

    addElement({
      type: 'image',
      id: undefined,
      x: 50,
      y: 50 + elements.length * 30,
      width: baseWidth,
      height: calculatedHeight, // 🔥 Hauteur calculée pour préserver le ratio
      src: image.src,
      filename: image.filename,
      opacity: 1,
      rotation: 0,
      visible: true,
      locked: false,
      // 🆕 Stocker le ratio original pour référence future
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
      console.log('✅ Upload réussi:', result);

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

        setSelectedImageId(firstImage.filename);
      }
    } catch (err) {
      console.error('❌ Erreur upload:', err);
      setError("Erreur lors de l'upload des images");
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

    if (!confirm(`Supprimer "${filename}" ?`)) return;

    try {
      await presetImageService.deleteImage(filename);
      await loadImages();

      if (selectedImageId === filename) {
        setSelectedImageId(null);
      }
    } catch (err) {
      console.error('❌ Erreur suppression:', err);
      setError("Impossible de supprimer l'image");
    }
  };

  /**
   * ✅ Sélectionner et ajouter une image au canvas
   */
  const handleImageClick = async (image) => {
    setSelectedImageId(image.filename);

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
    <div className="p-4 space-y-4">
      {/* Zone d'upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                <span className="text-sm font-medium text-blue-600">Upload en cours...</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm font-medium">Importer une image</span>
                <span className="text-xs text-gray-500">PNG, JPG jusqu'à 10MB</span>
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  🎯 Ajout automatique au canvas
                </span>
              </>
            )}
          </div>
        </button>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-600 hover:text-red-700 mt-1"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Bibliothèque d'images */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Bibliothèque ({availableImages.length})
          </h3>
          {!loading && availableImages.length > 0 && (
            <button
              onClick={loadImages}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Actualiser
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
          </div>
        ) : availableImages.length === 0 ? (
          <div className="text-center py-8">
            <ImageIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Aucune image dans la bibliothèque</p>
            <p className="text-xs text-gray-400 mt-1">Uploadez votre première image</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
            {availableImages.map((image) => {
              const isSelected = selectedImageId === image.filename;

              return (
                <button
                  key={image.filename}
                  onClick={() => handleImageClick(image)}
                  className={`relative group aspect-square border-2 rounded-lg overflow-hidden transition-all ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'
                  }`}
                >
                  <img
                    src={image.src}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Overlay au hover */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => handleDelete(image.filename, e)}
                      className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-transform hover:scale-110"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Badge de sélection */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Nom du fichier */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-xs text-white truncate" title={image.filename}>
                      {image.filename}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadTemplate;
