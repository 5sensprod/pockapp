// frontend/routes/stick/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { StickPage } from '@/modules/stick'

export const Route = createFileRoute('/stick/')({
  component: StickPage,
})