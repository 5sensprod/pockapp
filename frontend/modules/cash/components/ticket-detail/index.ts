// frontend/modules/cash/components/ticket-detail/index.ts
//
// Point d'entrée public du sous-module ticket-detail.
// Seuls les éléments listés ici font partie de l'API publique.

export { TicketDetailContent } from './TicketDetailContent'
export type { TicketDetailContentProps } from './TicketDetailContent'
export { useTicketDetail } from './useTicketDetail'
export type {
	TicketDetailData,
	VatBreakdown,
	DiscountSummary,
} from './useTicketDetail'
export { useTicketActions } from './useTicketActions'
export type { TicketActionsState, DepositMode } from './useTicketActions'
