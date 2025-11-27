import type { CompaniesResponse } from '@/lib/pocketbase-types'
// frontend/lib/ActiveCompanyProvider.tsx
import { useCompanies } from '@/lib/queries/companies'
import { useAuth } from '@/modules/auth/AuthProvider'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type CompanyForContext = {
	id: string
	name: string
	active?: boolean
}

interface ActiveCompanyContextType {
	activeCompanyId: string | null
	isLoading: boolean
	companies: CompanyForContext[]
}

const ActiveCompanyContext = createContext<
	ActiveCompanyContextType | undefined
>(undefined)

export function ActiveCompanyProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const { isAuthenticated } = useAuth()

	const { data: companiesData, isLoading } = useCompanies({
		enabled: isAuthenticated, // 👈 NE FETCH QUE UNE FOIS AUTH OK
	})

	const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)

	const companies: CompanyForContext[] = useMemo(
		() =>
			companiesData?.items?.map((c: CompaniesResponse) => ({
				id: c.id,
				name: c.trade_name || c.name,
				active: c.active,
			})) ?? [],
		[companiesData?.items],
	)

	useEffect(() => {
		if (!companies.length) return

		const activeCompany = companies.find((c) => c.active)
		if (activeCompany) {
			setActiveCompanyId(activeCompany.id)
		} else {
			setActiveCompanyId(companies[0].id)
		}
	}, [companies])

	return (
		<ActiveCompanyContext.Provider
			value={{ activeCompanyId, isLoading, companies }}
		>
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
