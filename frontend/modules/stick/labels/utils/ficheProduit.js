// frontend/modules/stick/labels/utils/ficheProduit.js
//
// LES SECTIONS DE LA FICHE PRODUIT, pour l'élément « Fiche » de l'affiche.
//
// Il n'y a PAS de champ « caractéristiques » en base : tout vit dans la
// DESCRIPTION, sous la forme fixe produite par `renderProductSheetDescription`
// (`backend/routes/gemini_routes.go`) —
//
//   <h2>Points forts</h2><ul><li>…</li></ul>
//   <h2>Caractéristiques techniques</h2><table><tbody><tr><th>…</th><td>…</td></tr></tbody></table>
//   <h2>Conseils d’utilisation</h2><p>…</p>
//
// Le découpage aux `<h2>` n'est PAS réécrit ici : c'est `blocCorrespondant` du
// module site (`modules/site/lib/sheet-blocks.ts`), le seul endroit qui le
// fait, casse et accents compris. Un produit sans fiche structurée n'a aucune
// section : l'élément ne s'affiche pas.

import { blocCorrespondant } from '@/modules/site/lib/sheet-blocks';
import { stripHtmlToText } from './dataBinding';

export const SECTIONS_FICHE = [
  { id: 'specs', label: 'Caractéristiques techniques', titre: 'Caractéristiques techniques' },
  { id: 'highlights', label: 'Points forts', titre: 'Points forts' },
  { id: 'tips', label: "Conseils d'utilisation", titre: 'Conseils d’utilisation' },
];

export const sectionParId = (id) => SECTIONS_FICHE.find((s) => s.id === id) ?? SECTIONS_FICHE[0];

const texte = (html) => stripHtmlToText(html ?? '').replace(/\s+/g, ' ').trim();

/** Les lignes `[nom, valeur]` d'un tableau HTML. Une ligne sans nom ni valeur est écartée. */
export const lignesTableau = (html) => {
  const lignes = [];
  for (const [, tr] of (html ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cellules = [...tr.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => texte(c[1]));
    if (!cellules.length) continue;
    const [nom = '', ...reste] = cellules;
    const valeur = reste.join(' — ');
    if (nom || valeur) lignes.push([nom, valeur]);
  }
  return lignes;
};

/** Les puces `<li>` d'une liste. */
export const puces = (html) =>
  [...(html ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => texte(m[1])).filter(Boolean);

/**
 * Le contenu d'une section pour un produit, ou `null` s'il n'y en a pas.
 *   specs      → { kind: 'rows', rows: [[nom, valeur], …] }
 *   highlights → { kind: 'bullets', items: [...] }
 *   tips       → { kind: 'paragraph', text }
 */
export const contenuFiche = (description, sectionId) => {
  if (!description || typeof description !== 'string') return null;
  const section = sectionParId(sectionId);
  const bloc = blocCorrespondant(description, section.titre);
  if (!bloc?.html) return null;

  if (section.id === 'specs') {
    const rows = lignesTableau(bloc.html);
    return rows.length ? { kind: 'rows', rows } : null;
  }
  if (section.id === 'highlights') {
    // Une liste, sinon chaque paragraphe devient une puce
    let items = puces(bloc.html);
    if (!items.length) items = stripHtmlToText(bloc.html).split('\n').map((l) => l.trim()).filter(Boolean);
    return items.length ? { kind: 'bullets', items } : null;
  }
  const text = stripHtmlToText(bloc.html).trim();
  return text ? { kind: 'paragraph', text } : null;
};

/** Contenu d'exemple : l'élément reste visible et réglable sans produit. */
export const EXEMPLE_FICHE = {
  specs: {
    kind: 'rows',
    rows: [
      ['Puissance', '50 W'],
      ['Poids', '3,2 kg'],
      ['Dimensions', '40 × 30 × 20 cm'],
      ['Connectique', 'Jack 6,35 mm, USB'],
    ],
  },
  highlights: {
    kind: 'bullets',
    items: ['Son clair et puissant', 'Léger et transportable', 'Prise casque pour jouer en silence'],
  },
  tips: {
    kind: 'paragraph',
    text: "Réglez le volume au minimum avant d'allumer l'appareil, puis montez progressivement.",
  },
};
