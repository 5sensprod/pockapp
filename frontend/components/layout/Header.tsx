// frontend/components/layout/Header.tsx

import { Link, useNavigate } from '@tanstack/react-router'
import {
	Bell,
	Building2,
	ChevronDown,
	ChevronLeft,
	LogOut,
	RefreshCw,
	Settings,
	User,
	Wallet,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePocketAppCredits } from '@/lib/credits'
import { useNotifications } from '@/lib/notifications'

import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'

type CompanyItem = {
	id: string
	name: string
	logo?: string
	collectionId?: string
	collectionName?: string
	active?: boolean
}

interface HeaderProps {
	currentModule: ModuleManifest | null
	isHomePage: boolean
}

/**
 * Détermine la route "home" d'un module :
 * - cherche d'abord un item de config/settings dans le sidebarMenu
 * - sinon prend le premier item du premier groupe
 * - sinon fallback sur module.route
 */
function getModuleHomeRoute(module: ModuleManifest): string {
	const menu = module.sidebarMenu
	if (!menu?.length) return module.route

	// Cherche un groupe "config" ou "settings" en priorité
	const configGroup = menu.find((g) =>
		['config', 'settings', 'configuration'].includes(g.id.toLowerCase()),
	)
	const firstItem = (configGroup ?? menu[0])?.items?.[0]
	return firstItem?.to ?? module.route
}

