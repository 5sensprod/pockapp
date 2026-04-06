// frontend/components/layout/Header.tsx
//
// Tokens Stitch appliqués :
//   Height           : h-header (var(--header-h) = 56px)
//   Brand logo       : bg-primary (= #1E1B4B via shadcn token)
//   Notifications    : point non-lu → bg-destructive
//   Crédits badge    : états sémantiques via variables shadcn + amber/destructive
//   Entreprise       : point actif → bg-emerald-500
//   No-Line rule     : border-b supprimé → séparation par bg-muted du ModulePageShell
//
// Stratégie responsive :
//   mobile  (<640px)  : [Logo "P"] ·············· [Notif] [Avatar]
//   sm      (640px+)  : [←?] [Logo+brand] ······· boutons 44px
//   tablet  (768px+)  : [←?] [Logo+brand] ······· [Crédits icône] [Entreprise icône] [Notif 48px] [Avatar 48px]
//   desktop (1024px+) : [←?] [Logo+brand] [nav] · [Crédits badge] [Entreprise label] [Notif] [Avatar]

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
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { usePocketAppCredits } from '@/lib/credits'
import { useBreakpoint } from '@/lib/hooks/useBreakpoint'
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

function getModuleHomeRoute(module: ModuleManifest): string {
	const menu = module.sidebarMenu
	if (!menu?.length) return module.route
	const configGroup = menu.find((g) =>
		['config', 'settings', 'configuration'].includes(g.id.toLowerCase()),
	)
	const firstItem = (configGroup ?? menu[0])?.items?.[0]
	return firstItem?.to ?? module.route
}

