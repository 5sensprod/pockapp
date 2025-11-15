import { CreateNoteDialog } from '@/components/create-note-dialog'
import { EditorView } from '@/components/editor-view'
import { NotesList } from '@/components/notes-list'
import { Button } from '@/components/ui/button'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createRef, useState } from 'react'

export const Route = createFileRoute('/notes/$noteId')({
	component() {
		const [isDialogOpen, setIsDialogOpen] = useState(false)
		const inputTitleRef = createRef<HTMLInputElement>()
		const { noteId } = Route.useParams()
		const pb = usePocketBase()
		const note = useQuery({
			queryKey: ['notes', noteId],
			queryFn() {
				return pb.collection('notes').getOne(noteId)
			},
		})
		const updateNote = useMutation({
			mutationFn(params: { content: string }) {
				return pb.collection('notes').update(noteId, params)
			},
		})

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
					<EditorView
						onChange={(content) => {
							if (content) {
								updateNote.mutate({ content })
							}
						}}
						value={note.data?.content ?? ''}
					/>
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
