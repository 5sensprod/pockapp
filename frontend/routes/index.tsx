import { poles } from '@/modules/_registry'
import { GetNetworkInfo } from '@/wailsjs/go/main/App'
import { useQuery } from '@tanstack/react-query'
// frontend/routes/index.tsx
import { Link, createFileRoute } from '@tanstack/react-router'
import QRCode from 'react-qr-code'

export const Route = createFileRoute('/')({
	component: Dashboard,
})

function isWailsApp() {
	if (typeof window === 'undefined') return false
	const w = window as any
	// Wails expose généralement `window.go` et `window.runtime`
	return Boolean(w.go?.main?.App && w.runtime)
}

function Dashboard() {
	return (
		<div className='container mx-auto px-6 py-8 max-w-7xl'>
			<div className='mb-8'>
				<div className='flex items-start justify-between gap-6'>
					<div>
						<h1 className='text-3xl font-bold mb-2'>Tableau de bord</h1>
						<p className='text-muted-foreground'>
							Sélectionnez un module pour commencer
						</p>
					</div>

					{isWailsApp() ? <NetworkQRCode /> : null}
				</div>
			</div>

			<div className='space-y-10'>
				{poles.map((pole) => (
					<section key={pole.id}>
						<div className='flex items-center justify-between mb-4'>
							<div
								className={`px-3 py-1 rounded-full text-sm font-semibold ${pole.color}`}
							>
								{pole.name}
							</div>
						</div>

						<div className='grid md:grid-cols-3 gap-4'>
							{pole.modules.map((module) => (
								<ModuleCard key={module.id} module={module} />
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	)
}

function NetworkQRCode() {
	const { data } = useQuery({
		queryKey: ['networkInfo'],
		queryFn: () => GetNetworkInfo(),
		staleTime: 10_000,
		refetchInterval: 10_000,
	})

	const url = data?.url ?? ''

	return (
		<div className='border rounded-lg p-3 bg-background'>
			<div className='text-sm font-semibold mb-2'>Accès distant</div>

			<div className='flex items-center gap-3'>
				<div className='bg-white rounded-md p-2'>
					{url ? (
						<QRCode value={url} size={96} />
					) : (
						<div className='w-[96px] h-[96px] rounded-md bg-muted' />
					)}
				</div>

				<div className='min-w-0'>
					<div className='text-xs text-muted-foreground'>
						Scannez pour ouvrir
					</div>
					<div className='text-sm font-medium truncate max-w-[240px]'>
						{url || '—'}
					</div>
				</div>
			</div>
		</div>
	)
}

function ModuleCard({ module }: { module: any }) {
	const Icon = module.icon

	return (
		<div className='border rounded-lg p-4 hover:shadow-md transition-shadow flex flex-col justify-between'>
			<div>
				<div className='flex items-center justify-between mb-3'>
					<div className='flex items-center gap-2'>
						<div className='w-10 h-10 rounded-lg bg-muted flex items-center justify-center'>
							{Icon && <Icon className={`h-5 w-5 ${module.iconColor}`} />}
						</div>
						<div>
							<h2 className={`text-lg font-semibold ${module.color}`}>
								{module.name}
							</h2>
							<p className='text-xs text-muted-foreground'>
								{module.pole.toUpperCase()}
							</p>
						</div>
					</div>
				</div>
				<p className='text-sm text-muted-foreground'>{module.description}</p>
			</div>

			<div className='mt-4'>
				<Link
					to={module.route}
					className={`inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium border-current ${module.color}`}
				>
					Ouvrir
				</Link>
			</div>
		</div>
	)
}
