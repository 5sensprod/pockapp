// frontend/routes/index.tsx
import { ModulePageShell } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { poles } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'
import { homeDashboardManifest } from '@/modules/home'
import { ConnectedClients } from '@/modules/home/components/ConnectedClients'
import { GetNetworkInfo } from '@/wailsjs/go/main/App'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import QRCode from 'react-qr-code'
import { toast } from 'sonner'
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
				<ConnectedClients />
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

	const url: string = data?.url ?? ''
	// `ip` et `all` ne viennent que du binding Wails (app.go:129). Hors Wails on
	// n'a que l'origine du navigateur : on la montre telle quelle.
	const ip: string = data?.ip ?? url.replace(/^https?:\/\//, '').split(':')[0]
	const autres: string[] = (data?.all ?? []).filter((a: string) => a !== ip)

	if (!url) {
		return <div className='h-9 w-9 rounded bg-muted shrink-0' />
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type='button'
					title="Adresse d'accès depuis un autre poste"
					className='flex items-center gap-2 border rounded-md px-2 py-1 bg-background shrink-0 hover:bg-muted transition-colors'
				>
					<div className='bg-white rounded p-0.5 shrink-0'>
						<QRCode value={url} size={28} />
					</div>
					{/* L'IP seule, pas l'URL : c'est ce que le vendeur tape, et ça
					    tient sans tronquer. Le reste est dans le popover. */}
					<span className='hidden md:inline text-xs font-medium tabular-nums'>
						{ip}
					</span>
				</button>
			</PopoverTrigger>

			<PopoverContent align='end' className='w-64 space-y-3'>
				<div>
					<div className='text-sm font-semibold'>
						Accès depuis un autre poste
					</div>
					<p className='text-xs text-muted-foreground'>
						Scannez le code ou saisissez l'adresse dans un navigateur.
					</p>
				</div>

				<div className='flex justify-center bg-white rounded p-2'>
					<QRCode value={url} size={140} />
				</div>

				<div className='flex items-center gap-2'>
					<code className='flex-1 text-xs bg-muted rounded px-2 py-1 truncate'>
						{url}
					</code>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={() => {
							navigator.clipboard.writeText(url)
							toast.success('Adresse copiée')
						}}
					>
						Copier
					</Button>
				</div>

				{autres.length > 0 && (
					// Repli fermé : ne s'ouvre que si l'adresse retenue ne marche pas.
					// Le filtre de `GetLocalIP` écarte les adaptateurs virtuels des
					// antivirus et VPN, mais il ne peut pas tout deviner.
					<details className='text-xs text-muted-foreground'>
						<summary className='cursor-pointer'>
							Autres adresses de ce poste
						</summary>
						<ul className='mt-1 space-y-0.5 tabular-nums'>
							{autres.map((a) => (
								<li key={a}>{a}</li>
							))}
						</ul>
					</details>
				)}
			</PopoverContent>
		</Popover>
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
