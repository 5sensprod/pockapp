// frontend/routes/cash/tickets/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cash/tickets/')({
  component: TicketsPage,
})

function TicketsPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Tickets récents</h1>
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Les tickets s’afficheront ici (à connecter à PocketBase).
        </p>
      </div>
    </div>
  )
}
