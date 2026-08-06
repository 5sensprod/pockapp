import { AppSitePage } from '@/modules/site'
// frontend/routes/site/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/site/')({
	component: AppSitePage,
})
