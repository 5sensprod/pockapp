// frontend/modules/stick/labels/components/templates/AssetsPanel.jsx
//
// L'onglet « Formes » : les cinq formes et le QR code STATIQUE, dans une seule
// grille (3 octobre 2026). Avant, deux sous-onglets — `ShapeTemplates` et
// `QRCodeTemplates`, fondus ici —, dont un entier pour un seul bouton.
//
// Les formes : l'onglet existait dans AppPos, mais ses boutons ne faisaient
// rien — aucun `onClick`, et le canvas ne savait pas rendre un élément
// `shape`. Les deux manques sont comblés ici et dans `canvas/ShapeNode.jsx`.
//
// Le QR code d'ici encode une valeur FIXE, la même pour tous les produits, à
// saisir dans ses réglages. Le QR LIÉ à l'adresse du produit sur le site
// s'ajoute depuis l'onglet « Données produit » (`utils/ajoutsProduit.js`,
// `ajouterQRProduit`) — depuis le 29 septembre 2026.

import React, { useState } from 'react';
import { Circle, Minus, QrCode, Square, Star, Triangle } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { QR_PAR_DEFAUT } from '../../utils/ajoutsProduit';
import CarteProposition from '../ui/CarteProposition';
import GrilleVignettes from '../ui/GrilleVignettes';
import LienProduit from '../ui/LienProduit';
import PastilleCouleur from '../ui/PastilleCouleur';
import { LIGNE, PANNEAU } from '../ui/styles';

const FORMES = [
  { id: 'rectangle', label: 'Rectangle', icon: Square, width: 200, height: 120 },
  { id: 'circle', label: 'Cercle', icon: Circle, width: 160, height: 160 },
  { id: 'triangle', label: 'Triangle', icon: Triangle, width: 160, height: 160 },
  { id: 'star', label: 'Étoile', icon: Star, width: 160, height: 160 },
  { id: 'line', label: 'Trait', icon: Minus, width: 220, height: 8 },
];

const COULEURS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#0f172a', '#ffffff'];

const QR_VALEUR_PAR_DEFAUT = 'https://example.com';

const AssetsPanel = ({ onOpenTool }) => {
  const addElementCentre = useLabelStore((s) => s.addElementCentre);
  const [couleur, setCouleur] = useState('#3b82f6');

  const handleAddShape = (forme) => {
    addElementCentre({
      type: 'shape',
      shape: forme.id,
      id: undefined,
      width: forme.width,
      height: forme.height,
      fill: couleur,
      // Une forme blanche serait invisible sur une planche blanche : on lui
      // pose un contour, aux autres non.
      stroke: couleur.toLowerCase() === '#ffffff' ? '#0f172a' : '',
      strokeWidth: couleur.toLowerCase() === '#ffffff' ? 1 : 0,
      cornerRadius: 0,
      rotation: 0,
      visible: true,
      locked: false,
    });
  };

  const handleAddQr = () => {
    addElementCentre({ ...QR_PAR_DEFAUT, qrValue: QR_VALEUR_PAR_DEFAUT, dataBinding: null });
  };

  return (
    <div className={PANNEAU}>
      <GrilleVignettes colonnes={3}>
        {FORMES.map((forme) => (
          <CarteProposition
            key={forme.id}
            titre={forme.label}
            onAjout={() => handleAddShape(forme)}
            apercu={
              // Le pictogramme prend la couleur de la prochaine forme
              <forme.icon className="h-6 w-6" style={{ color: couleur }} fill={forme.id === 'line' ? 'none' : couleur} />
            }
          />
        ))}
        <CarteProposition
          titre="QR code"
          icone={QrCode}
          onAjout={handleAddQr}
          titreInfobulle="Une adresse fixe, la même pour tous les produits : à saisir dans ses réglages"
        />
      </GrilleVignettes>

      {/* Couleur appliquée à la prochaine forme ajoutée */}
      <div className={LIGNE}>
        <span>Couleur</span>
        <div className="flex items-center gap-1.5">
          {COULEURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCouleur(c)}
              aria-pressed={couleur === c}
              title={c}
              className={`h-5 w-5 rounded-full border border-gray-300 dark:border-gray-600 ${
                couleur === c ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <PastilleCouleur couleur={couleur} onCouleur={setCouleur} label="Couleur personnalisée" />
        </div>
      </div>

      {onOpenTool && <LienProduit onClic={() => onOpenTool('donnees')}>QR vers la page du produit</LienProduit>}
    </div>
  );
};

export default AssetsPanel;
