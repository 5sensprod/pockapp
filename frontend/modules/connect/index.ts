import { Users } from 'lucide-react'
import type { ModuleManifest } from '../_registry'
import { ConnectPage } from './ConnectPage'

export const manifest: ModuleManifest = {
  id: 'connect',
  name: 'PocketConnect',
  description: 'Clients & relation',
  pole: 'commerce',
  icon: Users,
  iconColor: 'text-blue-600',
  route: '/connect',
  color: 'text-blue-600',
  enabled: true,
  minVersion: '1.0.0',
}

export { ConnectPage }
