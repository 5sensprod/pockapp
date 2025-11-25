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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useCreateCategory, useUpdateCategory, useCategories } from '@/lib/queries/categories'
import type { CategoriesResponse } from '@/lib/pocketbase-types'
import { toast } from 'sonner'

const categorySchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(100),
  parent: z.string().optional(),
  order: z.coerce.number().int().min(0).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: CategoriesResponse | null
  defaultParentId?: string
}

export function CategoryDialog({
  open,
  onOpenChange,
  category = null,
  defaultParentId,
}: CategoryDialogProps) {
  const isEdit = !!category
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const { data: allCategories } = useCategories()

  const availableParents = allCategories?.filter((c) => c.id !== category?.id) ?? []

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      parent: undefined,
      order: 0,
      icon: '',
      color: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: category?.name ?? '',
        parent: category?.parent || defaultParentId || undefined,
        order: category?.order ?? 0,
        icon: category?.icon ?? '',
        color: category?.color ?? '',
      })
    }
  }, [open, category, defaultParentId, form])

  const onSubmit = async (data: CategoryFormValues) => {
    try {
      const payload = {
        name: data.name,
        parent: data.parent || undefined,
        order: data.order,
        icon: data.icon || undefined,
        color: data.color || undefined,
      }

      if (isEdit && category) {
        await updateCategory.mutateAsync({ id: category.id, data: payload })
        toast.success('Catégorie modifiée')
      } else {
        await createCategory.mutateAsync(payload)
        toast.success('Catégorie créée')
      }
      onOpenChange(false)
    } catch (error) {
      toast.error('Une erreur est survenue')
      console.error(error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Modifiez les informations' : 'Ajoutez une nouvelle catégorie'}
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
                    <Input placeholder="Boissons" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catégorie parente</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === '_none_' ? undefined : value)}
                    value={field.value || '_none_'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Aucune (racine)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none_">Aucune (racine)</SelectItem>
                      {availableParents.map((cat) => (
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordre</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Couleur</FormLabel>
                    <FormControl>
                      <Input placeholder="blue" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icône (lucide)</FormLabel>
                  <FormControl>
                    <Input placeholder="coffee" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createCategory.isPending || updateCategory.isPending}>
                {isEdit ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}