export function Header({ currentModule, isHomePage }: HeaderProps) {
	const navigate = useNavigate()
	const { user, logout, isAuthenticated } = useAuth()
	const { companies, activeCompanyId, setActiveCompanyId } = useActiveCompany()

	const brand = currentModule?.name ?? 'PocketApp'
	const moduleMenu = currentModule?.topbarMenu || []

	// Route vers laquelle le nom du module redirige (config ou home du module)
	const moduleHomeRoute = currentModule
		? getModuleHomeRoute(currentModule)
		: '/'

	const activeCompany =
		companies.find((c: CompanyItem) => c.id === activeCompanyId) ?? companies[0]

	const userRole = (user as any)?.role || 'user'
	const isAdmin = userRole === 'admin'
	const isUtilisateur = userRole === 'user'

	const {
		items: notifications,
		unreadCount,
		markAllRead,
		markRead,
	} = useNotifications({ enabled: !!isAuthenticated })

	// ── Crédits PocketApp ──────────────────────────────────────────────────────
	const {
		balanceEur,
		loading: creditsLoading,
		error: creditsError,
		lastUpdated,
		refresh: refreshCredits,
	} = usePocketAppCredits()

	const isLowBalance = balanceEur <= 0.5
	const isEmptyBalance = balanceEur <= 0

	const userWithAvatar = user as {
		id: string
		name?: string
		email?: string
		avatar?: string
	} | null

	const avatarUrl = userWithAvatar?.avatar
		? `${document.location.origin}/api/files/users/${userWithAvatar.id}/${userWithAvatar.avatar}?thumb=100x100`
		: null

	const handleLogout = () => {
		logout()
		navigate({ to: '/login' })
	}

	const goToCompanySettings = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		navigate({ to: '/settings/companies' })
	}

	const getCompanyLogoUrl = (
		company: CompanyItem | null | undefined,
	): string | null => {
		if (!company?.logo || !company?.id) return null
		const collectionName =
			company.collectionName || company.collectionId || 'companies'
		return `${document.location.origin}/api/files/${collectionName}/${company.id}/${company.logo}?thumb=100x100`
	}

	const CompanyLogoWithFallback = ({
		company,
		size = 'sm',
	}: { company?: CompanyItem | null; size?: 'sm' | 'md' }) => {
		const logoUrl = getCompanyLogoUrl(company)
		const sizeClasses = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'

		return logoUrl ? (
			<>
				<img
					src={logoUrl}
					alt={company?.name || 'Logo'}
					className={cn(sizeClasses, 'rounded object-cover')}
					onError={(e) => {
						e.currentTarget.style.display = 'none'
						const fallback = e.currentTarget.nextElementSibling as HTMLElement
						if (fallback) fallback.classList.remove('hidden')
					}}
				/>
				<Building2
					className={cn(sizeClasses, 'text-muted-foreground hidden')}
				/>
			</>
		) : (
			<Building2 className={cn(sizeClasses, 'text-muted-foreground')} />
		)
	}

	return (
		<header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
			<div className='container flex h-14 items-center justify-between px-6'>
				<div className='flex items-center gap-8'>
					<div className='flex items-center gap-2'>
						{/* Flèche retour → toujours vers l'accueil de l'application */}
						{currentModule && !isHomePage && (
							<Button
								variant='ghost'
								size='icon'
								className='h-8 w-8'
								onClick={() => navigate({ to: '/' })}
							>
								<ChevronLeft className='h-5 w-5' />
							</Button>
						)}

						{/* Nom du module → vers la page config/home du module (ou / si on est home) */}
						<Link
							to={currentModule ? (moduleHomeRoute as any) : '/'}
							className='flex items-center gap-2 font-bold text-lg'
						>
							<div className='w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm'>
								P
							</div>
							{brand}
						</Link>
					</div>

					{moduleMenu.length > 0 && (
						<nav className='flex gap-4'>
							{moduleMenu.map((item) => (
								<NavLink key={item.to} to={item.to} icon={item.icon}>
									{item.label}
								</NavLink>
							))}
						</nav>
					)}
				</div>

				<div className='flex items-center gap-2'>
					{/* ── Badge crédits IA ────────────────────────────────────────── */}
					{!isUtilisateur && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<div
										className={cn(
											'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
											creditsLoading && 'opacity-50',
											creditsError &&
												'border-yellow-300 bg-yellow-50 text-yellow-700',
											!creditsError &&
												isEmptyBalance &&
												'border-red-300 bg-red-50 text-red-700',
											!creditsError &&
												!isEmptyBalance &&
												isLowBalance &&
												'border-orange-300 bg-orange-50 text-orange-700',
											!creditsError &&
												!isEmptyBalance &&
												!isLowBalance &&
												'border-border bg-muted/50 text-muted-foreground',
										)}
									>
										<Wallet className='h-3.5 w-3.5' />
										<span>
											{creditsLoading
												? '...'
												: creditsError
													? '⚠ erreur'
													: `${balanceEur.toFixed(4)} €`}
										</span>
										<button
											type='button'
											onClick={(e) => {
												e.stopPropagation()
												refreshCredits()
											}}
											className='ml-0.5 hover:opacity-70 transition-opacity'
											title='Rafraîchir'
										>
											<RefreshCw
												className={cn(
													'h-3 w-3',
													creditsLoading && 'animate-spin',
												)}
											/>
										</button>
									</div>
								</TooltipTrigger>
								<TooltipContent side='bottom' className='text-xs'>
									<p className='font-medium'>Crédits IA restants</p>
									{lastUpdated && (
										<p className='text-muted-foreground'>
											Mis à jour : {lastUpdated.toLocaleTimeString('fr-FR')}
										</p>
									)}
									{isLowBalance && !isEmptyBalance && (
										<p className='text-orange-600 mt-1'>⚠ Solde faible</p>
									)}
									{isEmptyBalance && (
										<p className='text-red-600 mt-1'>✕ Solde épuisé</p>
									)}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}

					{isAdmin && companies.length > 0 && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant='ghost' size='sm' className='gap-2'>
									<CompanyLogoWithFallback company={activeCompany} />
									<span className='hidden md:inline'>
										{activeCompany?.name ?? 'Entreprise'}
									</span>
									<ChevronDown className='h-4 w-4 opacity-50' />
								</Button>
							</DropdownMenuTrigger>

							<DropdownMenuContent align='end' className='w-56 p-0'>
								<DropdownMenuLabel className='px-3 py-2'>
									Entreprises
								</DropdownMenuLabel>
								<DropdownMenuSeparator />

								{companies.map((company: CompanyItem) => (
									<DropdownMenuItem
										key={company.id}
										className='px-3 py-2'
										onClick={() =>
											company.id !== activeCompanyId &&
											setActiveCompanyId(company.id)
										}
									>
										<div className='flex items-center w-full gap-2'>
											<CompanyLogoWithFallback company={company} />
											<span className='flex-1 truncate'>{company.name}</span>

											{company.id === activeCompanyId && (
												<div className='h-2 w-2 rounded-full bg-green-500' />
											)}

											<button
												type='button'
												className='p-1 rounded hover:bg-accent'
												onClick={goToCompanySettings}
											>
												<Settings className='h-4 w-4 text-muted-foreground' />
											</button>
										</div>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{!isAdmin && activeCompany && (
						<div className='flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground'>
							<CompanyLogoWithFallback company={activeCompany} />
							<span className='hidden md:inline'>{activeCompany.name}</span>
						</div>
					)}

					<DropdownMenu onOpenChange={(open) => open && markAllRead()}>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='relative'>
								<Bell className='h-5 w-5' />
								{unreadCount > 0 && (
									<span className='absolute top-1 right-1 h-2 w-2 rounded-full bg-red-600' />
								)}
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align='end' className='w-80'>
							<DropdownMenuLabel>Notifications</DropdownMenuLabel>
							<DropdownMenuSeparator />

							{notifications.length === 0 ? (
								<div className='px-3 py-4 text-sm text-muted-foreground'>
									Aucune notification.
								</div>
							) : (
								notifications.slice(0, 8).map((notif) => (
									<DropdownMenuItem
										key={notif.id}
										className='py-3'
										onClick={() => {
											markRead(notif.id)
											if (notif.type === 'update') {
												window.dispatchEvent(
													new CustomEvent('app:updateAvailable', {
														detail: notif.meta ?? {},
													}),
												)
											}
										}}
									>
										<div className='flex items-start gap-3 w-full'>
											<div
												className={cn(
													'w-2 h-2 rounded-full mt-1.5',
													notif.unread ? 'bg-blue-600' : 'bg-muted',
												)}
											/>
											<div className='flex-1'>
												<div className='text-sm font-medium'>{notif.title}</div>
												<div className='text-sm text-muted-foreground'>
													{notif.text}
												</div>
											</div>
										</div>
									</DropdownMenuItem>
								))
							)}
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='rounded-full'>
								{avatarUrl ? (
									<img
										src={avatarUrl}
										alt='avatar'
										className='w-8 h-8 rounded-full object-cover'
									/>
								) : (
									<div className='w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center'>
										<User className='h-4 w-4' />
									</div>
								)}
							</Button>
						</DropdownMenuTrigger>

						<DropdownMenuContent align='end' className='w-56'>
							<DropdownMenuLabel>
								<div className='flex flex-col space-y-1'>
									<p className='text-sm font-medium'>
										{user?.name ?? 'Utilisateur'}
									</p>
									<p className='text-xs text-muted-foreground'>{user?.email}</p>
									<Badge variant='secondary' className='w-fit mt-1 text-xs'>
										{userRole}
									</Badge>
								</div>
							</DropdownMenuLabel>

							<DropdownMenuSeparator />

							<DropdownMenuItem asChild>
								<Link to='/settings'>
									<User className='h-4 w-4 mr-2' />
									Mon compte
								</Link>
							</DropdownMenuItem>

							<DropdownMenuItem asChild>
								<Link to='/settings'>
									<Settings className='h-4 w-4 mr-2' />
									Paramètres
								</Link>
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuItem className='text-red-600' onClick={handleLogout}>
								<LogOut className='h-4 w-4 mr-2' />
								Déconnexion
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</header>
	)
}

interface NavLinkProps {
	to: string
	icon?: ComponentType<{ className?: string }>
	children: React.ReactNode
}

function NavLink({ to, icon: Icon, children }: NavLinkProps) {
	return (
		<Link
			to={to}
			className={cn(
				'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
				'hover:bg-accent hover:text-accent-foreground',
				'[&.active]:bg-accent [&.active]:text-accent-foreground',
			)}
			activeProps={{ className: 'bg-accent text-accent-foreground' }}
		>
			{Icon && <Icon className='h-4 w-4' />}
			{children}
		</Link>
	)
}
