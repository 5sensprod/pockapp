import { useState } from 'react'
import { Users, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCustomers } from '@/lib/queries/customers'
import { CustomerTable } from './components/CustomerTable'
import { CustomerDialog } from './components/CustomerDialog'

export function ConnectPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: customersData, isLoading } = useCustomers({
    filter: searchTerm
      ? `name ~ "${searchTerm}" || email ~ "${searchTerm}" || phone ~ "${searchTerm}"`
      : '',
  })

  const customers = customersData?.items ?? []

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">PocketConnect</h1>
            <p className="text-muted-foreground">Gestion clients & relation</p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau client
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table / états */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">
            {searchTerm ? 'Aucun client trouvé' : 'Aucun client pour le moment'}
          </p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Créer votre premier client
          </Button>
        </div>
      ) : (
        <CustomerTable data={customers} />
      )}

      <CustomerDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  )
}
