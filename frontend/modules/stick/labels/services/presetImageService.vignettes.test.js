// LES VIGNETTES DE LA BIBLIOTHÈQUE : la grille ne lit que des vignettes, la liste
// est en cache, une base à l'ancien format s'ouvre sans rien perdre et se rattrape
// en arrière-plan, et l'originale reste intacte octet pour octet.
import { afterEach, describe, expect, it, vi } from 'vitest';
import presetImageService, { ORIGINE_GENERATION } from './presetImageService';
import { indexedDBFactice } from './indexedDBFactice';
import { dimensionsVignette } from '../utils/vignetteImage';

const GROS = `data:image/png;base64,${'A'.repeat(Math.round(2 * 1024 * 1024 * 1.3333))}`;
const fabriqueStub = vi.fn(async (src) => `data:image/webp;base64,V${String(src).length}`);

const fichier = (nom) => ({ name: nom, size: 1, type: 'image/png' });

// FileReader n'existe pas sous Node : on lit nous-mêmes
const brancher = (bases) => {
	const idb = indexedDBFactice({ bases });
	vi.stubGlobal('indexedDB', idb);
	// Un service neuf par test : cache, abonnés, rattrapage
	presetImageService.db = null;
	presetImageService.entrees = null;
	presetImageService.chargement = null;
	presetImageService.rattrapage = null;
	presetImageService.abonnes = new Set();
	presetImageService.sansVignette = new Set();
	presetImageService.fabriquer = fabriqueStub;
	presetImageService.lireFichier = async (f) => `data:image/png;base64,${f.name}`;
	fabriqueStub.mockClear();
	return idb;
};

const ancienneBase = (n = 3) => {
	const images = new Map();
	for (let i = 0; i < n; i++) {
		const filename = `${1000 + i}-abc-vieille${i}.png`;
		images.set(filename, {
			filename,
			name: `vieille${i}.png`,
			src: `data:image/png;base64,AAAA${i}`,
			size: 4,
			type: 'image/png',
			createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
		});
	}
	return new Map([['LabelPresetImagesDB', { version: 1, magasins: new Map([['images', images]]) }]]);
};

const attendreRattrapage = async () => {
	await presetImageService.rattrapage;
};

afterEach(() => {
	vi.unstubAllGlobals();
	presetImageService.db = null;
	presetImageService.entrees = null;
});

describe('cache de la liste', () => {
	it('ne relit pas IndexedDB au second montage, et ne lit aucune originale quand les vignettes existent', async () => {
		const idb = brancher();
		await presetImageService.uploadImages([fichier('a.png'), fichier('b.png')]);
		presetImageService.entrees = null; // cache froid : comme au lancement
		const avant = idb.compteurs.lectures;
		await presetImageService.chargerApercus();
		expect(idb.compteurs.lectures).toBeGreaterThan(avant);

		const lectures = idb.compteurs.lectures;
		await presetImageService.chargerApercus(); // 2e montage
		expect(presetImageService.lireCache('import')).toHaveLength(2);
		expect(idb.compteurs.lectures).toBe(lectures);
		expect(presetImageService.lireCache('import').every((e) => e.apercu.startsWith('data:image/webp'))).toBe(true);
	});

	it('mesure : 50 images de 2 Mio, la liste ne lit que des vignettes', async () => {
		const idb = brancher();
		const db = await presetImageService.initDB();
		await new Promise((resolve) => {
			const tx = db.transaction(['images', 'vignettes'], 'readwrite');
			tx.oncomplete = resolve;
			for (let i = 0; i < 50; i++) {
				const image = {
					filename: `f${i}`,
					name: `n${i}`,
					src: GROS,
					size: 2097152,
					type: 'image/png',
					createdAt: `2026-02-${String((i % 27) + 1).padStart(2, '0')}`,
				};
				tx.objectStore('images').put(image);
				tx.objectStore('vignettes').put({
					filename: image.filename,
					name: image.name,
					createdAt: image.createdAt,
					vignette: `data:image/webp;base64,${'V'.repeat(15000)}`,
				});
			}
		});
		const avant = idb.compteurs.octetsSrc;
		const t = performance.now();
		await presetImageService.chargerApercus();
		const ms = performance.now() - t;
		const lusMio = (idb.compteurs.octetsSrc - avant) / 1048576;
		console.log(`MESURE liste de 50 images : ${ms.toFixed(0)} ms, ${lusMio.toFixed(2)} Mio lus`);
		expect(lusMio).toBeLessThan(1.5);
		expect(presetImageService.lireCache('import')).toHaveLength(50);
	});

	it('est tenu à jour par un import, une image rangée et une suppression', async () => {
		brancher();
		await presetImageService.chargerApercus();
		const prevenu = vi.fn();
		presetImageService.abonner(prevenu);

		const { images } = await presetImageService.uploadImages(fichier('a.png'));
		expect(presetImageService.lireCache('import').map((e) => e.filename)).toEqual([images[0].filename]);

		const rangee = await presetImageService.ajouterGeneree({ src: 'data:image/png;base64,iVBO', depuis: 'a.png' });
		expect(presetImageService.lireCache('generation').map((e) => e.filename)).toEqual([rangee.filename]);
		expect(presetImageService.lireCache('import')).toHaveLength(1);

		await presetImageService.deleteImage(images[0].filename);
		expect(presetImageService.lireCache('import')).toHaveLength(0);
		expect(prevenu).toHaveBeenCalledTimes(3);
	});
});

