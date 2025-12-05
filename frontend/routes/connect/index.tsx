import { ConnectPage } from '@/modules/connect/ConnectPage'
// frontend/routes/connect/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/')({
	component: ConnectPage,
})
