import { CashPage } from '@/modules/cash'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/config')({
	component: CashPage,
})
