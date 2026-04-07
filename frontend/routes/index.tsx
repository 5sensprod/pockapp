// frontend/routes/index.tsx
import { ModulePageShell } from '@/components/module-ui'
import { poles } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'
import { homeDashboardManifest } from '@/modules/home'
import { GetNetworkInfo } from '@/wailsjs/go/main/App'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import QRCode from 'react-qr-code'
import { UpdateChecker } from '../components/UpdateChecker'

export const Route = createFileRoute('/')({
	component: Dashboard,
})

const UTILISATEUR_ALLOWED_MODULES = ['stock']

function isWailsApp() {
	if (typeof window === 'undefined') return false
	const w = window as any
	return Boolean(w.go?.main?.App && w.runtime)
}

function Dashboard() {
	const { user } = useAuth()
	const userRole = (user as any)?.role ?? 'user'
	const isUtilisateur = userRole === 'user'

	const visiblePoles = poles
		.map((pole) => ({
			...pole,
			modules: isUtilisateur
				? pole.modules.filter((m) => UTILISATEUR_ALLOWED_MODULES.includes(m.id))
				: pole.modules,
		}))
		.filter((pole) => pole.modules.length > 0)

	const wailsActions =
		isWailsApp() && !isUtilisateur ? (
			<div className='flex items-center gap-2'>
				<UpdateChecker />
				<NetworkQRCode />
			</div>
		) : null

	return (
		<ModulePageShell manifest={homeDashboardManifest} actions={wailsActions}>
			<div className='space-y-10'>
				{visiblePoles.map((pole) => (
					<section key={pole.id}>
						<div className='mb-4'>
							<span
								className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${pole.color}`}
							>
								{pole.name}
							</span>
						</div>

						<div className='grid md:grid-cols-3 gap-4'>
							{pole.modules.map((module) => (
								<ModuleCard key={module.id} module={module} />
							))}
						</div>
					</section>
				))}
			</div>
		</ModulePageShell>
	)
}

function NetworkQRCode() {
	const isWails = isWailsApp()

	const { data } = useQuery({
		queryKey: ['networkInfo'],
		queryFn: async () => {
			if (isWails) return GetNetworkInfo()
			return { url: window.location.origin }
		},
		staleTime: 10_000,
		refetchInterval: isWails ? 10_000 : false,
	})

	const url = data?.url ?? ''

	return (
		<div className='flex items-center gap-2 border rounded-md px-2 py-1 bg-background shrink-0'>
			<div className='bg-white rounded p-0.5 shrink-0'>
				{url ? (
					<QRCode value={url} size={28} />
				) : (
					<div className='w-7 h-7 rounded bg-muted' />
				)}
			</div>
			<div className='hidden desktop:flex flex-col min-w-0'>
				<div className='text-[10px] text-muted-foreground leading-tight'>
					Accès distant
				</div>
				<div className='text-xs font-medium truncate max-w-[180px] leading-tight'>
					{url || '—'}
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
				<div className='flex items-center gap-2 mb-3'>
					<div className='w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0'>
						{Icon && <Icon className={`h-5 w-5 ${module.iconColor}`} />}
					</div>
					<div>
						<h2 className={`text-base font-semibold ${module.color}`}>
							{module.name}
						</h2>
						<p className='text-xs text-muted-foreground'>
							{module.pole.toUpperCase()}
						</p>
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
