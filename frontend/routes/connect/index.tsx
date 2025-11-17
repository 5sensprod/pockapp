// frontend/routes/connect/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { ConnectPage } from '@/modules/connect/ConnectPage'

export const Route = createFileRoute('/connect/')({
  component: ConnectPage,
})
