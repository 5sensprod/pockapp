// LA BIBLIOTHÈQUE D'IMAGES DU POSTE : « Mes images » ne montre pas les images
// détourées, « Génération » ne montre qu'elles, et une image stockée avant le
// détourage — donc sans marque — reste une image importée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import presetImageService, { ORIGINE_GENERATION } from './presetImageService';
import { indexedDBFactice } from './indexedDBFactice';

const brancher = (options) => {
	vi.stubGlobal('indexedDB', indexedDBFactice(options));
	presetImageService.db = null;
};

const ancienne = {
	filename: '1000-abc-vieille.png',
	name: 'vieille.png',
	src: 'data:image/png;base64,AAAA',
	size: 4,
	type: 'image/png',
	createdAt: '2026-01-01T00:00:00.000Z',
};

const deposerAncienne = async () => {
	const db = await presetImageService.initDB();
	await new Promise((resolve) => {
		const tx = db.transaction(['images'], 'readwrite');
		tx.oncomplete = resolve;
		tx.objectStore('images').put(ancienne);
	});
};

beforeEach(() => brancher());
afterEach(() => {
	vi.unstubAllGlobals();
	presetImageService.db = null;
});

describe('ajouterGeneree', () => {
	it('range l’image en data URL, avec sa marque d’origine, sa date et le nom de départ', async () => {
		const image = await presetImageService.ajouterGeneree({
			src: 'data:image/png;base64,iVBO',
			depuis: 'guitare.jpg',
			size: 3,
		});
		expect(image.origine).toBe(ORIGINE_GENERATION);
		expect(image.depuis).toBe('guitare.jpg');
		expect(image.src.startsWith('data:image/png;base64,')).toBe(true);
		expect(Number.isNaN(Date.parse(image.createdAt))).toBe(false);
		expect(await presetImageService.getImageInfo(image.filename)).toMatchObject({ origine: ORIGINE_GENERATION });
	});

	it('rejette quand l’écriture échoue (quota) — l’appelant décide', async () => {
		brancher({ echecEcriture: true });
		await expect(presetImageService.ajouterGeneree({ src: 'data:image/png;base64,iVBO' })).rejects.toBeTruthy();
	});
});

describe('« Mes images » et « Génération »', () => {
	it('« Mes images » ne liste pas une image générée', async () => {
		await deposerAncienne();
		const generee = await presetImageService.ajouterGeneree({ src: 'data:image/png;base64,iVBO', depuis: 'a.jpg' });
		const importees = await presetImageService.listerImportees();
		expect(importees.map((i) => i.filename)).toEqual([ancienne.filename]);
		expect(importees.map((i) => i.filename)).not.toContain(generee.filename);
	});

	it('une image ancienne, sans marque, reste dans « Mes images » et n’entre pas dans « Génération »', async () => {
		await deposerAncienne();
		expect((await presetImageService.listerImportees()).map((i) => i.filename)).toContain(ancienne.filename);
		expect(await presetImageService.listerGenerees()).toEqual([]);
	});

	it('« Génération » ne liste que les images générées, la plus récente d’abord', async () => {
		await deposerAncienne();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
		const premiere = await presetImageService.ajouterGeneree({ src: 'data:image/png;base64,AA', depuis: 'a.jpg' });
		vi.setSystemTime(new Date('2026-10-05T11:00:00Z'));
		const seconde = await presetImageService.ajouterGeneree({ src: 'data:image/png;base64,BB', depuis: 'b.jpg' });
		vi.useRealTimers();
		const generees = await presetImageService.listerGenerees();
		expect(generees.map((i) => i.filename)).toEqual([seconde.filename, premiere.filename]);
	});

	it('une image générée se supprime comme une autre', async () => {
		const image = await presetImageService.ajouterGeneree({ src: 'data:image/png;base64,AA' });
		await presetImageService.deleteImage(image.filename);
		expect(await presetImageService.listerGenerees()).toEqual([]);
	});
});
