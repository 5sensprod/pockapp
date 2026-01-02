import { SettingsPage } from '@/modules/settings/SettingsPage'
// frontend/routes/settings/users.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/users')({
	component: () => <SettingsPage tab='users' />,
})
