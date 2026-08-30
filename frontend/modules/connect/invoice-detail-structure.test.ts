// frontend/modules/connect/invoice-detail-structure.test.ts
//
// Gardiens de structure de la page de détail d'une facture. Aucune de ces
// règles ne se voit au compilateur ni à l'écran : `as any` compile, un hook mal
// placé compile, et une synthèse recalculée dans un composant affiche un
// chiffre — faux, mais un chiffre. D'où un test qui lit les fichiers eux-mêmes,
// dans la forme de `frontend/modules/stock/single-source.test.ts`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const racine = join(__dirname, '..', '..')
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf-8')

const PAGE = 'modules/connect/pages/invoices/InvoiceDetailPage.tsx'

/** Le corps de la page à partir du premier guard, commentaires retirés. */
function apresLesGuards(source: string): string {
	const posGuard = source.indexOf('if (isLoading)')
	if (posGuard < 0) throw new Error('guard `if (isLoading)` introuvable')
	return source
		.slice(posGuard)
		.split('\n')
		.filter((ligne) => !ligne.trimStart().startsWith('//'))
		.join('\n')
}

describe('InvoiceDetailPage — ordre des hooks', () => {
	it("n'appelle aucun hook après ses guards", () => {
		// Régression vécue le 30 août 2026, à l'exécution : deux `useMemo`
		// étaient restés SOUS les guards. Au premier rendu la page sortait
		// avant eux, au second elle les exécutait — React compte alors plus de
		// hooks qu'au rendu précédent et l'écran casse net :
		// « Rendered more hooks than during the previous render ».
		//
		// Ni le compilateur ni les tests unitaires ne l'ont vu. Il a fallu
		// ouvrir une facture d'acompte pour s'en apercevoir.
		//
		// Remonter les guards était le but de la refonte ; le prix, c'est que
		// plus rien en dessous n'a le droit d'être un hook.
		const apres = apresLesGuards(lire(PAGE))
		const appelsDeHooks = apres.match(/\buse[A-Z]\w*\(/g) ?? []
		expect(appelsDeHooks).toEqual([])
	})
})

describe('InvoiceDetailPage — typage', () => {
	it('ne contourne plus le type de la facture par `as any`', () => {
		// Ces `as any` n'étaient pas une négligence : la page construisait son
		// en-tête AVANT ses guards, parce que l'en-tête était un hook.
		// `invoice` y était donc optionnel partout, et le cast était le
		// raccourci. Le jour où l'en-tête redevient un hook, ils reviennent.
		const source = lire(PAGE)
		expect(source).not.toMatch(/\(invoice as any\)/)
		expect(source).not.toMatch(/invoice as any\b/)
	})

	it('construit son en-tête après les guards, pas avant', () => {
		const source = lire(PAGE)
		// `buildInvoiceDetailHeader` reçoit `navigate` en paramètre : c'est ce
		// qui en fait une fonction ordinaire, appelable après un `return`.
		expect(source).toMatch(/buildInvoiceDetailHeader/)
		expect(source).not.toMatch(/useInvoiceDetailHeader/)

		// Le premier appel sert le guard lui-même (en-tête de chargement) ; le
		// dernier est celui de la page chargée, et c'est lui qui doit venir
		// APRÈS le guard.
		const posGuard = source.indexOf('if (isLoading)')
		const posHeader = source.lastIndexOf('buildInvoiceDetailHeader({')
		expect(posGuard).toBeGreaterThan(0)
		expect(posHeader).toBeGreaterThan(posGuard)
	})
})

describe('InvoiceDetailPage — un seul lieu de calcul', () => {
	it('lit son dossier par useInvoiceDossier, pas par quatre requêtes', () => {
		const source = lire(PAGE)
		const imports = (source.match(/^import .*$/gm) ?? []).join(' ')
		expect(imports).toMatch(/useInvoiceDossier/)
		// Ces quatre-là étaient appelés côte à côte dans la page, chacun avec
		// sa condition d'activation — dont une fausse, qui interrogeait le
		// dossier d'une facture de solde avec son propre identifiant.
		expect(imports).not.toMatch(/useDepositsForInvoice/)
		expect(imports).not.toMatch(/useCreditNotesForInvoice/)
		expect(imports).not.toMatch(/\buseOrder\b/)
	})

	it('ne refabrique pas le filtre des acomptes encaissés', () => {
		// La règle du dépôt vaut ici comme pour la caisse : l'écran affiche ce
		// qui a été calculé ailleurs. Le filtre `is_paid && !has_credit_note`
		// n'a qu'un seul lieu, `computeInvoiceSummary`.
		const source = lire(PAGE)
		expect(source).not.toMatch(/is_paid\s*&&\s*!.*has_credit_note/)
	})
})
