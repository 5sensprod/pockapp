import { usePresenceSessions } from '@/lib/presence/use-presence'
import type { PresenceSession } from '@/lib/presence/use-presence'
// frontend/modules/home/components/ConnectedClients.tsx
import { usePocketBase } from '@/lib/use-pocketbase'
import {
	CheckSquare,
	ChevronDown,
	ChevronUp,
	Circle,
	Clock,
	Monitor,
	Package,
	RefreshCw,
	Send,
	ShoppingCart,
	User,
	UserCog,
	Wifi,
	WifiOff,
} from 'lucide-react'
import { useState } from 'react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function roleLabel(role: string) {
	switch (role) {
		case 'admin':
			return 'Admin'
		case 'manager':
			return 'Manager'
		case 'caissier':
			return 'Caisse'
		case 'user':
			return 'Opérateur'
		default:
			return role
	}
}

function roleIcon(role: string) {
	switch (role) {
		case 'admin':
			return UserCog
		case 'manager':
			return UserCog
		case 'caissier':
			return ShoppingCart
		case 'user':
			return Package
		default:
			return User
	}
}

function roleColor(role: string) {
	switch (role) {
		case 'admin':
			return {
				bg: 'bg-violet-500/10',
				text: 'text-violet-600',
				dot: 'bg-violet-500',
				border: 'border-violet-200',
			}
		case 'manager':
			return {
				bg: 'bg-blue-500/10',
				text: 'text-blue-600',
				dot: 'bg-blue-500',
				border: 'border-blue-200',
			}
		case 'caissier':
			return {
				bg: 'bg-emerald-500/10',
				text: 'text-emerald-600',
				dot: 'bg-emerald-500',
				border: 'border-emerald-200',
			}
		case 'user':
			return {
				bg: 'bg-amber-500/10',
				text: 'text-amber-600',
				dot: 'bg-amber-500',
				border: 'border-amber-200',
			}
		default:
			return {
				bg: 'bg-slate-100',
				text: 'text-slate-600',
				dot: 'bg-slate-400',
				border: 'border-slate-200',
			}
	}
}

function formatConnectedSince(iso: string) {
	const d = new Date(iso)
	return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatLastSeen(secondsAgo: number) {
	if (secondsAgo < 15) return 'En ligne'
	if (secondsAgo < 60) return `il y a ${secondsAgo}s`
	return `il y a ${Math.floor(secondsAgo / 60)}min`
}

function isStale(secondsAgo: number) {
	return secondsAgo > 35
}

// ── Sous-composant : carte d'un poste ────────────────────────────────────────

function SessionCard({
	session,
	onMessage,
	onTask,
}: {
	session: PresenceSession
	onMessage: (s: PresenceSession) => void
	onTask: (s: PresenceSession) => void
}) {
	const colors = roleColor(session.role)
	const Icon = roleIcon(session.role)
	const stale = isStale(session.secondsAgo)

	return (
		<div
			className={`
        group relative flex items-center gap-3 rounded-xl border bg-white px-4 py-3
        shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-px
        ${stale ? 'opacity-60' : ''}
        ${colors.border}
      `}
		>
			{/* Icône rôle */}
			<div
				className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}
			>
				<Icon className={`h-4 w-4 ${colors.text}`} />
			</div>

			{/* Infos */}
			<div className='min-w-0 flex-1'>
				<div className='flex items-center gap-2'>
					<span className='truncate text-sm font-semibold text-slate-800'>
						{session.name || session.email}
					</span>
					<span
						className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}
					>
						{roleLabel(session.role)}
					</span>
				</div>
				<div className='mt-0.5 flex items-center gap-2 text-[11px] text-slate-400'>
					<span className='flex items-center gap-1'>
						<Circle
							className={`h-1.5 w-1.5 fill-current ${stale ? 'text-amber-400' : 'text-emerald-500'}`}
						/>
						{formatLastSeen(session.secondsAgo)}
					</span>
					<span className='text-slate-200'>·</span>
					<span className='flex items-center gap-1'>
						<Clock className='h-3 w-3' />
						depuis {formatConnectedSince(session.connectedAt)}
					</span>
					<span className='text-slate-200'>·</span>
					<span className='truncate font-mono'>
						{session.ip.replace(/:\d+$/, '')}
					</span>
				</div>
			</div>

			{/* Actions — visibles au hover */}
			<div className='flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
				<button
					type='button'
					onClick={() => onMessage(session)}
					onKeyDown={(e) => e.key === 'Enter' && onMessage(session)}
					className='flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600'
					title='Envoyer un message'
				>
					<Send className='h-3.5 w-3.5' />
				</button>
				<button
					type='button'
					onClick={() => onTask(session)}
					onKeyDown={(e) => e.key === 'Enter' && onTask(session)}
					className='flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-600'
					title='Assigner une tâche'
				>
					<CheckSquare className='h-3.5 w-3.5' />
				</button>
			</div>
		</div>
	)
}

