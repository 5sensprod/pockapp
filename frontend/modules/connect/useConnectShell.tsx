// frontend/modules/connect/useConnectShell.tsx   ← .tsx (JSX dans le hook)
//
// Hook léger dédié au ConnectModuleShell.
// Responsabilité : fournir le badge entreprise et le CTA par défaut.
//
// Intentionnellement séparé de useConnectModule pour garder la même
// séparation des responsabilités que dans le module cash :
//   useConnectShell  → état du shell (badge, navigation globale)
//   useConnectModule → état de la liste clients (recherche, pagination…)

import type { StatusVariant } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

export function useConnectShell() {
	// companies[] expose { id, name, … } — pas de activeCompanyName sur le contexte
	const { activeCompanyId, companies } = useActiveCompany()
	const navigate = useNavigate()

	// ── Badge entreprise ────────────────────────────────────────────────
	const hasCompany = Boolean(activeCompanyId)

	const activeCompany = companies.find((c) => c.id === activeCompanyId)

	const companyLabel: string = hasCompany
		? (activeCompany?.name ?? 'Entreprise active')
		: 'Aucune entreprise'

	const companyVariant: StatusVariant = hasCompany ? 'info' : 'warning'

	const companySubLabel: string = hasCompany
		? 'Entreprise active'
		: 'Sélectionnez une entreprise'

	// ── CTA par défaut — "Nouveau client" ───────────────────────────────
	// Chaque page peut l'override via le slot primaryAction de ConnectModuleShell.
	const defaultPrimaryAction = (
		<Button
			size='sm'
			onClick={() => navigate({ to: '/connect/customers/new' })}
		>
			<Plus className='h-4 w-4 mr-1.5' />
			Nouveau client
		</Button>
	)

	return {
		companyLabel,
		companyVariant,
		companySubLabel,
		hasCompany,
		defaultPrimaryAction,
	}
}

export type ConnectShellData = ReturnType<typeof useConnectShell>
