// frontend/modules/stick/labels/components/templates/TemplateManager.jsx
//
// « Mes modèles » : les modèles enregistrés sur CE poste (`templateService`,
// IndexedDB). On enregistre l'affiche en cours, on en rouvre une, on renomme,
// duplique, exporte en `.json`, importe, supprime.
//
// Reste MONTÉ même quand on regarde « Modèles prêts » (`OngletsPanneau`) : il
// écoute `request-template-save`, envoyé par `LabelPage`.
//
// Refait le 3 octobre 2026 : l'en-tête tient en deux rangées (recherche,
// importer, enregistrer ; puis les catégories) — il en faisait ~170 px avec
// son titre répété ; les deux fenêtres (enregistrer, modifier), copies l'une
// de l'autre, n'en font plus qu'une ; les messages n'ont plus d'émoji.
import React, { useState, useEffect, useRef } from 'react';
import { Save, FolderOpen, Upload } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import templateService from '../../services/templateService';
import { filtrerModeles } from '../../utils/modeles';
import { ouvrirModele } from '../../utils/ouvrirModele';
import TemplateGrid from '../ui/TemplateGrid';
import Bouton from '../ui/Bouton';
import ChampRecherche from '../ui/ChampRecherche';
import EtatVide from '../ui/EtatVide';
import Segments from '../ui/Segments';
import { BOUTON_ICONE, CHAMP } from '../ui/styles';

import { useActionToasts } from '../../ui/useActionToasts';
import { useConfirmModal } from '../../ui/useConfirmModal';

// Les identifiants sont ceux des modèles enregistrés ; seuls les mots changent
const CATEGORIES = [
  { id: 'all', label: 'Tous' },
  { id: 'custom', label: 'Libres' },
  { id: 'product', label: 'Produits' },
  { id: 'sheet', label: 'Planches' },
];

const TemplateManager = ({ stageRef, docNode }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Données du store
  const elements = useLabelStore((s) => s.elements);
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const sheetSettings = useLabelStore((s) => s.sheetSettings);
  const lockCanvasToSheetCell = useLabelStore((s) => s.lockCanvasToSheetCell);
  const dataSource = useLabelStore((s) => s.dataSource);

  const fileInputRef = useRef(null);

  const { success, error } = useActionToasts();
  const { confirm, ConfirmModal } = useConfirmModal();

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Écouteur pour ouvrir le modal de sauvegarde depuis la toolbar
  useEffect(() => {
    const handleSaveRequest = () => {
      setShowSaveModal(true);
    };

    window.addEventListener('request-template-save', handleSaveRequest);
    return () => window.removeEventListener('request-template-save', handleSaveRequest);
  }, []);

  // Écouteur pour rafraîchir la liste après une mise à jour
  useEffect(() => {
    const handleTemplateUpdated = () => {
      loadTemplates();
    };

    window.addEventListener('template-updated', handleTemplateUpdated);
    return () => window.removeEventListener('template-updated', handleTemplateUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Charge tous les modèles du poste
   */
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const allTemplates = await templateService.listTemplates();

      // Les modèles d'usine sont dans « Modèles prêts »
      setTemplates(allTemplates.filter((t) => t.is_factory !== true));
    } catch (err) {
      console.error('❌ Erreur chargement templates:', err);
      error('Impossible de charger les modèles');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Enregistre l'affiche en cours comme modèle
   */
  const handleSaveTemplate = async (metadata) => {
    try {
      // Désélectionner tout avant de capturer (évite le transformer visible)
      const clearSelection = useLabelStore.getState().clearSelection;
      clearSelection();

      // Attendre un peu pour que le render soit effectif
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Générer une miniature avec docNode (logique exportPdf)
      const thumbnail = await templateService.generateThumbnail(stageRef, {
        width: 400,
        height: 300,
        docNode: docNode,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      });

      const templateData = {
        elements,
        canvasSize,
        sheetSettings,
        lockCanvasToSheetCell,
        dataSource,
      };

      await templateService.saveTemplate(templateData, {
        ...metadata,
        thumbnail,
      });

      await loadTemplates();
      setShowSaveModal(false);
      success('Modèle enregistré');
    } catch (err) {
      console.error('❌ Erreur sauvegarde:', err);
      error('Enregistrement impossible');
    }
  };

  /**
   * Ouvre un modèle — règle partagée avec « Modèles prêts » (`utils/ouvrirModele.js`)
   */
  const handleLoadTemplate = async (template) => {
    try {
      const ouvert = await ouvrirModele(template, { store: useLabelStore.getState(), confirm });
      if (ouvert) success('Modèle ouvert');
    } catch (err) {
      console.error('❌ Erreur chargement template:', err);
      error('Ouverture impossible');
    }
  };

  /**
   * Supprime un modèle
   */
  const handleDeleteTemplate = async (template) => {
    const ok = await confirm({
      title: 'Supprimer le modèle ?',
      message: `Cette action est irréversible.\nModèle : « ${template.name} »`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await templateService.deleteTemplate(template.id);
      await loadTemplates();
      success('Modèle supprimé');
    } catch (err) {
      console.error('❌ Erreur suppression:', err);
      error('Suppression impossible');
    }
  };

  /**
   * Duplique un modèle
   */
  const handleDuplicateTemplate = async (id) => {
    try {
      await templateService.duplicateTemplate(id);
      await loadTemplates();
      success('Modèle dupliqué');
    } catch (err) {
      console.error('❌ Erreur duplication:', err);
      error('Duplication impossible');
    }
  };

  /**
   * Exporte un modèle
   */
  const handleExportTemplate = async (id) => {
    try {
      await templateService.exportTemplate(id);
      success('Export démarré');
    } catch (err) {
      console.error('❌ Erreur export:', err);
      error('Export impossible');
    }
  };

  /**
   * Importe un modèle
   */
  const handleImportTemplate = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await templateService.importTemplate(file);
      await loadTemplates();
      success('Modèle importé');
    } catch (err) {
      console.error('❌ Erreur import:', err);
      error('Import impossible');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredTemplates = filtrerModeles(templates, { terme: searchQuery, categorie: selectedCategory });
  const filtre = Boolean(searchQuery) || selectedCategory !== 'all';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-none px-3 py-2 space-y-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1.5">
          <ChampRecherche valeur={searchQuery} onValeur={setSearchQuery} placeholder="Chercher un modèle…" className="flex-1 min-w-0" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Importer un modèle (.json)"
            aria-label="Importer un modèle (.json)"
            className={BOUTON_ICONE}
          >
            <Upload className="h-4 w-4" />
          </button>
          <Bouton variante="principal" icone={Save} onClic={() => setShowSaveModal(true)} titre="Enregistrer l’affiche en cours comme modèle">
            Enregistrer
          </Bouton>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportTemplate} className="hidden" />
        </div>
        <Segments label="Catégorie" options={CATEGORIES} valeur={selectedCategory} onValeur={setSelectedCategory} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <EtatVide chargement />
        ) : filteredTemplates.length === 0 ? (
          <EtatVide
            icone={FolderOpen}
            titre={filtre ? 'Aucun modèle ne correspond.' : 'Aucun modèle enregistré.'}
            action={!filtre && <Bouton onClic={() => setShowSaveModal(true)}>Enregistrer cette affiche</Bouton>}
          />
        ) : (
          <TemplateGrid
            templates={filteredTemplates}
            onLoad={handleLoadTemplate}
            onDelete={handleDeleteTemplate}
            onEdit={setEditingTemplate}
            onDuplicate={handleDuplicateTemplate}
            onExport={handleExportTemplate}
            detail={(t) => (t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('fr-FR') : null)}
          />
        )}
      </div>

      {showSaveModal && <FenetreModele onSave={handleSaveTemplate} onClose={() => setShowSaveModal(false)} />}

      {editingTemplate && (
        <FenetreModele
          modele={editingTemplate}
          onSave={async (metadata) => {
            try {
              await templateService.updateTemplate(editingTemplate.id, metadata);
              await loadTemplates();
              setEditingTemplate(null);
              success('Modèle mis à jour');
            } catch (err) {
              console.error('❌ Erreur update:', err);
              error('Mise à jour impossible');
            }
          }}
          onClose={() => setEditingTemplate(null)}
        />
      )}

      <ConfirmModal />
    </div>
  );
};

