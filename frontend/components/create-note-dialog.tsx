// create-note-dialog.tsx
import { usePocketBase } from '@/lib/use-pocketbase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type RefObject } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type CreateNoteDialogProps = {
  inputTitleRef: RefObject<HTMLInputElement>
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateNoteDialog(props: CreateNoteDialogProps) {
  const queryClient = useQueryClient()
  const pb = usePocketBase()
  const navigate = useNavigate()

  const createNotes = useMutation({
    mutationFn(params: { title: string; content: string }) {
      return pb.collection('notes').create(params)
    },
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      props.onOpenChange(false)

      navigate({
        to: '/notes/$noteId',
        params: {
          noteId: data.id,
        },
      })
    },
  })

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>Create a new note</DialogTitle>
        </DialogHeader>
        <form
          className='flex gap-2 pt-4'
          onSubmit={(e) => {
            e.preventDefault()
            const title = new FormData(e.target as HTMLFormElement).get('title')

            if (!title) {
              return
            }

            createNotes.mutate({
              content: `# Your new note`,
              title: title.toString(),
            })
          }}
        >
          <Input
            name='title'
            type='text'
            required
            placeholder='Write a title'
            className='flex-1'
            ref={props.inputTitleRef}
          />
          <Button type='submit'>Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