// ── Modal message / tâche ────────────────────────────────────────────────────

function ActionModal({
	session,
	mode,
	onClose,
}: {
	session: PresenceSession
	mode: 'message' | 'task'
	onClose: () => void
}) {
	const [text, setText] = useState('')
	const [sent, setSent] = useState(false)

	const handleSend = () => {
		if (!text.trim()) return
		console.log(`[${mode}] → ${session.userId}:`, text)
		setSent(true)
		setTimeout(onClose, 1200)
	}

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm'>
			{/* Overlay cliquable / accessible */}
			<div
				role='button'
				tabIndex={0}
				aria-label='Fermer'
				className='absolute inset-0'
				onClick={onClose}
				onKeyDown={(e) => e.key === 'Escape' && onClose()}
			/>
			{/* Carte modale */}
			<div className='relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl'>
				<div className='mb-4 flex items-center gap-3'>
					<div
						className={`flex h-8 w-8 items-center justify-center rounded-lg ${roleColor(session.role).bg}`}
					>
						{mode === 'message' ? (
							<Send className={`h-4 w-4 ${roleColor(session.role).text}`} />
						) : (
							<CheckSquare
								className={`h-4 w-4 ${roleColor(session.role).text}`}
							/>
						)}
					</div>
					<div>
						<p className='text-sm font-semibold text-slate-800'>
							{mode === 'message' ? 'Message' : 'Tâche'} →{' '}
							{session.name || session.email}
						</p>
						<p className='text-xs text-slate-400'>{roleLabel(session.role)}</p>
					</div>
				</div>

				{sent ? (
					<div className='flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700'>
						✓ {mode === 'message' ? 'Message envoyé' : 'Tâche assignée'}
					</div>
				) : (
					<>
						<textarea
							value={text}
							onChange={(e) => setText(e.target.value)}
							placeholder={
								mode === 'message'
									? 'Votre message…'
									: 'Description de la tâche…'
							}
							className='w-full resize-none rounded-lg border border-slate-200 p-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 focus:border-slate-400 focus:ring-0'
							rows={3}
						/>
						<div className='mt-3 flex gap-2'>
							<button
								type='button'
								onClick={onClose}
								className='flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50'
							>
								Annuler
							</button>
							<button
								type='button'
								onClick={handleSend}
								disabled={!text.trim()}
								className='flex-1 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40'
							>
								{mode === 'message' ? 'Envoyer' : 'Assigner'}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}

// ── Composant principal ──────────────────────────────────────────────────────

export function ConnectedClients() {
	const pb = usePocketBase()
	const isAdmin = (pb.authStore.model as any)?.role === 'admin'

	const {
		data: sessions = [],
		isLoading,
		dataUpdatedAt,
		refetch,
		isFetching,
	} = usePresenceSessions(isAdmin)

	const [collapsed, setCollapsed] = useState(false)
	const [action, setAction] = useState<{
		session: PresenceSession
		mode: 'message' | 'task'
	} | null>(null)

	if (!isAdmin) return null

	const online = sessions.filter((s: PresenceSession) => !isStale(s.secondsAgo))
	const stale = sessions.filter((s: PresenceSession) => isStale(s.secondsAgo))

	const byRole = sessions.reduce<Record<string, number>>(
		(acc: Record<string, number>, s: PresenceSession) => {
			acc[s.role] = (acc[s.role] || 0) + 1
			return acc
		},
		{},
	)

	const lastUpdate = dataUpdatedAt
		? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			})
		: '–'

	return (
		<>
			<div className='rounded-2xl border border-slate-100 bg-slate-50/60 p-4'>
				{/* Header */}
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-3'>
						<div className='flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white shadow-sm'>
							<Monitor className='h-4 w-4 text-slate-600' />
						</div>
						<div>
							<h2 className='text-sm font-semibold text-slate-700'>
								Postes connectés
							</h2>
							<p className='text-[11px] text-slate-400'>
								Mis à jour à {lastUpdate}
							</p>
						</div>
					</div>

					<div className='flex items-center gap-2'>
						{(Object.entries(byRole) as [string, number][]).map(
							([role, count]) => {
								const c = roleColor(role)
								return (
									<span
										key={role}
										className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.bg} ${c.text}`}
									>
										{count} {roleLabel(role)}
										{count > 1 ? 's' : ''}
									</span>
								)
							},
						)}

						<span
							className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
								sessions.length > 0
									? 'bg-emerald-50 text-emerald-700'
									: 'bg-slate-100 text-slate-500'
							}`}
						>
							{sessions.length > 0 ? (
								<Wifi className='h-3 w-3' />
							) : (
								<WifiOff className='h-3 w-3' />
							)}
							{sessions.length} en ligne
						</span>

						<button
							type='button'
							onClick={() => refetch()}
							disabled={isFetching}
							className='flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-700 hover:shadow-sm disabled:opacity-40'
							title='Rafraîchir'
						>
							<RefreshCw
								className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
							/>
						</button>

						<button
							type='button'
							onClick={() => setCollapsed((v) => !v)}
							className='flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-700'
						>
							{collapsed ? (
								<ChevronDown className='h-3.5 w-3.5' />
							) : (
								<ChevronUp className='h-3.5 w-3.5' />
							)}
						</button>
					</div>
				</div>

				{/* Contenu repliable */}
				{!collapsed && (
					<div className='mt-3'>
						{isLoading ? (
							<div className='flex items-center justify-center py-6 text-sm text-slate-400'>
								<RefreshCw className='mr-2 h-4 w-4 animate-spin' />
								Chargement…
							</div>
						) : sessions.length === 0 ? (
							<div className='flex flex-col items-center justify-center gap-1 py-6'>
								<WifiOff className='h-5 w-5 text-slate-300' />
								<p className='text-sm text-slate-400'>
									Aucun poste distant connecté
								</p>
							</div>
						) : (
							<div className='space-y-2'>
								{online.map((s: PresenceSession) => (
									<SessionCard
										key={s.sessionId}
										session={s}
										onMessage={(sess) =>
											setAction({ session: sess, mode: 'message' })
										}
										onTask={(sess) =>
											setAction({ session: sess, mode: 'task' })
										}
									/>
								))}

								{stale.length > 0 && (
									<>
										<p className='pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300'>
											Signal faible
										</p>
										{stale.map((s: PresenceSession) => (
											<SessionCard
												key={s.sessionId}
												session={s}
												onMessage={(sess) =>
													setAction({ session: sess, mode: 'message' })
												}
												onTask={(sess) =>
													setAction({ session: sess, mode: 'task' })
												}
											/>
										))}
									</>
								)}
							</div>
						)}
					</div>
				)}
			</div>

			{action && (
				<ActionModal
					session={action.session}
					mode={action.mode}
					onClose={() => setAction(null)}
				/>
			)}
		</>
	)
}
