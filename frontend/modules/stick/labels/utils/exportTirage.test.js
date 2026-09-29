// L'aiguillage de l'export : une case = le canvas cloné ; sinon la planche
// paginée, avec le tirage déplié. Voir `PocketStick-docs/03-tirage.md`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./exportPdf', () => ({ exportPdf: vi.fn() }));
vi.mock('./exportPdfSheet', () => ({ exportPdfSheet: vi.fn() }));

import useLabelStore from '../store/useLabelStore';
import { exportPdf } from './exportPdf';
import { exportPdfSheet } from './exportPdfSheet';
import { exporterTirage } from './exportTirage';

const etat = () => useLabelStore.getState();
const p = (id) => ({ _id: id, name: id });
const doc = {};

beforeEach(() => {
  vi.clearAllMocks();
  etat().setDataSource(null, null);
  etat().setQuantite(null, 1);
  etat().setFormatTirage('page');
});

describe('exporterTirage', () => {
  it('une seule case : le canvas tel quel', async () => {
    etat().ajouterAuTirage([p('a')]);
    await exporterTirage(doc);
    expect(exportPdf).toHaveBeenCalledOnce();
    expect(exportPdfSheet).not.toHaveBeenCalled();
  });

  it('format page, plusieurs exemplaires : une page par case, sans pointillé', async () => {
    etat().ajouterAuTirage([p('a'), p('b')]);
    etat().setQuantite('a', 2);
    await exporterTirage(doc);
    const opts = exportPdfSheet.mock.calls[0][1];
    expect(opts.rows * opts.cols).toBe(1);
    expect(opts.cadresCases).toBe(false);
    expect(opts.cases.map((c) => c.product._id)).toEqual(['a', 'a', 'b']);
  });

  it('planche : grille des réglages, cases du tirage', async () => {
    etat().ajouterAuTirage([p('a')]);
    etat().setQuantite('a', 3);
    etat().setFormatTirage('planche');
    await exporterTirage(doc);
    const opts = exportPdfSheet.mock.calls[0][1];
    expect(opts.rows).toBe(etat().sheetSettings.rows);
    expect(opts.cases).toHaveLength(3);
  });

  it('sans produit × 4 : quatre cases vides de produit', async () => {
    etat().setQuantite(null, 4);
    await exporterTirage(doc);
    expect(exportPdfSheet.mock.calls[0][1].cases).toEqual(
      Array.from({ length: 4 }, () => ({ product: null }))
    );
  });

  it('page en cours, format page : le canvas seul, même avec plusieurs affiches', async () => {
    etat().ajouterAuTirage([p('a'), p('b')]);
    etat().setQuantite('a', 3);
    await exporterTirage(doc, { pageCourante: true });
    expect(exportPdf).toHaveBeenCalledOnce();
    expect(exportPdfSheet).not.toHaveBeenCalled();
  });

  it('page en cours, planche : la seule feuille du produit affiché', async () => {
    etat().setSheetSettings({ rows: 2, cols: 1 });
    etat().ajouterAuTirage([p('a'), p('b')]);
    etat().setQuantite('a', 3); // feuille 1 : a a ; feuille 2 : a b
    etat().setFormatTirage('planche');
    etat().goToProductIndex(1);
    await exporterTirage(doc, { pageCourante: true });
    const cases = exportPdfSheet.mock.calls[0][1].cases;
    expect(cases.map((c) => c.product?.name)).toEqual(['a', 'b']);
  });
});
