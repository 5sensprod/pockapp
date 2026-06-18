// frontend/routes/cash/rapport-z/index.tsx
import { RapportZPage } from '@/modules/cash/RapportZPage'
import { createFileRoute } from '@tanstack/react-router'

// 🆕 Search params optionnels permettant d'arriver sur cette page
// avec une caisse + une date déjà sélectionnées (ex: depuis le bouton
// "Clôturer et générer le Z" de la modale de fermeture de session).
export interface RapportZSearch {
	register?: string
	date?: string
	// Si true, déclenche automatiquement la génération/affichage du Z
	// dès que la caisse + la date sont valides, sans clic manuel.
	autoGenerate?: boolean
}

export const Route = createFileRoute('/cash/rapport-z/')({
	validateSearch: (search: Record<string, unknown>): RapportZSearch => ({
		register: typeof search.register === 'string' ? search.register : undefined,
		date: typeof search.date === 'string' ? search.date : undefined,
		autoGenerate:
			search.autoGenerate === true || search.autoGenerate === 'true'
				? true
				: undefined,
	}),
	component: RapportZPage,
})
