// frontend/components/layout/Header.tsx
// ✅ 1) Supprime complètement la prop notifications (elle est désormais interne)
// ✅ 2) Le Header récupère ses notifications via un hook/store interne

import { Link, useNavigate } from '@tanstack/react-router'
import {
	Bell,
	Building2,
	ChevronDown,
	ChevronLeft,
	LogOut,
	Settings,
	User,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'

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
import { useNotifications } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import type { ModuleManifest } from '@/modules/_registry'
import { useAuth } from '@/modules/auth/AuthProvider'
import { toast } from 'sonner'
import { CompanyDialog } from './CompanyDialog'

type CompanyItem = {
	id: string
	name: string
	active?: boolean
}

interface HeaderProps {
	currentModule: ModuleManifest | null
	isHomePage: boolean
}

export function Header({ currentModule, isHomePage }: HeaderProps) {
	const navigate = useNavigate()
	const { user, logout, isAuthenticated } = useAuth()

	const { companies, activeCompanyId, setActiveCompanyId } = useActiveCompany()

	const [isCompanyDialogOpen, setIsCompanyDialogOpen] = useState(false)
	const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)

	const brand = currentModule?.name ?? 'PocketApp'
	const moduleMenu = currentModule?.topbarMenu || []

	const activeCompany =
		companies.find((c: CompanyItem) => c.id === activeCompanyId) ?? companies[0]

	// ✅ notifications (poll MAJ toutes les heures)
	const {
		items: notifications,
		unreadCount,
		markAllRead,
		markRead,
	} = useNotifications({ enabled: !!isAuthenticated })

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

	const openCreateCompany = () => {
		setEditingCompanyId(null)
		setIsCompanyDialogOpen(true)
	}

	const openEditCompany = (id: string) => {
		setEditingCompanyId(id)
		setIsCompanyDialogOpen(true)
	}

	const handleDialogOpenChange = (open: boolean) => {
		setIsCompanyDialogOpen(open)
		if (!open) setEditingCompanyId(null)
	}

	useEffect(() => {
		if (!isHomePage) return
		if (!companies) return
		if (companies.length > 0) return

		const alreadyShown = localStorage.getItem('company_setup_prompt_shown')
		if (alreadyShown === '1') return

		setIsCompanyDialogOpen(true)
		toast.info(
			'Commence par créer ton entreprise pour pouvoir utiliser les modules (clients, produits, etc.).',
		)
		localStorage.setItem('company_setup_prompt_shown', '1')
	}, [isHomePage, companies])

	return (
		<>
			<header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
				<div className='container flex h-14 items-center justify-between px-6'>
					<div className='flex items-center gap-8'>
						<div className='flex items-center gap-2'>
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

							{isHomePage ? (
								<Link
									to='/'
									className='flex items-center gap-2 font-bold text-lg'
								>
									<div className='w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm'>
										P
									</div>
									{brand}
								</Link>
							) : (
								<div className='flex items-center gap-2 font-bold text-lg'>
									<div className='w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm'>
										P
									</div>
									{brand}
								</div>
							)}
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
						{companies.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant='ghost'
										size='sm'
										className='gap-2 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none'
									>
										<Building2 className='h-4 w-4' />
										<span className='hidden md:inline'>
											{activeCompany?.name ?? 'Entreprise'}
										</span>
										<ChevronDown className='h-4 w-4 opacity-50' />
									</Button>
								</DropdownMenuTrigger>

								<DropdownMenuContent align='end' className='w-48 p-0'>
									<DropdownMenuLabel className='px-3 py-2'>
										Entreprises
									</DropdownMenuLabel>
									<DropdownMenuSeparator />

									{companies.map((company: CompanyItem) => (
										<DropdownMenuItem
											key={company.id}
											className='px-3 py-2 cursor-pointer'
											onClick={() => {
												if (company.id !== activeCompanyId)
													setActiveCompanyId(company.id)
											}}
										>
											<div className='flex items-center w-full gap-2'>
												<Building2 className='h-4 w-4 text-muted-foreground' />
												<span className='flex-1 truncate'>{company.name}</span>

												<button
													type='button'
													className='p-1 rounded hover:bg-accent'
													onClick={(e) => {
														e.preventDefault()
														e.stopPropagation()
														openEditCompany(company.id)
													}}
												>
													<Settings className='h-4 w-4 text-muted-foreground' />
												</button>
											</div>
										</DropdownMenuItem>
									))}

									<DropdownMenuSeparator />

									<DropdownMenuItem
										className='px-3 py-2 cursor-pointer'
										onClick={(e) => {
											e.preventDefault()
											openCreateCompany()
										}}
									>
										<div className='flex items-center gap-2'>
											<span className='text-lg leading-none'>+</span>
											<span>Ajouter</span>
										</div>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}

						{companies.length === 0 && (
							<Button
								variant='outline'
								size='sm'
								className='gap-2'
								onClick={openCreateCompany}
							>
								<Building2 className='h-4 w-4' />
								<span className='hidden md:inline'>Créer mon entreprise</span>
							</Button>
						)}

						{/* 🔔 Notifications */}
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
													<div className='text-sm font-medium'>
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

								<DropdownMenuSeparator />
								<DropdownMenuItem className='justify-center text-sm text-muted-foreground'>
									Voir toutes les notifications
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						{/* 👤 Menu utilisateur */}
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
										<p className='text-xs text-muted-foreground'>
											{user?.email}
										</p>
										<Badge
											variant='secondary'
											className='w-fit mt-1 text-xs capitalize'
										>
											{((user as any)?.role === 'admin' && 'Administrateur') ||
												((user as any)?.role === 'manager' && 'Manager') ||
												((user as any)?.role === 'caissier' && 'Caissier') ||
												'Utilisateur'}
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
									className='text-red-600'
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

			<CompanyDialog
				isOpen={isCompanyDialogOpen}
				onOpenChange={handleDialogOpenChange}
				companyId={editingCompanyId}
			/>
		</>
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
