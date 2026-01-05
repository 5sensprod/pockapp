// frontend/routes/settings/secrets.tsx
import { SettingsPage } from '@/modules/settings/SettingsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/secrets')({
	component: () => <SettingsPage tab='secrets' />,
})
