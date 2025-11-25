import { useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
  type ColumnDef,
} from '@tanstack/react-table'
import { MoreHorizontal, ArrowUpDown, Pencil, Trash2, Barcode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { useDeleteProduct } from '@/lib/queries/products'
import type { ProductsResponse } from '@/lib/pocketbase-types'
import { toast } from 'sonner'
import { ProductDialog } from './ProductDialog'

interface ProductTableProps {
  data: ProductsResponse[]
}

export function ProductTable({ data }: ProductTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })

  const deleteProduct = useDeleteProduct()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<ProductsResponse | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [productToEdit, setProductToEdit] = useState<ProductsResponse | null>(null)

  const askDelete = (product: ProductsResponse) => {
    setProductToDelete(product)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!productToDelete) return
    try {
      await deleteProduct.mutateAsync(productToDelete.id)
      toast.success(`Produit "${productToDelete.name}" supprimé`)
    } catch (error) {
      toast.error('Erreur lors de la suppression')
      console.error(error)
    } finally {
      setConfirmOpen(false)
      setProductToDelete(null)
    }
  }

  const openEdit = (product: ProductsResponse) => {
    setProductToEdit(product)
    setEditOpen(true)
  }

  const columns: ColumnDef<ProductsResponse>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Nom
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const name = row.getValue<string>('name')
        const category = row.original.category
        return (
          <div>
            <div className="font-medium">{name}</div>
            {category && <div className="text-sm text-muted-foreground">{category}</div>}
          </div>
        )
      },
    },
    {
      accessorKey: 'barcode',
      header: 'Code-barres',
      cell: ({ row }) => {
        const barcode = row.getValue<string>('barcode')
        return barcode ? (
          <span className="flex items-center gap-1 font-mono text-sm">
            <Barcode className="h-3 w-3" />
            {barcode}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      },
    },
    {
      accessorKey: 'price',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Prix
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const price = row.getValue<number>('price')
        return <span className="font-medium">{price.toFixed(2)} €</span>
      },
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      cell: ({ row }) => {
        const stock = row.getValue<number>('stock')
        if (stock === undefined || stock === null) {
          return <span className="text-muted-foreground">-</span>
        }
        return (
          <Badge variant={stock > 10 ? 'default' : stock > 0 ? 'secondary' : 'destructive'}>
            {stock}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'active',
      header: 'Statut',
      cell: ({ row }) => {
        const active = row.getValue<boolean>('active')
        return (
          <Badge variant={active !== false ? 'default' : 'secondary'}>
            {active !== false ? 'Actif' : 'Inactif'}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const product = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(product.barcode || '')}>
                Copier le code-barres
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openEdit(product)}>
                <Pencil className="h-4 w-4 mr-2" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={() => askDelete(product)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    state: { sorting, columnFilters, pagination },
  })

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Aucun produit.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} produit(s)
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Précédent
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Suivant
          </Button>
        </div>
      </div>

      <ProductDialog open={editOpen} onOpenChange={setEditOpen} product={productToEdit} />

      <Dialog open={confirmOpen} onOpenChange={(open) => { setConfirmOpen(open); if (!open) setProductToDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce produit ?</DialogTitle>
            <DialogDescription>
              {productToDelete
                ? `Vous êtes sur le point de supprimer "${productToDelete.name}". Cette action est définitive.`
                : 'Vous êtes sur le point de supprimer ce produit.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setProductToDelete(null) }}>
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