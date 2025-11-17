// frontend/modules/stats/index.ts
import { BarChart3 } from "lucide-react";
import type { ModuleManifest } from '../_registry'
import { StatsPage } from './StatsPage'

export const manifest: ModuleManifest = {
  id: "stats",
  name: "PocketStats",
  description: "Description de PocketStats",
  pole: 'pilotage',
  icon: BarChart3,
  route: "/stats",
  color: 'text-blue-600',
  iconColor: 'text-blue-600',
  enabled: true,
  minVersion: '1.0.0',
  paid: true,
  plan: 'pro',
}

export { StatsPage }