const LIBELLE = 'block mb-1 text-xs font-medium text-gray-700 dark:text-gray-300';

/**
 * La fenêtre d'un modèle : l'enregistrer (sans `modele`) ou le modifier. Les
 * deux étaient deux copies du même formulaire.
 */
const FenetreModele = ({ modele, onSave, onClose }) => {
  const [name, setName] = useState(modele?.name ?? '');
  const [description, setDescription] = useState(modele?.description ?? '');
  const [category, setCategory] = useState(modele?.category ?? 'custom');
  const [tags, setTags] = useState((modele?.tags || []).join(', '));
  const [errorName, setErrorName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorName('Le nom est obligatoire');
      return;
    }
    setErrorName('');

    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-800 shadow-lg">
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
            {modele ? 'Modifier le modèle' : 'Enregistrer le modèle'}
          </h3>

          <div>
            <label className={LIBELLE}>Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Étiquette prix 63 × 38"
              autoFocus
              required
              className={`${CHAMP} w-full ${errorName ? 'border-red-500' : ''}`}
            />
            {errorName && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{errorName}</p>}
          </div>

          <div>
            <label className={LIBELLE}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-transparent bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className={LIBELLE}>Catégorie</label>
            <Segments
              label="Catégorie du modèle"
              valeur={category}
              onValeur={setCategory}
              options={[
                { id: 'custom', label: 'Libre' },
                { id: 'product', label: 'Produit' },
                { id: 'sheet', label: 'Planche' },
              ]}
            />
          </div>

          <div>
            <label className={LIBELLE}>Étiquettes, séparées par des virgules</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="prix, promo, vitrine"
              className={`${CHAMP} w-full`}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Bouton onClic={onClose}>Annuler</Bouton>
            <button
              type="submit"
              className="h-7 px-3 inline-flex items-center justify-center text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TemplateManager;
