// frontend/modules/stick/StickPage.tsx
//
// L'ÉDITEUR D'AFFICHE, porté d'AppPos (« Outils → Affiche », /tools/labels).
//
// Pas de `ModulePageShell` ici, et c'est délibéré : l'éditeur porte sa propre
// barre d'outils (`TopToolbar`) et veut toute la hauteur, sans le padding du
// shell — c'est ainsi qu'il vivait dans AppPos. Le placeholder qui occupait
// cette page est remplacé.

import { LabelPage } from './labels/LabelPage'

export function StickPage() {
	return (
		// Hauteur BORNÉE à la fenêtre moins l'en-tête (même règle que
		// `ProductsPage.tsx`) : `h-full` ne valait rien, `<main>` n'ayant pas de
		// hauteur fixe. Sans borne, la page entière défilait ; avec, ce sont le
		// panneau de gauche et la zone de travail qui défilent, chacun le sien.
		<div className='h-[calc(100dvh-var(--header-h))] w-full overflow-hidden'>
			<LabelPage />
		</div>
	)
}
