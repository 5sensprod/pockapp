import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCustomers } from '@/lib/queries/customers'
import { CustomerTable } from './components/CustomerTable'
import { CustomerDialog } from './components/CustomerDialog'

import { manifest } from './index' // ⭐ utilisation du manifest

export function ConnectPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: customersData, isLoading } = useCustomers({
    filter: searchTerm
      ? `name ~ "${searchTerm}" || email ~ "${searchTerm}" || phone ~ "${searchTerm}"`
      : '',
  })

  const customers = customersData?.items ?? []
  const Icon = manifest.icon

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className={`h-6 w-6 ${manifest.iconColor ?? 'text-primary'}`} />
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-bold">{manifest.name}</h1>
            <p className="text-muted-foreground">{manifest.description}</p>
          </div>

          <Button onClick={() => setIsDialogOpen(true)}>
            Nouveau client
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder="Rechercher un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Aucun client pour le moment
        </div>
      ) : (
        <CustomerTable data={customers} />
      )}

      {/* Dialog */}
      <CustomerDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  )
}
