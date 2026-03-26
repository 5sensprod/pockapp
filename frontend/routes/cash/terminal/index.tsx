// frontend/routes/cash/terminal/index.tsx
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCashRegisters } from '@/lib/queries/cash'
import { getLastRouteForModule } from '@/lib/stores/moduleNavigationStore'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Monitor } from 'lucide-react'
import { useEffect } from 'react'

function CashTerminalSelector() {
	const navigate = useNavigate()
	const { activeCompanyId } = useActiveCompany()
	const { data: registers } = useCashRegisters(activeCompanyId ?? undefined)

	useEffect(() => {
		if (registers?.length === 1) {
			navigate({
				to: '/cash/terminal/$cashRegisterId',
				params: { cashRegisterId: registers[0].id },
			})
		}
	}, [registers, navigate])

	if (!registers?.length) {
		return (
			<div className='p-8 text-center text-muted-foreground'>
				Aucune caisse configurée
			</div>
		)
	}

	return (
		<div className='container mx-auto px-6 py-8'>
			<h1 className='text-2xl font-bold mb-6'>Choisir une caisse</h1>
			<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
				{registers.map((register) => (
					<button
						key={register.id}
						type='button'
						onClick={() =>
							navigate({
								to: '/cash/terminal/$cashRegisterId',
								params: { cashRegisterId: register.id },
							})
						}
						className='border rounded-lg p-6 text-left hover:bg-accent transition-colors'
					>
						<Monitor className='h-8 w-8 mb-3 text-primary' />
						<p className='font-semibold'>{register.name}</p>
					</button>
				))}
			</div>
		</div>
	)
}

export const Route = createFileRoute('/cash/terminal/')({
	beforeLoad: () => {
		const last = getLastRouteForModule('cash')
		if (last?.startsWith('/cash/terminal/') && last !== '/cash/terminal/') {
			throw redirect({ to: last as any })
		}
	},
	component: CashTerminalSelector,
})
