import type { UsersResponse } from '@/lib/pocketbase-types'
import { usePocketBase } from '@/lib/use-pocketbase'
// frontend/modules/auth/AuthProvider.tsx
import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react'
import { toast } from 'sonner'

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
	// true pendant le refresh initial — évite de flasher l'écran de login
	const [loading, setLoading] = useState(() => pb.authStore.isValid)

	// 🔄 Sync avec l'authStore PocketBase
	useEffect(() => {
		const unsubscribe = pb.authStore.onChange((_token, model) => {
			setUser((model as AuthUser) ?? null)
		})
		return unsubscribe
	}, [pb])

	// ✅ Rafraîchir le token silencieusement au montage
	// Cela valide que la session stockée est encore acceptée par le serveur,
	// et met à jour le token avant que les hooks de données ne s'exécutent.
	useEffect(() => {
		if (!pb.authStore.isValid) return

		pb.collection('users')
			.authRefresh()
			.then((res) => {
				setUser(res.record as AuthUser)
			})
			.catch(() => {
				// Token expiré ou révoqué côté serveur → déconnexion propre
				pb.authStore.clear()
				setUser(null)
			})
			.finally(() => {
				setLoading(false)
			})
	}, [pb])

	const login = useCallback(
		async (identity: string, password: string) => {
			try {
				setLoading(true)
				const res = await pb
					.collection('users')
					.authWithPassword(identity, password)
				setUser(res.record as AuthUser)
				toast.success('Connexion réussie')
			} catch (err: any) {
				toast.error(err?.message ?? 'Erreur de connexion')
				throw err
			} finally {
				setLoading(false)
			}
		},
		[pb],
	)

	const logout = useCallback(async () => {
		pb.authStore.clear()
		setUser(null)
		toast.info('Vous avez été déconnecté')
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
