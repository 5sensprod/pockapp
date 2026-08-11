import { AppSitePage } from '@/modules/site'
// frontend/routes/site/menu.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/site/menu')({
	component: AppSitePage,
})
