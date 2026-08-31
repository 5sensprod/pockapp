// frontend/modules/cash/cloture-journee.test.ts
//
// Gardiens du défaut du 31 août 2026 : la clôture de journée n'émettait pas
// son rapport Z.
//
// La cause était une lecture d'état React périmée — handleCloseAndGenerateZ
// appelait setPendingAction('closeAndZ') puis handleFirstSubmit() dans le MÊME
// gestionnaire, or handleFirstSubmit est la closure du rendu courant, où
// pendingAction valait encore 'close'. Le bouton « Clôturer la journée et
// générer le Z » exécutait donc le chemin du COMPTAGE : session laissée
// ouverte, Z jamais demandé.
//
// Ce défaut ne se voit ni au compilateur — les deux branches sont bien typées —
// ni à l'écran, où le toast « Comptage du tiroir enregistré » passe pour une
// confirmation. D'où un test qui lit le fichier lui-même, comme
// modules/stock/single-source.test.ts.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const racine = join(__dirname, '..', '..')
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf-8')

describe('la clôture de journée ne peut plus perdre son Z', () => {
	const dialogue = lire(
		'modules/cash/components/sessions/CloseSessionDialog.tsx',
	)

	it("l'action de clôture se passe en paramètre, elle ne se lit pas dans l'état", () => {
		// Les deux fonctions du chemin de soumission la reçoivent.
		expect(dialogue).toMatch(
			/const handleFirstSubmit = \(action: 'close' \| 'closeAndZ'\)/,
		)
		expect(dialogue).toMatch(
			/const handleFinalSubmit = \(action: 'close' \| 'closeAndZ'\)/,
		)
		// Et aucune des deux ne repart de l'état : c'était la faute exacte.
		expect(dialogue).not.toMatch(/const action = pendingAction/)
	})

	it('les deux boutons désignent leur action, sans compter sur un re-rendu', () => {
		expect(dialogue).toMatch(/handleFirstSubmit\('close'\)/)
		expect(dialogue).toMatch(/handleFirstSubmit\('closeAndZ'\)/)
	})

	it("le front ne fabrique plus le Z par une navigation : la route l'a déjà émis", () => {
		// `autoGenerate` faisait dépendre un document fiscal d'une chaîne
		// d'effets React et d'un GET. La route de clôture émet le Z elle-même
		// (backend/routes/cash_routes.go) et le rend dans sa réponse.
		// (recherché dans le code, pas dans les commentaires du fichier)
		const code = dialogue
			.split(String.fromCharCode(10))
			.filter((l) => !l.trimStart().startsWith('//'))
			.join(String.fromCharCode(10))
		expect(code).not.toMatch(/autoGenerate/)
		expect(dialogue).toMatch(/result\.z_report/)
		// Elle navigue en demandant d'OUVRIR le rapport, pas de le produire.
		expect(code).toMatch(/afficher: true/)
	})
})

describe('la mutation de clôture rend le rapport émis', () => {
	const requetes = lire('lib/queries/cash.ts')

	it('useCloseCashSession lit `z_report` dans la réponse de la route', () => {
		const bloc = requetes.slice(
			requetes.indexOf('export function useCloseCashSession'),
			requetes.indexOf('export function useFondsDuJour'),
		)
		expect(bloc).toMatch(/z_report: RapportZ/)
		// La clôture ne passe plus par le GET qui génère.
		expect(bloc).not.toMatch(/reports\/z\?/)
	})

	it("l'historique des Z est refait même s'il n'est pas monté", () => {
		// Sans refetchType 'all', invalidateQueries ne refait que les requêtes
		// ACTIVES. L'historique ne l'est pas au moment de la clôture — on est
		// encore sur le terminal — et la page Rapport Z l'affichait tel qu'il
		// était avant. Signalé le 31 août 2026 : « je dois rafraîchir la page
		// pour voir tous les Z ».
		const bloc = requetes.slice(
			requetes.indexOf('export function useCloseCashSession'),
			requetes.indexOf('export function useFondsDuJour'),
		)
		expect(bloc).toMatch(/refetchType: 'all'/)
		// Et le rapport reçu est posé dans le cache : la page l'affiche sans
		// une seule requête.
		expect(bloc).toMatch(/setQueryData\(\s*cashKeys\.zReportGenerate/)
	})
})

describe("l'historique des Z ne se sert jamais du cache", () => {
	const requetes = lire('lib/queries/cash.ts')

	it('la liste est refaite au montage, sans fraîcheur', () => {
		// Un Z est émis depuis le terminal, parfois depuis un autre poste : une
		// liste servie du cache y arrive toujours en retard, et il fallait
		// recharger la page pour voir les derniers Z.
		const bloc = requetes.slice(
			requetes.indexOf('export function useZReportList'),
			requetes.indexOf('export function useZReportById'),
		)
		expect(bloc).toMatch(/staleTime: 0/)
		expect(bloc).toMatch(/refetchOnMount: 'always'/)
	})

	it("l'historique n'est plus tronqué en silence", () => {
		// 66 Z en production au 1er septembre 2026, la limite valait 50 :
		// seize n'étaient pas affichés, sans message ni pagination.
		expect(requetes).toMatch(/const Z_PAR_DEFAUT = 500/)
		expect(requetes).not.toMatch(/options\?\.limit \?\? 50/)
	})
})
