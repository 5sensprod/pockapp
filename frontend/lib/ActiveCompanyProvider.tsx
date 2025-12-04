// frontend/lib/ActiveCompanyProvider.tsx
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { useCompanies } from '@/lib/queries/companies'
import { useAuth } from '@/modules/auth/AuthProvider'
import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react'

type CompanyForContext = {
	id: string
	name: string
	active?: boolean
}

interface ActiveCompanyContextType {
	activeCompanyId: string | null
	setActiveCompanyId: (id: string | null) => void
	isLoading: boolean
	companies: CompanyForContext[]
}

const ActiveCompanyContext = createContext<
	ActiveCompanyContextType | undefined
>(undefined)

const ACTIVE_COMPANY_KEY = 'activeCompanyId'

export function ActiveCompanyProvider({
	children,
}: {
	children: ReactNode
}) {
	const { isAuthenticated } = useAuth()

	const { data: companiesData, isLoading } = useCompanies({
		enabled: isAuthenticated,
	})

	const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(
		() => {
			// Initialiser depuis localStorage
			if (typeof window !== 'undefined') {
				return localStorage.getItem(ACTIVE_COMPANY_KEY)
			}
			return null
		},
	)

	// getFullList retourne un tableau directement
	const companies: CompanyForContext[] = useMemo(() => {
		if (!companiesData) return []
		return companiesData.map((c: CompaniesResponse) => ({
			id: c.id,
			name: c.trade_name || c.name,
			active: c.active,
		}))
	}, [companiesData])

	// Sélectionner automatiquement une entreprise si aucune n'est active
	useEffect(() => {
		if (!companies.length) return

		// Si l'entreprise active n'existe plus dans la liste, la réinitialiser
		const currentExists = companies.some(
			(c: CompanyForContext) => c.id === activeCompanyId,
		)
		if (activeCompanyId && currentExists) return

		// Chercher une entreprise active ou prendre la première
		const activeCompany = companies.find((c: CompanyForContext) => c.active)
		const newActiveId = activeCompany?.id ?? companies[0]?.id ?? null

		if (newActiveId) {
			setActiveCompanyIdState(newActiveId)
			localStorage.setItem(ACTIVE_COMPANY_KEY, newActiveId)
		}
	}, [companies, activeCompanyId])

	// Handler pour changer l'entreprise active
	const setActiveCompanyId = (id: string | null) => {
		setActiveCompanyIdState(id)
		if (id) {
			localStorage.setItem(ACTIVE_COMPANY_KEY, id)
		} else {
			localStorage.removeItem(ACTIVE_COMPANY_KEY)
		}
	}

	return (
		<ActiveCompanyContext.Provider
			value={{
				activeCompanyId,
				setActiveCompanyId,
				isLoading,
				companies,
			}}
		>
			{children}
		</ActiveCompanyContext.Provider>
	)
}

export function useActiveCompany(): ActiveCompanyContextType {
	const context = useContext(ActiveCompanyContext)
	if (context === undefined) {
		throw new Error(
			'useActiveCompany must be used within an ActiveCompanyProvider',
		)
	}
	return context
}
