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
		<div className='h-full w-full overflow-hidden'>
			<LabelPage />
		</div>
	)
}
