import { CashTerminalPage } from '@/modules/cash/CashTerminalPage'
// frontend/routes/cash/terminal/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/terminal/')({
  component: CashTerminalPage,
})
