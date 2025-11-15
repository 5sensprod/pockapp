import { CreateNoteDialog } from '@/components/create-note-dialog'
import { NotesList } from '@/components/notes-list'
import { Button } from '@/components/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { createRef, useState } from 'react'

export const Route = createFileRoute('/')({
	component() {
		const [isDialogOpen, setIsDialogOpen] = useState(false)
		const inputTitleRef = createRef<HTMLInputElement>()

		return (
			<div className='w-full grid grid-cols-5'>
				<div className='col-span-1 flex flex-col gap-2 p-2'>
					<Button
						type='button'
						onClick={() => {
							setIsDialogOpen(true)
							setTimeout(() => inputTitleRef.current?.focus(), 0)
						}}
					>
						Create
					</Button>
					<NotesList />
				</div>
				<div className='col-span-4'>
					<p>Select a note or create a new one</p>
				</div>
				<CreateNoteDialog
					open={isDialogOpen}
					onOpenChange={setIsDialogOpen}
					inputTitleRef={inputTitleRef}
				/>
			</div>
		)
	},
})