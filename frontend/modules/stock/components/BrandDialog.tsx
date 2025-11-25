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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

import { useCreateBrand, useUpdateBrand } from '@/lib/queries/brands'
import type { BrandsResponse } from '@/lib/pocketbase-types'
import { toast } from 'sonner'

const brandSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(100),
  website: z.string().url('URL invalide').optional().or(z.literal('')),
  description: z.string().max(500).optional(),
})

type BrandFormValues = z.infer<typeof brandSchema>

interface BrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brand?: BrandsResponse | null
}

export function BrandDialog({ open, onOpenChange, brand = null }: BrandDialogProps) {
  const isEdit = !!brand
  const createBrand = useCreateBrand()
  const updateBrand = useUpdateBrand()

  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: '',
      website: '',
      description: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: brand?.name ?? '',
        website: brand?.website ?? '',
        description: brand?.description ?? '',
      })
    }
  }, [open, brand, form])

  const onSubmit = async (data: BrandFormValues) => {
    try {
      const payload = {
        name: data.name,
        website: data.website || undefined,
        description: data.description || undefined,
      }

      if (isEdit && brand) {
        await updateBrand.mutateAsync({ id: brand.id, data: payload })
        toast.success('Marque modifiée')
      } else {
        await createBrand.mutateAsync(payload)
        toast.success('Marque créée')
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
          <DialogTitle>{isEdit ? 'Modifier la marque' : 'Nouvelle marque'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Modifiez les informations' : 'Ajoutez une nouvelle marque'}
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
                    <Input placeholder="Coca-Cola" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site web</FormLabel>
                  <FormControl>
                    <Input placeholder="https://www.coca-cola.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Description de la marque..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createBrand.isPending || updateBrand.isPending}>
                {isEdit ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}