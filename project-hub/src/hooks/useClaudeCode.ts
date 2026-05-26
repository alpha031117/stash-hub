import { useQuery } from '@tanstack/react-query'
import { invoke, isTauri } from '@tauri-apps/api/core'

export type CcProject = {
  slug: string
  path: string
  sessionCount: number
  lastActivity: string | null
  hasMemory: boolean
}

export type CcTaskStatus = 'pending' | 'in_progress' | 'completed' | string

export type CcTask = {
  id: string
  subject: string
  status: CcTaskStatus
  activeForm: string | null
}

export type CcCounts = {
  total: number
  pending: number
  inProgress: number
  completed: number
  other: number
}

export type CcSession = {
  id: string
  title: string | null
  lastPrompt: string | null
  startedAt: string | null
  lastActivity: string | null
  messageCount: number
  tasks: CcTask[]
  counts: CcCounts
}

export type CcMemoryFile = {
  name: string
  description: string | null
  memType: string | null
  body: string
}

export type CcMemory = {
  index: string | null
  files: CcMemoryFile[]
}

export type CcProjectDetail = {
  slug: string
  path: string
  memory: CcMemory
  sessions: CcSession[]
}

export type CcStatus = {
  available: boolean
  projectCount: number
  mavisInstalled: boolean
}

// These commands live in the Rust backend, so they only resolve inside the
// Tauri desktop shell. In a plain browser (`npm run dev`) `invoke` is undefined.
export const inTauriApp = isTauri()

export function useCcProjects() {
  return useQuery({
    queryKey: ['cc-projects'],
    enabled: inTauriApp,
    queryFn: () => invoke<CcProject[]>('cc_list_projects'),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}

export function useCcProjectDetail(slug: string | null) {
  return useQuery({
    queryKey: ['cc-project-detail', slug],
    enabled: inTauriApp && !!slug,
    queryFn: () => invoke<CcProjectDetail>('cc_project_detail', { slug }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })
}

/** Settings-page probe: is `~/.claude` present, with what counts. */
export function useCcStatus() {
  return useQuery({
    queryKey: ['cc-status'],
    enabled: inTauriApp,
    queryFn: () => invoke<CcStatus>('cc_status'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

// ---- Mavis brain (the user's installed long-term memory system) ----

export type MavisProject = {
  name: string
  path: string | null
  description: string
  progress: string
  notes: string
}

export type MavisBrain = {
  installed: boolean
  projects: MavisProject[]
}

export function useMavisBrain() {
  return useQuery({
    queryKey: ['cc-mavis-brain'],
    enabled: inTauriApp,
    queryFn: () => invoke<MavisBrain>('cc_mavis_brain'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

/** Normalize a filesystem path for cross-source matching (Windows-friendly). */
export function normalizePath(p: string | null | undefined): string {
  if (!p) return ''
  return p.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}
