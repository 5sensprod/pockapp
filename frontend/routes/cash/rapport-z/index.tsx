// frontend/routes/cash/rapport-z/index.tsx
import { RapportZPage } from '@/modules/cash/RapportZPage'
import { createFileRoute } from '@tanstack/react-router'

// Search params optionnels permettant d'arriver sur cette page avec une caisse
// et une date déjà sélectionnées — depuis « Clôturer la journée » (E-4).
export interface RapportZSearch {
	register?: string
	date?: string
	// `afficher` demande d'OUVRIR le rapport de cette journée, pas de le
	// fabriquer : depuis le 31 août 2026, le Z est émis par la route de clôture
	// (backend/cloture_journee.go) et il existe déjà quand on arrive ici.
	//
	// Le paramètre s'appelait `autoGenerate`, et il portait bien son nom : un
	// document fiscal était scellé au terme d'une chaîne d'effets React. Ce
	// n'est plus le cas, et le nom ne doit plus le laisser croire.
	afficher?: boolean
}

export const Route = createFileRoute('/cash/rapport-z/')({
	validateSearch: (search: Record<string, unknown>): RapportZSearch => ({
		register: typeof search.register === 'string' ? search.register : undefined,
		date: typeof search.date === 'string' ? search.date : undefined,
		afficher:
			search.afficher === true || search.afficher === 'true' ? true : undefined,
	}),
	component: RapportZPage,
})
