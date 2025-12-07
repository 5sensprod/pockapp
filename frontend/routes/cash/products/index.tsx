// frontend/routes/cash/products/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/products/')({
  component: ProductsPage,
})

function ProductsPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Catalogue produits</h1>
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Interface catalogue à venir (connectée à PocketBase).
        </p>
      </div>
    </div>
  )
}
