import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProducts } from '@/lib/queries/products'
import { ProductTable } from './components/ProductTable'
import { ProductDialog } from './components/ProductDialog'
import { CategoryTree } from './components/CategoryTree'
import { manifest } from './index'
import type { CategoriesResponse } from '@/lib/pocketbase-types'

export function StockPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<CategoriesResponse | null>(null)

  // Filtrer par catégorie et recherche
  const buildFilter = () => {
    const filters: string[] = []

    if (selectedCategory) {
      filters.push(`category = "${selectedCategory.id}"`)
    }

    if (searchTerm) {
      filters.push(`(name ~ "${searchTerm}" || barcode ~ "${searchTerm}")`)
    }

    return filters.join(' && ')
  }

  const { data: productsData, isLoading } = useProducts({
    filter: buildFilter(),
  })

  const products = productsData?.items ?? []
  const Icon = manifest.icon

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar Catégories */}
      <div className="w-64 border-r bg-muted/30 flex-shrink-0">
        <CategoryTree
          selectedId={selectedCategory?.id ?? null}
          onSelect={setSelectedCategory}
        />
      </div>

      {/* Contenu principal */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className={`h-6 w-6 ${manifest.iconColor ?? 'text-primary'}`} />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold">
                  {selectedCategory ? selectedCategory.name : manifest.name}
                </h1>
                <p className="text-muted-foreground">
                  {selectedCategory
                    ? `Produits dans "${selectedCategory.name}"`
                    : manifest.description}
                </p>
              </div>
              <Button onClick={() => setIsDialogOpen(true)}>Nouveau produit</Button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-6 flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Input
                placeholder="Rechercher un produit..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Chargement...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {selectedCategory
                ? `Aucun produit dans "${selectedCategory.name}"`
                : 'Aucun produit pour le moment'}
            </div>
          ) : (
            <ProductTable data={products} />
          )}

          <ProductDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            defaultCategoryId={selectedCategory?.id}
          />
        </div>
      </div>
    </div>
  )
}