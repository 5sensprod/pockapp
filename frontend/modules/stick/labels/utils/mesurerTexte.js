// frontend/modules/stick/labels/utils/mesurerTexte.js
//
// Mesure SYNCHRONE d'un texte avant son ajout, par un Konva.Text hors scène,
// avec les mêmes attributs que `canvas/TextNode.jsx`. Si la police Google
// n'est pas encore chargée, l'écart est de quelques pixels : on ne recentre
// pas après coup (cela ramènerait un texte déjà déplacé et doublerait
// l'étape d'historique).

import Konva from 'konva';

export const mesurerTexte = (el) => {
  try {
    const t = new Konva.Text({
      text: String(el.text ?? ''),
      fontSize: el.fontSize || 16,
      fontFamily: el.fontFamily || 'Arial',
      fontStyle: el.fontStyle || (el.bold ? 'bold' : 'normal'),
      ...(el.width > 0 ? { width: el.width } : {}),
    });
    const taille = { width: t.width(), height: t.height() };
    t.destroy();
    return taille;
  } catch {
    return null;
  }
};
