 // frontend/modules/cash/StockPage.tsx
import { Outlet } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'


import { manifest } from './index'

export function StockPage() {
      const Icon = manifest.icon
  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">{manifest.name}</h1>
        </div>
        <p className="text-muted-foreground">
          {manifest.description}
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-lg">Fonctionnalité 1</CardTitle>
            <CardDescription>Description de la fonctionnalité</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Action
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-lg">Fonctionnalité 2</CardTitle>
            <CardDescription>Description de la fonctionnalité</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Action
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-lg">Fonctionnalité 3</CardTitle>
            <CardDescription>Description de la fonctionnalité</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Action
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Sous-routes Cash éventuelles */}
      <Outlet />
    </div>
  )
}