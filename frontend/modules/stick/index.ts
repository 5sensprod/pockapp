// frontend/modules/stick/index.ts
import { Image } from "lucide-react";
import type { ModuleManifest } from '../_registry'
import { StickPage } from './StickPage'

export const manifest: ModuleManifest = {
  id: "stick",
  name: "PocketStick",
  description: "Description de PocketStick",
  pole: 'digital',
  icon: Image,
  route: "/stick",
  color: 'text-blue-600',
  iconColor: 'text-blue-600',
  enabled: true,
  minVersion: '1.0.0',
  paid: true,
  plan: 'pro',
}

export { StickPage }
