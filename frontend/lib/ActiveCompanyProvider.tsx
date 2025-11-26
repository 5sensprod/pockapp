import { useCompanies } from '@/lib/queries/companies'
import { createContext, useContext, useEffect, useState } from 'react'

interface ActiveCompanyContextType {
	activeCompanyId: string | null
	isLoading: boolean
}

const ActiveCompanyContext = createContext<
	ActiveCompanyContextType | undefined
>(undefined)

export function ActiveCompanyProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const { data: companiesData, isLoading } = useCompanies()
	const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)

	useEffect(() => {
		if (companiesData?.items) {
			const activeCompany = companiesData.items.find((c: any) => c.active)
			if (activeCompany) {
				setActiveCompanyId(activeCompany.id)
			} else if (companiesData.items.length > 0) {
				// Si aucune entreprise n'est active, prendre la première
				setActiveCompanyId(companiesData.items[0].id)
			}
		}
	}, [companiesData?.items]) // ✅ CHANGEMENT ICI : dépendre de .items plutôt que de companiesData

	return (
		<ActiveCompanyContext.Provider value={{ activeCompanyId, isLoading }}>
			{children}
		</ActiveCompanyContext.Provider>
	)
}

export function useActiveCompany() {
	const context = useContext(ActiveCompanyContext)
	if (context === undefined) {
		throw new Error(
			'useActiveCompany must be used within an ActiveCompanyProvider',
		)
	}
	return context
}
