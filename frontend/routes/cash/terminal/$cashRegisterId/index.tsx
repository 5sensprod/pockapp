// frontend/routes/cash/terminal/$cashRegisterId/index.tsx
import { CashTerminalPage } from '@/modules/cash/CashTerminalPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/terminal/$cashRegisterId/')({
	component: CashTerminalPage,
})
