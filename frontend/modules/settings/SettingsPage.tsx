// frontend/modules/settings/SettingsPage.tsx
import SmtpSettings from '@/components/settings/SmtpSettings'
import UserManagement from '@/components/settings/UserManagement'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/modules/auth/AuthProvider'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Mail, User, Users } from 'lucide-react'

const settingsTabs = [
	{
		id: 'account',
		label: 'Mon compte',
		icon: User,
		path: '/settings',
		adminOnly: false,
	},
	{
		id: 'users',
		label: 'Utilisateurs',
		icon: Users,
		path: '/settings/users',
		adminOnly: true,
	},
	{
		id: 'smtp',
		label: 'Emails (SMTP)',
		icon: Mail,
		path: '/settings/smtp',
		adminOnly: false,
	},
]

interface SettingsPageProps {
	tab?: 'account' | 'smtp' | 'users'
}

export function SettingsPage({ tab = 'account' }: SettingsPageProps) {
	const { pathname } = useLocation()
	const navigate = useNavigate()
	const { user } = useAuth()

	// Vérifier le rôle de l'utilisateur
	const userRole = (user as any)?.role || 'user'
	const isAdmin = userRole === 'admin'

	const activeTab = settingsTabs.find((t) => t.path === pathname)?.id ?? tab

	// Filtrer les onglets selon le rôle
	const visibleTabs = settingsTabs.filter((tab) => {
		if (tab.adminOnly && !isAdmin) {
			return false
		}
		return true
	})

	return (
		<div className='container py-8'>
			{/* Header avec bouton retour */}
			<div className='mb-8'>
				<div className='flex items-center gap-4 mb-2'>
					<Button
						variant='ghost'
						size='icon'
						className='h-8 w-8'
						onClick={() => navigate({ to: '/' })}
					>
						<ChevronLeft className='h-5 w-5' />
					</Button>
					<h1 className='text-3xl font-bold'>Paramètres</h1>
				</div>
				<p className='text-muted-foreground ml-12'>
					Gérez les paramètres de votre compte et de l'application.
				</p>
			</div>

			<div className='flex flex-col md:flex-row gap-8'>
				{/* Sidebar navigation */}
				<nav className='w-full md:w-64 space-y-1'>
					{visibleTabs.map((item) => {
						const Icon = item.icon
						const isActive = activeTab === item.id

						return (
							<Link
								key={item.id}
								to={item.path}
								className={cn(
									'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
									isActive
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground',
								)}
							>
								<Icon className='h-4 w-4' />
								{item.label}
							</Link>
						)
					})}
				</nav>

				{/* Content */}
				<div className='flex-1 min-w-0'>
					{activeTab === 'account' && <AccountSettings />}
					{activeTab === 'users' && isAdmin && <UserManagement />}
					{activeTab === 'smtp' && <SmtpSettings />}
				</div>
			</div>
		</div>
	)
}

function AccountSettings() {
	return (
		<div className='max-w-2xl'>
			<div className='bg-card rounded-lg border p-6'>
				<h2 className='text-xl font-semibold mb-4'>Mon compte</h2>
				<p className='text-muted-foreground'>
					Les paramètres du compte seront disponibles ici.
				</p>
			</div>
		</div>
	)
}