describe('vignette', () => {
	it('est fabriquée et rangée à l’ajout, à côté de l’originale', async () => {
		const idb = brancher();
		const { images } = await presetImageService.uploadImages(fichier('a.png'));
		const magasins = idb.bases.get('LabelPresetImagesDB').magasins;
		expect(magasins.get('vignettes').get(images[0].filename).vignette).toMatch(/^data:image\/webp/);
		expect(magasins.get('images').get(images[0].filename).src).toBe(images[0].src);
		await presetImageService.ajouterGeneree({ src: 'data:image/png;base64,iVBO' });
		expect(magasins.get('vignettes').size).toBe(2);
	});

	it('une fabrication qui échoue n’empêche ni l’import ni le rangement', async () => {
		brancher();
		presetImageService.fabriquer = async () => null;
		const { images } = await presetImageService.uploadImages(fichier('a.png'));
		const rangee = await presetImageService.ajouterGeneree({ src: 'data:image/png;base64,iVBO' });
		expect(await presetImageService.getImageInfo(images[0].filename)).toMatchObject({ src: images[0].src });
		expect(await presetImageService.getImageInfo(rangee.filename)).toMatchObject({ origine: ORIGINE_GENERATION });
	});

	it('dimensions : 256 au plus, proportions gardées, jamais d’agrandissement', () => {
		expect(dimensionsVignette(4000, 2000)).toEqual({ largeur: 256, hauteur: 128 });
		expect(dimensionsVignette(1000, 4000)).toEqual({ largeur: 64, hauteur: 256 });
		expect(dimensionsVignette(100, 50)).toEqual({ largeur: 100, hauteur: 50 });
	});
});

describe('base à l’ancien format (v1, sans magasin de vignettes)', () => {
	it('s’ouvre sans rien perdre, et la migration est rejouable', async () => {
		const bases = ancienneBase(3);
		const idb = brancher(bases);
		const originales = structuredClone([...bases.get('LabelPresetImagesDB').magasins.get('images').values()]);
		await presetImageService.initDB();
		presetImageService.db = null;
		await presetImageService.initDB(); // rejoué
		const base = idb.bases.get('LabelPresetImagesDB');
		expect(base.version).toBe(2);
		expect([...base.magasins.get('images').values()]).toEqual(originales);
		expect(base.magasins.has('vignettes')).toBe(true);
		expect(await presetImageService.listerImportees()).toHaveLength(3);
	});

	it('affiche d’abord les anciennes images, puis les rattrape sans toucher aux originales', async () => {
		const bases = ancienneBase(3);
		const idb = brancher(bases);
		const originales = structuredClone([...bases.get('LabelPresetImagesDB').magasins.get('images').values()]);

		await presetImageService.chargerApercus();
		const premiere = presetImageService.lireCache('import');
		expect(premiere).toHaveLength(3);
		// Aucune vignette encore : l'aperçu est l'originale
		expect(premiere.every((e) => e.apercu.startsWith('data:image/png'))).toBe(true);
		// Tri : la plus récente d'abord
		expect(premiere[0].filename).toBe(originales[2].filename);

		await attendreRattrapage();
		const apres = presetImageService.lireCache('import');
		expect(apres.every((e) => e.apercu.startsWith('data:image/webp') && !e.sansVignette)).toBe(true);
		const magasins = idb.bases.get('LabelPresetImagesDB').magasins;
		expect(magasins.get('vignettes').size).toBe(3);
		// Originales intactes, octet pour octet
		expect([...magasins.get('images').values()]).toEqual(originales);
		for (const o of originales) expect((await presetImageService.getImageInfo(o.filename)).src).toBe(o.src);

		// Au lancement suivant : plus rien à rattraper
		presetImageService.entrees = null;
		fabriqueStub.mockClear();
		await presetImageService.chargerApercus();
		await attendreRattrapage();
		expect(fabriqueStub).not.toHaveBeenCalled();
	});

	it('une ancienne image qui ne se décode pas reste affichée, sans réessai en boucle', async () => {
		brancher(ancienneBase(2));
		presetImageService.fabriquer = vi.fn(async () => null);
		await presetImageService.chargerApercus();
		await attendreRattrapage();
		expect(presetImageService.fabriquer).toHaveBeenCalledTimes(2);
		expect(presetImageService.lireCache('import')).toHaveLength(2);
		presetImageService.rattraper();
		await attendreRattrapage();
		expect(presetImageService.fabriquer).toHaveBeenCalledTimes(2);
	});

	it('supprimée pendant le rattrapage : aucune vignette orpheline ne revient dans la liste', async () => {
		brancher(ancienneBase(2));
		await presetImageService.chargerApercus();
		const [premiere] = presetImageService.lireCache('import');
		await presetImageService.deleteImage(premiere.filename);
		await attendreRattrapage();
		expect(presetImageService.lireCache('import')).toHaveLength(1);
		presetImageService.entrees = null;
		await presetImageService.chargerApercus();
		expect(presetImageService.lireCache('import')).toHaveLength(1);
	});
});
