// frontend/lib/hooks/useResizableExplorer.ts

import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useRef,
} from 'react'

import { useEtatPersistant } from './useEtatPersistant'

interface ResizableExplorerOptions {
	storageKey: string
	defaultWidth: number
	minWidth: number
	maxWidth: number
	contentMinWidth: number
	handleWidth: number
}

/** Borne et aligne la largeur sur un pixel entier. */
export function clampExplorerWidth(
	width: number,
	minWidth: number,
	maxWidth: number,
) {
	return Math.round(Math.max(minWidth, Math.min(maxWidth, width)))
}

/**
 * Largeur persistée et interactions communes aux explorateurs latéraux.
 *
 * Le maximum disponible est figé au début du geste : déplacer la poignée ne
 * change donc pas sa propre limite pendant le redimensionnement.
 */
export function useResizableExplorer({
	storageKey,
	defaultWidth,
	minWidth,
	maxWidth,
	contentMinWidth,
	handleWidth,
}: ResizableExplorerOptions) {
	const [width, setWidth] = useEtatPersistant(
		storageKey,
		defaultWidth,
		(value) =>
			typeof value === 'number' &&
			Number.isFinite(value) &&
			value >= minWidth &&
			value <= maxWidth,
	)
	const gridRef = useRef<HTMLDivElement | null>(null)
	const resizeStartRef = useRef<{
		pointerId: number
		startX: number
		startWidth: number
		maxWidth: number
	} | null>(null)

	const availableMaxWidth = () => {
		const gridWidth = gridRef.current?.clientWidth
		if (!gridWidth) return maxWidth
		return Math.max(
			minWidth,
			Math.min(maxWidth, gridWidth - handleWidth - contentMinWidth),
		)
	}
	const clampWidth = (nextWidth: number, availableMax = availableMaxWidth()) =>
		clampExplorerWidth(nextWidth, minWidth, availableMax)

	const onPointerDown = (event: ReactPointerEvent<HTMLHRElement>) => {
		if (event.button !== 0) return
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		resizeStartRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startWidth: width,
			maxWidth: availableMaxWidth(),
		}
	}
	const onPointerMove = (event: ReactPointerEvent<HTMLHRElement>) => {
		const start = resizeStartRef.current
		if (!start || start.pointerId !== event.pointerId) return
		setWidth(
			clampWidth(
				start.startWidth + event.clientX - start.startX,
				start.maxWidth,
			),
		)
	}
	const onPointerEnd = (event: ReactPointerEvent<HTMLHRElement>) => {
		if (resizeStartRef.current?.pointerId !== event.pointerId) return
		resizeStartRef.current = null
	}
	const onKeyDown = (event: ReactKeyboardEvent<HTMLHRElement>) => {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
		event.preventDefault()
		setWidth((current) =>
			clampWidth(current + (event.key === 'ArrowLeft' ? -16 : 16)),
		)
	}

	return {
		width,
		gridRef,
		handleProps: {
			value: width,
			min: minWidth,
			max: maxWidth,
			onPointerDown,
			onPointerMove,
			onPointerUp: onPointerEnd,
			onPointerCancel: onPointerEnd,
			onDoubleClick: () => setWidth(defaultWidth),
			onKeyDown,
		},
	}
}
