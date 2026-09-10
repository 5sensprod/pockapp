import { describe, expect, it } from 'vitest'

import { clampExplorerWidth } from './useResizableExplorer'

describe('clampExplorerWidth', () => {
	it('borne la largeur entre le minimum et le maximum', () => {
		expect(clampExplorerWidth(180, 220, 480)).toBe(220)
		expect(clampExplorerWidth(320, 220, 480)).toBe(320)
		expect(clampExplorerWidth(520, 220, 480)).toBe(480)
	})

	it('arrondit la largeur bornée au pixel entier', () => {
		expect(clampExplorerWidth(271.6, 220, 480)).toBe(272)
	})
})
