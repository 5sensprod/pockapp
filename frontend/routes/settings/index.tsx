import { SettingsPage } from '@/modules/settings/SettingsPage'
// frontend/routes/settings/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/')({
	component: () => <SettingsPage tab='account' />,
})