export function Header({ currentModule, isHomePage }: HeaderProps) {
	const navigate = useNavigate()
	const { isMobile, isDesktop } = useBreakpoint()
	const { user, logout, isAuthenticated } = useAuth()
	const { companies, activeCompanyId, setActiveCompanyId } = useActiveCompany()

	const brand = currentModule?.name ?? 'PocketApp'
	const moduleMenu = currentModule?.topbarMenu || []

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

	// Crédits — état sémantique commun (réutilisé dans les deux variantes)
	const creditsBadgeClass = cn(
		'flex items-center rounded-md border text-xs font-medium transition-colors',
		creditsLoading && 'opacity-50',
		creditsError &&
			'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
		!creditsError &&
			isEmptyBalance &&
			'border-destructive/40 bg-destructive/10 text-destructive',
		!creditsError &&
			!isEmptyBalance &&
			isLowBalance &&
			'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
		!creditsError &&
			!isEmptyBalance &&
			!isLowBalance &&
			'border-border bg-muted/50 text-muted-foreground',
	)

	return (
		// Stitch : glassmorphism header — bg/95 + backdrop-blur
		// No-Line rule : pas de border-b, séparation assurée par bg-muted du ModulePageShell
		<header className='sticky top-0 z-50 w-full min-w-[200px] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
			<div className='flex h-header items-center justify-between px-4 tablet:px-6 desktop:px-8'>
				{/* ══ GAUCHE : brand + nav module ══════════════════════════════════ */}
				<div className='flex flex-1 items-center gap-3 min-w-0 tablet:gap-4 desktop:gap-8'>
					{/* Bouton retour — tablet+ seulement, via JS (cohérent avec le reste) */}
					{currentModule && !isHomePage && !isMobile && (
						<Button
							variant='ghost'
							size='icon'
							className='h-9 w-9 shrink-0'
							onClick={() => navigate({ to: '/' })}
						>
							<ChevronLeft className='h-5 w-5' />
						</Button>
					)}

					{/* Logo + brand name */}
					<Link
						to={currentModule ? (moduleHomeRoute as any) : '/'}
						className='flex items-center gap-2 font-medium text-base text-foreground min-w-0 overflow-hidden'
					>
						{/* bg-primary = #1E1B4B via token shadcn */}
						<div className='w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0'>
							P
						</div>
						{/* Brand name : visible partout sauf < 360px (très petits mobiles) */}
						<span className='hidden brand-visible truncate min-w-0'>
							{brand}
						</span>
					</Link>

					{/* Nav topbarMenu — desktop uniquement */}
					{isDesktop && moduleMenu.length > 0 && (
						<nav className='flex gap-1'>
							{moduleMenu.map((item) => (
								<NavLink key={item.to} to={item.to} icon={item.icon}>
									{item.label}
								</NavLink>
							))}
						</nav>
					)}
				</div>

				{/* ══ DROITE : crédits + entreprise + notifs + user ════════════════ */}
				<div className='flex shrink-0 items-center gap-1 tablet:gap-2 desktop:gap-3'>
					{/* ── Badge crédits IA — toujours visible, forme selon mode ──────── */}
					{/* Crédits IA — dropdown au clic, homogène avec les autres menus */}
					{!isUtilisateur && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<div
									className={cn(
										creditsBadgeClass,
										'cursor-pointer gap-1.5 min-h-[44px] tablet:min-h-[48px] justify-center',
										isDesktop ? 'px-2.5 py-1' : 'min-w-[44px] px-2 py-1',
									)}
								>
									<Wallet className='h-3.5 w-3.5 tablet:h-4 tablet:w-4 shrink-0' />
									{isDesktop && (
										<span>
											{creditsLoading
												? '...'
												: creditsError
													? '⚠ erreur'
													: `${balanceEur.toFixed(4)} €`}
										</span>
									)}
								</div>
							</DropdownMenuTrigger>

							<DropdownMenuContent align='end' className='w-64'>
								<DropdownMenuLabel className='flex items-center gap-2'>
									<Wallet className='h-4 w-4' />
									Crédits IA
								</DropdownMenuLabel>
								<DropdownMenuSeparator />

								{/* Solde */}
								<div className='px-3 py-2'>
									<p className='text-xs text-muted-foreground mb-1'>
										Solde restant
									</p>
									<p
										className={cn(
											'text-lg font-mono font-semibold',
											isEmptyBalance && 'text-destructive',
											!isEmptyBalance && isLowBalance && 'text-amber-600',
											!isEmptyBalance && !isLowBalance && 'text-foreground',
										)}
									>
										{creditsLoading
											? '...'
											: creditsError
												? '⚠ erreur de chargement'
												: `${balanceEur.toFixed(4)} €`}
									</p>
									{isLowBalance && !isEmptyBalance && (
										<p className='text-xs text-amber-600 mt-1'>
											⚠ Solde faible
										</p>
									)}
									{isEmptyBalance && (
										<p className='text-xs text-destructive mt-1'>
											✕ Solde épuisé
										</p>
									)}
								</div>

								{lastUpdated && (
									<>
										<DropdownMenuSeparator />
										<div className='px-3 py-1.5'>
											<p className='text-xs text-muted-foreground'>
												Mis à jour : {lastUpdated.toLocaleTimeString('fr-FR')}
											</p>
										</div>
									</>
								)}

								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={refreshCredits}
									className='gap-2 cursor-pointer'
								>
									<RefreshCw
										className={cn('h-4 w-4', creditsLoading && 'animate-spin')}
									/>
									Rafraîchir le solde
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{/* ── Sélecteur entreprise (admin) — toujours visible ──────────── */}
					{/* mobile/tablet : logo seul | desktop : logo + label + chevron */}
					{isAdmin && companies.length > 0 && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant='ghost'
									size='sm'
									className='gap-1 min-h-[44px] tablet:min-h-[48px] px-2'
								>
									<CompanyLogoWithFallback company={activeCompany} />
									{isDesktop && (
										<>
											<span className='max-w-[120px] truncate'>
												{activeCompany?.name ?? 'Entreprise'}
											</span>
											<ChevronDown className='h-4 w-4 opacity-50 shrink-0' />
										</>
									)}
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
												<div className='h-2 w-2 rounded-full bg-emerald-500 shrink-0' />
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

					{/* ── Entreprise (non-admin, lecture seule) — toujours visible ─── */}
					{!isAdmin && activeCompany && (
						<div className='flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground'>
							<CompanyLogoWithFallback company={activeCompany} />
							{isDesktop && (
								<span className='max-w-[120px] truncate'>
									{activeCompany.name}
								</span>
							)}
						</div>
					)}

					{/* ── Notifications ─────────────────────────────────────────────── */}
					<DropdownMenu onOpenChange={(open) => open && markAllRead()}>
						<DropdownMenuTrigger asChild>
							<Button
								variant='ghost'
								size='icon'
								className='relative min-h-[44px] min-w-[44px] tablet:min-h-[48px] tablet:min-w-[48px]'
							>
								<Bell className='h-5 w-5 tablet:h-6 tablet:w-6' />
								{unreadCount > 0 && (
									<span className='absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive' />
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
													'w-2 h-2 rounded-full mt-1.5 shrink-0',
													notif.unread
														? 'bg-primary'
														: 'bg-muted-foreground/30',
												)}
											/>
											<div className='flex-1 min-w-0'>
												<div className='text-sm font-medium truncate'>
													{notif.title}
												</div>
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

					{/* ── Avatar utilisateur ────────────────────────────────────────── */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant='ghost'
								size='icon'
								className='rounded-full min-h-[44px] min-w-[44px] tablet:min-h-[48px] tablet:min-w-[48px]'
							>
								{avatarUrl ? (
									<img
										src={avatarUrl}
										alt='avatar'
										className='w-8 h-8 rounded-full object-cover'
									/>
								) : (
									<div className='w-8 h-8 rounded-full bg-muted flex items-center justify-center'>
										<User className='h-4 w-4 text-muted-foreground' />
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

							<DropdownMenuItem
								className='text-destructive focus:text-destructive'
								onClick={handleLogout}
							>
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
				'text-muted-foreground hover:bg-accent hover:text-foreground',
				'[&.active]:bg-accent [&.active]:text-foreground',
			)}
			activeProps={{ className: 'bg-accent text-foreground' }}
		>
			{Icon && <Icon className='h-4 w-4' />}
			{children}
		</Link>
	)
}
