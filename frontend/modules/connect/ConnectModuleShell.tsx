// frontend/modules/connect/ConnectModuleShell.tsx
//
// Shell contextuel du module Connect.
// Injecte le badge entreprise + les actions contextuelles dans ModulePageShell.
//
// Pattern identique à CashModuleShell — même slots, même conventions.
//
// Slots disponibles pour les pages :
//   headerLeft    → zone gauche (bouton retour, breadcrumb, infos client…)
//   headerCenter  → zone centre (barre de recherche…)
//   headerRight   → zone droite avant le bouton d'action principal
//   primaryAction → override complet du bouton CTA (défaut : "Nouveau client")
//   hideBadge     → masque le badge entreprise (pages détail / formulaire)
//   hideTitle     → masque le nom du module
//   hideIcon      → masque l'icône du module

import { ModulePageShell, StatusBadge } from '@/components/module-ui'
import type { ModuleManifest } from '@/modules/_registry'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { manifest } from './manifest'
import { useConnectShell } from './useConnectShell.tsx'

export interface ConnectModuleShellProps {
	children: ReactNode

	// Override titre / icône pour les sous-pages (ex : "Modifier client")
	pageTitle?: string
	pageIcon?: LucideIcon

	// Slots header
	headerLeft?: ReactNode // bouton retour, breadcrumb, nom du client…
	headerCenter?: ReactNode // barre de recherche, filtres…
	headerRight?: ReactNode // actions contextuelles de la page

	// CTA principal dans la zone actions — remplace le bouton par défaut
	// Passer null pour masquer complètement le CTA
	primaryAction?: ReactNode

	// Masquage
	hideBadge?: boolean
	hideTitle?: boolean
	hideIcon?: boolean
}

export function ConnectModuleShell({
	children,
	pageTitle,
	pageIcon,
	headerLeft,
	headerCenter,
	headerRight,
	primaryAction,
	hideBadge = false,
	hideTitle = false,
	hideIcon = false,
}: ConnectModuleShellProps) {
	const shell = useConnectShell()

	// Override contextuel du manifest (sous-pages : édition, détail…)
	const contextualManifest: ModuleManifest = pageTitle
		? {
				...manifest,
				name: pageTitle,
				description: '',
				plan: undefined,
				icon: pageIcon ?? manifest.icon,
			}
		: manifest

	// Badge entreprise active — indique le contexte courant
	const badge = hideBadge ? null : (
		<StatusBadge
			label={shell.companyLabel}
			variant={shell.companyVariant}
			sublabel={shell.companySubLabel}
		/>
	)

	// Bloc actions droite
	const actions = (
		<div className='flex items-center gap-2'>
			{headerRight}

			{primaryAction !== undefined
				? primaryAction // null = masqué, JSX = affiché
				: shell.defaultPrimaryAction}
		</div>
	)

	return (
		<ModulePageShell
			manifest={contextualManifest}
			badge={badge}
			headerLeft={headerLeft}
			centerContent={headerCenter}
			actions={actions}
			hideTitle={hideTitle}
			hideIcon={hideIcon}
		>
			{children}
		</ModulePageShell>
	)
}
