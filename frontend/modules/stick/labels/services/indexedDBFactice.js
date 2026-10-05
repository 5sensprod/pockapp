// frontend/modules/stick/labels/services/indexedDBFactice.js
//
// UN INDEXEDDB EN MÉMOIRE, pour tester `presetImageService` sous Node (pas de
// navigateur, pas de `fake-indexeddb` dans le dépôt). Juste ce que le service
// emploie : `open`, `transaction`, `objectStore` → `put` / `get` / `getAll` /
// `delete`. `echecEcriture` : toute écriture échoue (quota dépassé).
// Ne sert qu'aux tests.

export const indexedDBFactice = ({ echecEcriture = false } = {}) => {
	const bases = new Map();

	const requete = (valeur) => {
		const r = { result: undefined, error: null, onsuccess: null, onerror: null };
		queueMicrotask(() => {
			r.result = valeur();
			r.onsuccess?.();
		});
		return r;
	};

	const magasin = (donnees, tx, ecriture) => ({
		put: (valeur) => {
			if (echecEcriture) {
				queueMicrotask(() => {
					tx.error = new Error('QuotaExceededError');
					tx.onerror?.();
					tx.onabort?.();
				});
				return;
			}
			donnees.set(valeur.filename, structuredClone(valeur));
			ecriture();
		},
		delete: (cle) => {
			donnees.delete(cle);
			ecriture();
		},
		get: (cle) => requete(() => structuredClone(donnees.get(cle)) ?? undefined),
		getAll: () => requete(() => [...donnees.values()].map((v) => structuredClone(v))),
	});

	return {
		open: (nom) => {
			const r = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
			queueMicrotask(() => {
				const neuve = !bases.has(nom);
				if (neuve) bases.set(nom, new Map());
				const magasins = bases.get(nom);
				const db = {
					objectStoreNames: { contains: (n) => magasins.has(n) },
					createObjectStore: (n) => magasins.set(n, new Map()),
					transaction: ([n]) => {
						const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
						const ecriture = () => queueMicrotask(() => tx.oncomplete?.());
						tx.objectStore = () => magasin(magasins.get(n), tx, ecriture);
						return tx;
					},
				};
				r.result = db;
				if (neuve) r.onupgradeneeded?.({ target: { result: db } });
				r.onsuccess?.();
			});
			return r;
		},
	};
};
