import { Checkbox } from '@/components/ui/checkbox'
import { useId } from 'react'

const CUSTOMER_TAG_OPTIONS = [
	{ value: 'prospect', label: 'Prospect' },
	{ value: 'déposant', label: 'Déposant' },
] as const

interface CustomerTagsPickerProps {
	value?: string[]
	onChange: (value: string[]) => void
}

/** Sélecteur multi-valeurs aligné sur le select PocketBase `customers.tags`. */
export function CustomerTagsPicker({
	value = [],
	onChange,
}: CustomerTagsPickerProps) {
	const id = useId()

	return (
		<div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
			{CUSTOMER_TAG_OPTIONS.map((option) => {
				const checked = value.includes(option.value)
				const optionId = `${id}-${option.value}`

				return (
					<label
						key={option.value}
						htmlFor={optionId}
						className='flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm'
					>
						<Checkbox
							id={optionId}
							checked={checked}
							onCheckedChange={(nextChecked) =>
								onChange(
									nextChecked
										? [...value, option.value]
										: value.filter((tag) => tag !== option.value),
								)
							}
						/>
						<span>{option.label}</span>
					</label>
				)
			})}
		</div>
	)
}
