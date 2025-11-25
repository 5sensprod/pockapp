import { useState } from 'react'
import { Pencil, Trash2, Plus, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

import { useBrands, useDeleteBrand } from '@/lib/queries/brands'
import type { BrandsResponse } from '@/lib/pocketbase-types'
import { toast } from 'sonner'
import { BrandDialog } from './BrandDialog'

export function BrandList() {
  const { data: brands, isLoading } = useBrands()
  const deleteBrand = useDeleteBrand()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBrand, setEditBrand] = useState<BrandsResponse | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [brandToDelete, setBrandToDelete] = useState<BrandsResponse | null>(null)

  const handleAdd = () => {
    setEditBrand(null)
    setDialogOpen(true)
  }

  const handleEdit = (brand: BrandsResponse) => {
    setEditBrand(brand)
    setDialogOpen(true)
  }

  const askDelete = (brand: BrandsResponse) => {
    setBrandToDelete(brand)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!brandToDelete) return
    try {
      await deleteBrand.mutateAsync(brandToDelete.id)
      toast.success(`Marque "${brandToDelete.name}" supprimée`)
    } catch (error) {
      toast.error('Erreur lors de la suppression')
    } finally {
      setConfirmOpen(false)
      setBrandToDelete(null)
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Chargement...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Marques ({brands?.length ?? 0})</h2>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle marque
        </Button>
      </div>

      {!brands?.length ? (
        <div className="text-center py-12 text-muted-foreground">Aucune marque</div>
      ) : (
        <div className="rounded-md border">
          <UiTable>
            <UiTableHeader>
              <UiTableRow>
                <UiTableHead>Nom</UiTableHead>
                <UiTableHead>Site web</UiTableHead>
                <UiTableHead>Description</UiTableHead>
                <UiTableHead className="w-[100px]">Actions</UiTableHead>
              </UiTableRow>
            </UiTableHeader>
            <UiTableBody>
              {brands.map((brand) => (
                <UiTableRow key={brand.id}>
                  <UiTableCell className="font-medium">{brand.name}</UiTableCell>
                  <UiTableCell>
                    {brand.website ? (
                      <a
                        href={brand.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <Globe className="h-3 w-3" />
                        Visiter
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </UiTableCell>
                  <UiTableCell className="max-w-[300px] truncate">
                    {brand.description || <span className="text-muted-foreground">-</span>}
                  </UiTableCell>
                  <UiTableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(brand)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={() => askDelete(brand)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </UiTableCell>
                </UiTableRow>
              ))}
            </UiTableBody>
          </UiTable>
        </div>
      )}

      <BrandDialog open={dialogOpen} onOpenChange={setDialogOpen} brand={editBrand} />

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) setBrandToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette marque ?</DialogTitle>
            <DialogDescription>
              {brandToDelete ? `"${brandToDelete.name}" sera supprimée.` : ''}
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
