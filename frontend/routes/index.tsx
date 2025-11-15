// frontend/routes/index.tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { poles } from '@/modules/_registry'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Tableau de bord</h1>
        <p className="text-muted-foreground">
          Sélectionnez un module pour commencer
        </p>
      </div>

      <div className="space-y-10">
        {poles.map((pole) => (
          <section key={pole.id}>
            {/* En-tête de pôle */}
            <div className="flex items-center justify-between mb-4">
              <div
                className={`px-3 py-1 rounded-full text-sm font-semibold ${pole.color}`}
              >
                {pole.name}
              </div>
            </div>

            {/* Cartes de modules */}
            <div className="grid md:grid-cols-3 gap-4">
              {pole.modules.map((module) => (
                <ModuleCard key={module.id} module={module} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function ModuleCard({ module }: { module: any }) {
  const Icon = module.icon

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              {Icon && <Icon className={`h-5 w-5 ${module.iconColor}`} />}
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${module.color}`}>
                {module.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                {module.pole.toUpperCase()}
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {module.description}
        </p>
      </div>

      <div className="mt-4">
        <Link
          to={module.route}
          className={`inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium border-current ${module.color}`}
        >
          Ouvrir
        </Link>
      </div>
    </div>
  )
}
