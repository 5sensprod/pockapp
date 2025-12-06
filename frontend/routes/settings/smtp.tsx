import { SettingsPage } from '@/modules/settings/SettingsPage'
// frontend/routes/settings/smtp.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/smtp')({
	component: () => <SettingsPage tab='smtp' />,
})
