// frontend/modules/cash/components/hooks/useRegisterManager.ts
import * as React from 'react'
import { toast } from 'sonner'
import { useCashRegisters, useCreateCashRegister } from '@/lib/queries/cash'

interface UseRegisterManagerProps {
	ownerCompanyId?: string
}

/**
 * Hook pour gérer l'état et les actions des caisses enregistreuses
 */
export function useRegisterManager({
	ownerCompanyId,
}: UseRegisterManagerProps) {
	// Query
	const {
		data: registers,
		isLoading: isRegistersLoading,
		isError: isRegistersError,
	} = useCashRegisters(ownerCompanyId)

	// Mutation
	const createRegister = useCreateCashRegister()

	// État local
	const [selectedRegisterId, setSelectedRegisterId] = React.useState<
		string | undefined
	>(undefined)

	// Sélectionner automatiquement la première caisse
	React.useEffect(() => {
		if (!selectedRegisterId && registers && registers.length > 0) {
			setSelectedRegisterId(registers[0].id)
		}
	}, [registers, selectedRegisterId])

	// Caisse sélectionnée
	const selectedRegister = React.useMemo(
		() => registers?.find((r) => r.id === selectedRegisterId),
		[registers, selectedRegisterId],
	)

	// Label de status
	const registerStatusLabel = React.useMemo(() => {
		if (isRegistersLoading) return 'Chargement des caisses...'
		if (isRegistersError) return 'Erreur chargement caisses'
		if (!registers || registers.length === 0) return 'Aucune caisse configurée'
		return null
	}, [isRegistersLoading, isRegistersError, registers])

	// Action de création de caisse
	const handleCreateRegister = React.useCallback(
		async (name: string, code?: string) => {
			if (!name.trim()) {
				toast.error('Le nom de la caisse est obligatoire.')
				return Promise.reject()
			}

			if (!ownerCompanyId) {
				toast.error("Impossible de déterminer l'entreprise.")
				return Promise.reject()
			}

			try {
				const reg = await createRegister.mutateAsync({
					name: name.trim(),
					code: code?.trim() || undefined,
					ownerCompanyId,
				})

				toast.success('Caisse créée.')
				setSelectedRegisterId(reg.id)
				return reg
			} catch (err: any) {
				toast.error(err?.message ?? 'Erreur lors de la création de la caisse.')
				throw err
			}
		},
		[ownerCompanyId, createRegister],
	)

	return {
		// Caisses
		registers,
		isRegistersLoading,
		isRegistersError,
		registerStatusLabel,

		// Caisse sélectionnée
		selectedRegisterId,
		setSelectedRegisterId,
		selectedRegister,

		// Actions
		handleCreateRegister,
		createRegister,
	}
}
