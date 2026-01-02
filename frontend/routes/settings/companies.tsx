// frontend/routes/settings/companies.tsx
import { SettingsPage } from '@/modules/settings/SettingsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/companies')({
	component: () => <SettingsPage tab='companies' />,
})
