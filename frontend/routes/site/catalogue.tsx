import { CatalogueEnLignePage } from '@/modules/site'
// frontend/routes/site/catalogue.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/site/catalogue')({
	component: CatalogueEnLignePage,
})
