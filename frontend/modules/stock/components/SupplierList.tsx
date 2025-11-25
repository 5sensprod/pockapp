import { useState } from 'react'
import { Pencil, Trash2, Plus, Mail, Phone, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table as UiTable,
  TableBody as UiTableBody,
  TableCell as UiTableCell,
  TableHead as UiTableHead,
  TableHeader as UiTableHeader,
  TableRow as UiTableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { useSuppliers, useDeleteSupplier } from '@/lib/queries/suppliers'
import { useBrands } from '@/lib/queries/brands'
import type { SuppliersResponse } from '@/lib/pocketbase-types'
import { toast } from 'sonner'
import { SupplierDialog } from './SupplierDialog'

export function SupplierList() {
  const { data: suppliers, isLoading } = useSuppliers()
  const { data: brands } = useBrands()
  const deleteSupplier = useDeleteSupplier()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<SuppliersResponse | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<SuppliersResponse | null>(null)

  // Helper pour récupérer les noms des marques
  const getBrandNames = (brandIds: string[]): string[] => {
    if (!brands || !brandIds?.length) return []
    return brandIds
      .map((id) => brands.find((b) => b.id === id)?.name)
      .filter(Boolean) as string[]
  }

  const handleAdd = () => {
    setEditSupplier(null)
    setDialogOpen(true)
  }

  const handleEdit = (supplier: SuppliersResponse) => {
    setEditSupplier(supplier)
    setDialogOpen(true)
  }

  const askDelete = (supplier: SuppliersResponse) => {
    setSupplierToDelete(supplier)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!supplierToDelete) return
    try {
      await deleteSupplier.mutateAsync(supplierToDelete.id)
      toast.success(`Fournisseur "${supplierToDelete.name}" supprimé`)
    } catch (error) {
      toast.error('Erreur lors de la suppression')
    } finally {
      setConfirmOpen(false)
      setSupplierToDelete(null)
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Chargement...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Fournisseurs ({suppliers?.length ?? 0})</h2>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau fournisseur
        </Button>
      </div>

      {!suppliers?.length ? (
        <div className="text-center py-12 text-muted-foreground">Aucun fournisseur</div>
      ) : (
        <div className="rounded-md border">
          <UiTable>
            <UiTableHeader>
              <UiTableRow>
                <UiTableHead>Fournisseur</UiTableHead>
                <UiTableHead>Contact</UiTableHead>
                <UiTableHead>Email</UiTableHead>
                <UiTableHead>Téléphone</UiTableHead>
                <UiTableHead>Statut</UiTableHead>
                <UiTableHead className="w-[100px]">Actions</UiTableHead>
              </UiTableRow>
            </UiTableHeader>
            <UiTableBody>
              {suppliers.map((supplier) => {
                const brandNames = getBrandNames(supplier.brands || [])
                const brandCount = brandNames.length

                return (
                  <UiTableRow key={supplier.id}>
                    <UiTableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium">{supplier.name}</div>
                        {brandCount > 0 && (
                          <div className="flex items-center gap-1 text-xs text-blue-600">
                            <Building2 className="h-3 w-3" />
                            <span>
                              {brandCount} {brandCount > 1 ? 'marques' : 'marque'} :{' '}
                              {brandNames.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </UiTableCell>
                    <UiTableCell>
                      {supplier.contact || <span className="text-muted-foreground">-</span>}
                    </UiTableCell>
                    <UiTableCell>
                      {supplier.email ? (
                        <a
                          href={`mailto:${supplier.email}`}
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          {supplier.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </UiTableCell>
                    <UiTableCell>
                      {supplier.phone ? (
                        <a
                          href={`tel:${supplier.phone}`}
                          className="flex items-center gap-1 hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {supplier.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </UiTableCell>
                    <UiTableCell>
                      <Badge variant={supplier.active !== false ? 'default' : 'secondary'}>
                        {supplier.active !== false ? 'Actif' : 'Inactif'}
                      </Badge>
                    </UiTableCell>
                    <UiTableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(supplier)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600"
                          onClick={() => askDelete(supplier)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </UiTableCell>
                  </UiTableRow>
                )
              })}
            </UiTableBody>
          </UiTable>
        </div>
      )}

      <SupplierDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={editSupplier} />

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) setSupplierToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce fournisseur ?</DialogTitle>
            <DialogDescription>
              {supplierToDelete ? `"${supplierToDelete.name}" sera supprimé.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
