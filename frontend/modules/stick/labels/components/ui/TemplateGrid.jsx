// frontend/modules/stick/labels/components/ui/TemplateGrid.jsx
//
// LA GRILLE DES MODÈLES, la même pour « Mes modèles » et « Modèles prêts » :
// deux colonnes en maçonnerie (un aperçu garde les proportions de sa page), le
// nom et un détail dessous.
//
// Refait le 3 octobre 2026 :
// - **le menu « ⋯ » existe AUSSI sans aperçu**. Il n'était rendu que dans la
//   branche `template.thumbnail` : un modèle sans aperçu ne pouvait être ni
//   renommé, ni dupliqué, ni supprimé ;
// - le menu est une LISTE À LIBELLÉS — c'était une colonne d'icônes muettes ;
// - ni ombre ni dégradé : un anneau d'un pixel, bleu au survol.
//
// `actions` absent (les modèles prêts) : pas de menu.

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Download, FileText, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react';

const ENTREE = 'w-full h-7 px-2 flex items-center gap-2 rounded-md text-xs text-left';
const ENTREE_NEUTRE = `${ENTREE} text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700`;
const ENTREE_ROUGE = `${ENTREE} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`;

const CarteModele = ({ modele, menuOuvert, onMenu, onOuvrir, actions, detail, icone: Icone = FileText }) => {
  const boutonMenu = useRef(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  // Le menu est en `fixed` : il ne pousse pas la grille et sort du panneau
  useEffect(() => {
    if (menuOuvert && boutonMenu.current) {
      const cadre = boutonMenu.current.getBoundingClientRect();
      setPosition({ top: cadre.bottom + 4, right: window.innerWidth - cadre.right });
    }
  }, [menuOuvert]);

  const lancer = (action) => (e) => {
    e.stopPropagation();
    onMenu(false);
    action();
  };

  return (
    <div className="break-inside-avoid mb-3 group">
      <div
        role="button"
        tabIndex={0}
        onClick={onOuvrir}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOuvrir();
          }
        }}
        title={`Ouvrir « ${modele.name} »`}
        className="relative rounded-md overflow-hidden cursor-pointer bg-white ring-1 ring-inset ring-gray-200 dark:ring-gray-600 hover:ring-2 hover:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
      >
        {modele.thumbnail ? (
          <img src={modele.thumbnail} alt="" className="block w-full h-auto object-contain" loading="lazy" />
        ) : (
          <div className="w-full aspect-[4/3] flex items-center justify-center bg-gray-100 dark:bg-gray-700">
            <Icone className="h-6 w-6 text-gray-400" />
          </div>
        )}

        {actions && (
          <button
            ref={boutonMenu}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMenu(!menuOuvert);
            }}
            title="Modifier, dupliquer, exporter, supprimer"
            aria-label={`Actions sur ${modele.name}`}
            aria-expanded={menuOuvert}
            className={`absolute top-1 right-1 h-6 w-6 inline-flex items-center justify-center rounded-md bg-white/90 text-gray-700 ring-1 ring-gray-200 hover:bg-white ${
              menuOuvert ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>

      {menuOuvert && actions && (
        <>
          <div
            className="fixed inset-0 z-[200]"
            onClick={(e) => {
              e.stopPropagation();
              onMenu(false);
            }}
          />
          <div
            role="menu"
            className="fixed z-[300] w-40 p-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
            style={{ top: `${position.top}px`, right: `${position.right}px` }}
          >
            <button type="button" role="menuitem" onClick={lancer(onOuvrir)} className={ENTREE_NEUTRE}>
              <Play className="h-3.5 w-3.5" />
              Ouvrir
            </button>
            <button type="button" role="menuitem" onClick={lancer(actions.modifier)} className={ENTREE_NEUTRE}>
              <Pencil className="h-3.5 w-3.5" />
              Modifier…
            </button>
            <button type="button" role="menuitem" onClick={lancer(actions.dupliquer)} className={ENTREE_NEUTRE}>
              <Copy className="h-3.5 w-3.5" />
              Dupliquer
            </button>
            <button type="button" role="menuitem" onClick={lancer(actions.exporter)} className={ENTREE_NEUTRE}>
              <Download className="h-3.5 w-3.5" />
              Exporter (.json)
            </button>
            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
            <button type="button" role="menuitem" onClick={lancer(actions.supprimer)} className={ENTREE_ROUGE}>
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
          </div>
        </>
      )}

      <div className="mt-1 px-0.5">
        <h3 className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate" title={modele.name}>
          {modele.name}
        </h3>
        {detail && <p className="text-[11px] leading-tight text-gray-500 dark:text-gray-400 line-clamp-2">{detail}</p>}
      </div>
    </div>
  );
};

/**
 * `templates` : les modèles. `onLoad(modele)` : l'ouvrir.
 * `onEdit` / `onDuplicate` / `onExport` / `onDelete` : le menu — tous absents,
 * pas de menu. `detail(modele)` : la ligne grise ; `icone(modele)` : ce que
 * montre une carte sans aperçu.
 */
const TemplateGrid = ({ templates, onLoad, onEdit, onDuplicate, onExport, onDelete, detail, icone }) => {
  const [menuOuvertId, setMenuOuvertId] = useState(null);
  const avecMenu = Boolean(onEdit && onDuplicate && onExport && onDelete);

  return (
    <div className="columns-2 gap-2">
      {templates.map((modele) => {
        const id = modele.id ?? modele._id;
        return (
          <CarteModele
            key={id}
            modele={modele}
            menuOuvert={menuOuvertId === id}
            onMenu={(ouvert) => setMenuOuvertId(ouvert ? id : null)}
            onOuvrir={() => onLoad(modele)}
            detail={detail?.(modele)}
            icone={icone?.(modele)}
            actions={
              avecMenu
                ? {
                    modifier: () => onEdit(modele),
                    dupliquer: () => onDuplicate(modele.id),
                    exporter: () => onExport(modele.id),
                    supprimer: () => onDelete(modele),
                  }
                : null
            }
          />
        );
      })}
    </div>
  );
};

export default TemplateGrid;
