// frontend/lib/use-permissions.ts
import { useMemo, useEffect, useState } from 'react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { usePocketBaseAuth } from './use-pocketbase' // 🆕 Instance distante
import type { UserRole } from './pocketbase-types'
import type { ModuleManifest } from '@/modules/_registry'

// 🎯 Configuration locale (fallback si pas de connexion serveur)
const MODULE_PERMISSIONS_FALLBACK: Record<string, UserRole[]> = {
  cash: ['admin', 'caissier'],
}

// 🆕 Interface pour la réponse du serveur
interface ModuleAccessResponse {
  hasAccess: boolean
  userRole: string
  requiredRoles?: string[]
  moduleId: string
  requiresPermission: boolean
}

interface AccessibleModulesResponse {
  userRole: string
  accessibleModules: Array<{
    moduleId: string
    requiredRoles: string[]
  }>
  restrictedModules: Array<{
    moduleId: string
    requiredRoles: string[]
  }>
}

export function usePermissions() {
  const { user, isAuthenticated } = useAuth()
  const pbAuth = usePocketBaseAuth() // 🆕 Instance distante
  
  // 🆕 Cache des permissions récupérées du serveur
  const [serverPermissions, setServerPermissions] = useState<AccessibleModulesResponse | null>(null)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(true)

  // 🆕 Récupérer les permissions depuis le serveur distant au montage
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setIsLoadingPermissions(false)
      return
    }

    const fetchServerPermissions = async () => {
      try {
        setIsLoadingPermissions(true)
        
        // 🌐 Appel à l'endpoint custom PocketBase DISTANT
        const response = await fetch(`${pbAuth.baseUrl}/api/accessible-modules`, {
          method: 'GET',
          headers: {
            'Authorization': pbAuth.authStore.token ? `Bearer ${pbAuth.authStore.token}` : '',
          },
        })

        if (response.ok) {
          const data: AccessibleModulesResponse = await response.json()
          setServerPermissions(data)
          console.log('✅ Permissions chargées depuis Render:', data)
        } else {
          console.warn('⚠️ Impossible de charger les permissions depuis Render, utilisation du fallback local')
          setServerPermissions(null)
        }
      } catch (error) {
        console.error('❌ Erreur lors du chargement des permissions depuis Render:', error)
        setServerPermissions(null)
      } finally {
        setIsLoadingPermissions(false)
      }
    }

    fetchServerPermissions()
  }, [isAuthenticated, user, pbAuth])

  // 🆕 Vérifier si l'utilisateur a accès à un module (avec vérification serveur distant)
  const hasAccessToModule = useMemo(() => {
    return (moduleId: string): boolean => {
      if (!user) return false

      // 1️⃣ Si on a les permissions du serveur distant, les utiliser (source de vérité)
      if (serverPermissions) {
        const isAccessible = serverPermissions.accessibleModules.some(
          (m) => m.moduleId === moduleId
        )
        
        if (isAccessible) {
          console.log(`✅ Accès autorisé au module "${moduleId}" (vérifié sur Render)`)
          return true
        }
        
        const isRestricted = serverPermissions.restrictedModules.some(
          (m) => m.moduleId === moduleId
        )
        
        if (isRestricted) {
          console.log(`❌ Accès refusé au module "${moduleId}" (vérifié sur Render)`)
          return false
        }
        
        // Module non dans la liste = accessible par défaut
        console.log(`ℹ️ Module "${moduleId}" accessible par défaut`)
        return true
      }

      // 2️⃣ Fallback local (si serveur distant indisponible)
      const requiredRoles = MODULE_PERMISSIONS_FALLBACK[moduleId]
      
      if (!requiredRoles || requiredRoles.length === 0) {
        return true
      }

      const userRole = user.role || 'user'
      const hasAccess = requiredRoles.includes(userRole)
      
      console.log(`⚠️ Vérification locale (fallback) pour "${moduleId}":`, hasAccess)
      return hasAccess
    }
  }, [user, serverPermissions])

  // 🆕 Vérifier l'accès en temps réel auprès du serveur distant
  const checkModuleAccessOnServer = async (moduleId: string): Promise<boolean> => {
    if (!isAuthenticated) return false

    try {
      const response = await fetch(
        `${pbAuth.baseUrl}/api/check-module-access/${moduleId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': pbAuth.authStore.token ? `Bearer ${pbAuth.authStore.token}` : '',
          },
        }
      )

      if (response.ok) {
        const data: ModuleAccessResponse = await response.json()
        console.log(`🔍 Vérification Render pour "${moduleId}":`, data)
        return data.hasAccess
      } else {
        console.warn(`⚠️ Impossible de vérifier l'accès au module "${moduleId}" sur Render`)
        return hasAccessToModule(moduleId) // Fallback local
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la vérification du module "${moduleId}" sur Render:`, error)
      return hasAccessToModule(moduleId) // Fallback local
    }
  }

  // Filtrer les modules selon les permissions de l'utilisateur
  const filterModulesByPermissions = useMemo(() => {
    return (modules: ModuleManifest[]): ModuleManifest[] => {
      return modules.filter((module) => hasAccessToModule(module.id))
    }
  }, [hasAccessToModule])

  // Vérifier si l'utilisateur a un rôle spécifique
  const hasRole = useMemo(() => {
    return (role: UserRole): boolean => {
      if (!user) return false
      return user.role === role
    }
  }, [user])

  // Vérifier si l'utilisateur a au moins un des rôles
  const hasAnyRole = useMemo(() => {
    return (roles: UserRole[]): boolean => {
      if (!user) return false
      const userRole = user.role || 'user'
      return roles.includes(userRole)
    }
  }, [user])

  return {
    hasAccessToModule,
    checkModuleAccessOnServer, // 🆕 Vérification explicite serveur distant
    filterModulesByPermissions,
    hasRole,
    hasAnyRole,
    userRole: user?.role || 'user',
    isAdmin: user?.role === 'admin',
    isCaissier: user?.role === 'caissier',
    isLoadingPermissions, // 🆕 État de chargement
    serverPermissions, // 🆕 Permissions du serveur distant
  }
}