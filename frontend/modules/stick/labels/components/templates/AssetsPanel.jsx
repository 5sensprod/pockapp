// frontend/modules/stick/labels/components/templates/AssetsPanel.jsx
//
// L'onglet « Assets » : les formes (`ShapeTemplates`) et le QR code statique
// (`QRCodeTemplates`). Autrefois deux onglets ; les deux panneaux sont repris
// TELS QUELS, sous les onglets communs (`OngletsPanneau`).
import React from 'react';
import OngletsPanneau from './OngletsPanneau';
import ShapeTemplates from './ShapeTemplates';
import QRCodeTemplates from './QRCodeTemplates';

const AssetsPanel = (props) => (
  <OngletsPanneau
    onglets={[
      { id: 'formes', libelle: 'Formes', contenu: <ShapeTemplates {...props} /> },
      { id: 'qrcode', libelle: 'QR code', contenu: <QRCodeTemplates {...props} /> },
    ]}
  />
);

export default AssetsPanel;
