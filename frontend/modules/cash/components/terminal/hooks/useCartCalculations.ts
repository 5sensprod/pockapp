// frontend/modules/cash/components/terminal/hooks/useCartCalculations.ts
import * as React from 'react'
import type { CartItem } from '../types/cart'
import { calculateCartTotals } from '../utils/calculations'

interface UseCartCalculationsProps {
	cart: CartItem[]
	cartDiscountMode: 'percent' | 'amount'
	cartDiscountValue: number
}

export function useCartCalculations({
	cart,
	cartDiscountMode,
	cartDiscountValue,
}: UseCartCalculationsProps) {
	return React.useMemo(() => {
		return calculateCartTotals(cart, cartDiscountMode, cartDiscountValue)
	}, [cart, cartDiscountMode, cartDiscountValue])
}
