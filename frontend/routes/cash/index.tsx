// frontend/routes/cash/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { CashPage } from '@/modules/cash'

export const Route = createFileRoute('/cash/')({
  component: CashPage,
})