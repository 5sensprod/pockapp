import { CreateNoteDialog } from '@/components/create-note-dialog'
import { NotesList } from '@/components/notes-list'
import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'

export const Route = createFileRoute('/notes/')({
  component() {
    const [open, setOpen] = useState(false)
    const inputTitleRef = useRef<HTMLInputElement>(null)

    return (
      <div className='w-full grid grid-cols-5'>
        <div className='col-span-1 flex flex-col gap-2 p-2'>
          <button
            className='btn btn-primary'
            type='button'
            onClick={() => {
              setOpen(true)
              // Laisser React ouvrir le Dialog puis focus
              setTimeout(() => {
                inputTitleRef.current?.focus()
              }, 0)
            }}
          >
            Create
          </button>
          <NotesList />
        </div>
        <div className='col-span-4'>
          <p>Select a note or create a new one</p>
        </div>
        <CreateNoteDialog
          open={open}
          onOpenChange={setOpen}
          inputTitleRef={inputTitleRef}
        />
      </div>
    )
  },
})
