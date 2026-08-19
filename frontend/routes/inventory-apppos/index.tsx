// frontend/routes/inventory-apppos/index.tsx
//
// ALIAS HISTORIQUE. L'écran a vécu ici tant qu'il lisait AppPos ; il est à
// `/stock/inventaire` depuis le 19 août 2026, avec les quatre autres écrans du
// module. Cette route redirige plutôt qu'elle ne rend le composant : deux URL
// pour un même écran, c'est deux écrans qui divergent un jour.
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/inventory-apppos/')({
	beforeLoad: () => {
		throw redirect({ to: '/stock/inventaire', replace: true })
	},
})
