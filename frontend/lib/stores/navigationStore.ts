// frontend/lib/stores/navigationStore.ts

import { Store } from '@tanstack/react-store'
import { useStore } from '@tanstack/react-store'

export interface NavigationEntry {
	path: string
	label: string
	params?: Record<string, string>
	search?: Record<string, string>
}

interface NavigationState {
	stack: NavigationEntry[]
}

export const navigationStore = new Store<NavigationState>({ stack: [] })

// Actions
export const navigationActions = {
	push: (entry: NavigationEntry) =>
		navigationStore.setState((s) => ({ stack: [...s.stack, entry] })),

	pop: (): NavigationEntry | undefined => {
		const stack = navigationStore.state.stack
		if (stack.length === 0) return undefined
		const last = stack[stack.length - 1]
		navigationStore.setState((s) => ({ stack: s.stack.slice(0, -1) }))
		return last
	},

	peek: (): NavigationEntry | undefined => {
		const stack = navigationStore.state.stack
		return stack[stack.length - 1]
	},

	clear: () => navigationStore.setState(() => ({ stack: [] })),
}

// Hook React pour les composants
export function useNavigationStack() {
	return useStore(navigationStore, (s) => s.stack)
}
