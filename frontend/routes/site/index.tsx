// frontend/routes/site/index.tsx
//
// Le module n'a pas de page racine : `/site/` redirige vers la première
// section. Même motif que `/cash/` → `/cash/config`. Sans cela, `/site/`
// serait à la fois une entrée de menu et le préfixe de toutes les autres,
// et le surlignage de la barre latérale — qui matche par préfixe — les
// allumerait toutes.
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/site/')({
	beforeLoad: () => {
		throw redirect({ to: '/site/catalogue' })
	},
})
