// frontend/modules/connect/useConnectModule.ts
//
// Hook CONTAINER — toute la logique métier de ConnectPage.
// Aucun JSX, aucun import de composant UI.

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useCustomers } from '@/lib/queries/customers'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { Customer } from './components/CustomerDialog'

export function useConnectModule() {
  const { activeCompanyId } = useActiveCompany()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')

  const {
    data: customersData,
    isLoading,
    refetch,
  } = useCustomers({
    companyId: activeCompanyId ?? undefined,
    filter: searchTerm
      ? `name ~ "${searchTerm}" || email ~ "${searchTerm}" || phone ~ "${searchTerm}"`
      : '',
  })

  useEffect(() => {
    if (activeCompanyId) refetch()
  }, [activeCompanyId, refetch])

  const customers: Customer[] = useMemo(
    () =>
      customersData?.items.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        address: c.address,
        notes: c.notes,
        tags: Array.isArray(c.tags)
          ? (c.tags as string[])
          : c.tags
            ? [String(c.tags)]
            : [],
      })) ?? [],
    [customersData],
  )

  const handleNewCustomer = () => navigate({ to: '/connect/customers/new' })

  const handleEditCustomer = (customer: Customer) => {
    navigate({
      to: '/connect/customers/$customerId/edit',
      params: () => ({ customerId: customer.id }),
    })
  }

  return {
    // Données
    customers,
    isLoading,
    hasNoCustomers: !isLoading && customers.length === 0,

    // Recherche
    searchTerm,
    setSearchTerm,

    // Handlers
    handleNewCustomer,
    handleEditCustomer,
  }
}

export type ConnectModuleData = ReturnType<typeof useConnectModule>
