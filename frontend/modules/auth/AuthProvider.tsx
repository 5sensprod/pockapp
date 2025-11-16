// frontend/modules/auth/AuthProvider.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePocketBase } from '@/lib/use-pocketbase'
import type { UsersResponse } from '@/lib/pocketbase-types'

type AuthUser = UsersResponse | null

export type AuthContextType = {
  user: AuthUser
  isAuthenticated: boolean
  loading: boolean
  login: (identity: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const pb = usePocketBase()
  const [user, setUser] = useState<AuthUser>(
    (pb.authStore.model as AuthUser) ?? null,
  )
  const [loading, setLoading] = useState(false)

  // 🔄 Sync avec l'authStore PocketBase
  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, model) => {
      setUser((model as AuthUser) ?? null)
    })
    return unsubscribe
  }, [pb])

  const login = useCallback(
    async (identity: string, password: string) => {
      setLoading(true)
      try {
        const res = await pb
          .collection('users')
          .authWithPassword(identity, password)
        setUser(res.record as AuthUser)
      } finally {
        setLoading(false)
      }
    },
    [pb],
  )

  const logout = useCallback(() => {
    pb.authStore.clear()
    setUser(null)
  }, [pb])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      login,
      logout,
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
