import { usePocketBase } from '@/lib/use-pocketbase'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NotesList() {
	const pb = usePocketBase()
	const notes = useQuery({
		queryKey: ['notes'],
		queryFn() {
			return pb.collection('notes').getFullList()
		},
	})

	return (
		<div className='flex flex-col gap-2'>
			{notes.data?.map((note) => {
				return (
					<Button
						key={note.id}
						variant='secondary'
						asChild
					>
						<Link
							to={`/notes/$noteId`}
							params={{
								noteId: note.id,
							}}
						>
							{note.title}
						</Link>
					</Button>
				)
			})}
		</div>
	)
}
