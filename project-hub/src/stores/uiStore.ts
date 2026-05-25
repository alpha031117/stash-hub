import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type UiState = {
  activeCompanyId: string | null
  sidebarOpen: boolean
  setActiveCompany: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeCompanyId: null,
      sidebarOpen: true,
      setActiveCompany: (id) => set({ activeCompanyId: id }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    { name: 'stashhub-ui' },
  ),
)
