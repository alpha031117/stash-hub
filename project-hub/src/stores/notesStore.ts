import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type NotesState = {
  notesByScope: Record<string, string>
  setNote: (scope: string, content: string) => void
  clearNote: (scope: string) => void
}

export const NOTES_GLOBAL_SCOPE = '__global__'

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      notesByScope: {},
      setNote: (scope, content) =>
        set((s) => ({ notesByScope: { ...s.notesByScope, [scope]: content } })),
      clearNote: (scope) =>
        set((s) => {
          const next = { ...s.notesByScope }
          delete next[scope]
          return { notesByScope: next }
        }),
    }),
    { name: 'stashhub-notes' },
  ),
)
