// frontend/hooks/useClock.ts
//
// Horloge temps réel — se synchronise sur la minute pile.
// Extrait de CashModuleShell, réutilisable par tout module.

import { useEffect, useState } from 'react'

function currentTime() {
	return new Date().toLocaleTimeString('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	})
}

export function useClock(): string {
	const [time, setTime] = useState(currentTime)

	useEffect(() => {
		const tick = () => setTime(currentTime())

		// Attendre la prochaine minute pile avant de démarrer l'intervalle
		const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000
		const timeout = setTimeout(() => {
			tick()
			const interval = setInterval(tick, 60_000)
			// Stockage de l'interval pour nettoyage dans le cleanup
			;(timeoutRef as any).interval = interval
		}, msUntilNextMinute)

		const timeoutRef = timeout
		return () => {
			clearTimeout(timeout)
			if ((timeoutRef as any).interval)
				clearInterval((timeoutRef as any).interval)
		}
	}, [])

	return time
}
