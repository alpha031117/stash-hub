import { create } from 'zustand'
import type { TaskPriority } from '@/hooks/useTasks'

type FilterState = {
  search: string
  priorities: TaskPriority[]
  tagIds: string[]
  setSearch: (s: string) => void
  togglePriority: (p: TaskPriority) => void
  toggleTag: (id: string) => void
  reset: () => void
}

export const useFilterStore = create<FilterState>((set) => ({
  search: '',
  priorities: [],
  tagIds: [],
  setSearch: (search) => set({ search }),
  togglePriority: (p) =>
    set((s) => ({
      priorities: s.priorities.includes(p)
        ? s.priorities.filter((x) => x !== p)
        : [...s.priorities, p],
    })),
  toggleTag: (id) =>
    set((s) => ({
      tagIds: s.tagIds.includes(id)
        ? s.tagIds.filter((x) => x !== id)
        : [...s.tagIds, id],
    })),
  reset: () => set({ search: '', priorities: [], tagIds: [] }),
}))
