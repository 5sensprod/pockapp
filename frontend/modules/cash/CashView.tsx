// frontend/modules/cash/CashView.tsx
//
// Responsabilité unique : afficher la grille bento de configuration caisse.
//
// Ce composant est pur affichage — zéro dialog, zéro logique de session.
// Les dialogs (OpenSession, CloseSession, RapportX, Movement) vivent
// exclusivement dans CashModuleShell qui en est le propriétaire unique.
//
// Grille bento asymétrique — style Stitch "Editorial Precision" :
//   PrinterSettingsCard : col-span-7 featured
//   DisplaySettingsCard : col-span-5
//   ScannerSettingsCard : col-span-4
//   PaymentMethodsCard  : col-span-8

import { ScannerSettingsCard } from './ScannerSettingsCard'
import {
	DisplaySettingsCard,
	NoRegisterState,
	PaymentMethodsCard,
	PrinterSettingsCard,
} from './components'

interface CashViewProps {
	hasNoRegisters: boolean
	// Signature exacte de useCashModule — name et code sont collectés
	// par le formulaire interne de NoRegisterState, pas par CashView
	handleCreateRegister: (name: string, code?: string) => Promise<unknown>
	isCreatingRegister: boolean
}

export function CashView({
	hasNoRegisters,
	handleCreateRegister,
	isCreatingRegister,
}: CashViewProps) {
	if (hasNoRegisters) {
		return (
			<NoRegisterState
				onCreateRegister={handleCreateRegister}
				isCreating={isCreatingRegister}
			/>
		)
	}

	return (
		// Bento grid asymétrique 12 colonnes — style Stitch
		// bg-background : cards bg-card ressortent par lift tonal (#F9F9FF → #FFF)
		<div className='grid grid-cols-1 md:grid-cols-12 gap-6'>
			{/* Imprimante — featured, col 7 */}
			<div className='md:col-span-7'>
				<PrinterSettingsCard />
			</div>

			{/* Afficheur client — col 5 */}
			<div className='md:col-span-5'>
				<DisplaySettingsCard />
			</div>

			{/* Scanette — col 4 */}
			<div className='md:col-span-4'>
				<ScannerSettingsCard />
			</div>

			{/* Moyens de paiement — col 8 */}
			<div className='md:col-span-8'>
				<PaymentMethodsCard />
			</div>
		</div>
	)
}
