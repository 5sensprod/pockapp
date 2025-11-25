import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

import { useCreateProduct, useUpdateProduct } from '@/lib/queries/products'
import { useCategories } from '@/lib/queries/categories'
import type { ProductsResponse } from '@/lib/pocketbase-types'
import { toast } from 'sonner'

const productSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  barcode: z.string().max(50).optional(),
  price: z.coerce.number().min(0, 'Le prix doit être positif'),
  stock: z.coerce.number().int().optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
})

type ProductFormValues = z.infer<typeof productSchema>

interface ProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: ProductsResponse | null
  defaultCategoryId?: string
}

export function ProductDialog({
  open,
  onOpenChange,
  product = null,
  defaultCategoryId,
}: ProductDialogProps) {
  const isEdit = !!product
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const { data: categories } = useCategories()

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      barcode: '',
      price: 0,
      stock: 0,
      category: '',
      active: true,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: product?.name ?? '',
        barcode: product?.barcode ?? '',
        price: product?.price ?? 0,
        stock: product?.stock ?? 0,
        category: product?.category || defaultCategoryId || '',
        active: product?.active ?? true,
      })
    }
  }, [open, product, defaultCategoryId, form])

  const onSubmit = async (data: ProductFormValues) => {
    try {
      const payload = {
        name: data.name,
        price: data.price,
        barcode: data.barcode || undefined,
        stock: data.stock,
        category: data.category || undefined,
        active: data.active,
      }

      if (isEdit && product) {
        await updateProduct.mutateAsync({ id: product.id, data: payload })
        toast.success('Produit modifié avec succès')
      } else {
        await createProduct.mutateAsync(payload)
        toast.success('Produit créé avec succès')
      }
      onOpenChange(false)
    } catch (error) {
      toast.error('Une erreur est survenue')
      console.error(error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifiez les informations du produit'
              : 'Ajoutez un nouveau produit au catalogue'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom *</FormLabel>
                  <FormControl>
                    <Input placeholder="Coca-Cola 33cl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prix (€) *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="1.50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" placeholder="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code-barres</FormLabel>
                  <FormControl>
                    <Input placeholder="3760001234567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catégorie</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === '_none_' ? '' : value)}
                    value={field.value || '_none_'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une catégorie" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none_">Aucune</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Actif</FormLabel>
                    <p className="text-sm text-muted-foreground">Produit visible en caisse</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                {isEdit ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}