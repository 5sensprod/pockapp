// frontend/modules/stick/labels/services/indexedDBFactice.js
//
// UN INDEXEDDB EN MÉMOIRE, pour tester `presetImageService` sous Node (pas de
// navigateur, pas de `fake-indexeddb` dans le dépôt). Juste ce que le service
// emploie : `open` (avec version et `onupgradeneeded`), `transaction` sur un ou
// plusieurs magasins → `put` / `get` / `getAll` / `getAllKeys` / `delete`.
// `echecEcriture` : toute écriture échoue (quota dépassé).
// `compteurs` : lectures et octets de `src` relus — ce que la liste coûte.
// `bases` : les données, pour fabriquer une base à l'ANCIEN format.
// Ne sert qu'aux tests.

export const indexedDBFactice = ({ echecEcriture = false, bases = new Map() } = {}) => {
	// nom → { version, magasins: Map<nom, Map<cle, valeur>> }
	const compteurs = { lectures: 0, enregistrementsLus: 0, octetsSrc: 0 };

	const compter = (valeur) => {
		if (!valeur) return;
		compteurs.enregistrementsLus += 1;
		compteurs.octetsSrc += (valeur.src?.length ?? 0) + (valeur.vignette?.length ?? 0);
	};

	const requete = (valeur) => {
		const r = { result: undefined, error: null, onsuccess: null, onerror: null };
		compteurs.lectures += 1;
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
		get: (cle) =>
			requete(() => {
				const v = donnees.get(cle);
				compter(v);
				return structuredClone(v) ?? undefined;
			}),
		getAll: () =>
			requete(() =>
				[...donnees.values()].map((v) => {
					compter(v);
					return structuredClone(v);
				}),
			),
		getAllKeys: () => requete(() => [...donnees.keys()]),
	});

	return {
		bases,
		compteurs,
		open: (nom, version = 1) => {
			const r = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
			queueMicrotask(() => {
				const existante = bases.get(nom);
				const ancienne = existante?.version ?? 0;
				if (!existante) bases.set(nom, { version, magasins: new Map() });
				const base = bases.get(nom);
				const montee = version > ancienne;
				if (montee) base.version = version;
				const magasins = base.magasins;
				const db = {
					objectStoreNames: { contains: (n) => magasins.has(n) },
					createObjectStore: (n) => magasins.set(n, new Map()),
					transaction: () => {
						const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
						const ecriture = () => queueMicrotask(() => tx.oncomplete?.());
						tx.objectStore = (n) => magasin(magasins.get(n), tx, ecriture);
						return tx;
					},
				};
				r.result = db;
				if (montee) r.onupgradeneeded?.({ target: { result: db }, oldVersion: ancienne });
				r.onsuccess?.();
			});
			return r;
		},
	};
};
