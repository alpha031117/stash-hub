import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export const RAG_BASE = 'http://127.0.0.1:8782'

export type RagStatus = {
  brain_found: boolean
  brain_root: string | null
  embedding_model: string
  chunks: number
  checkpoints: number
  files: number
  last_indexed_at: string | null
  checkpoints_per_project: Record<string, number>
  // Phase 3 — watcher state
  watching: string[]
  last_sync_per_project: Record<string, string>
}

export type RagProject = {
  name: string
  path: string | null
  description: string
  checkpoints: number
  // Phase 3
  watching: boolean
  last_sync: string | null
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

// Phase 3/4 — SSE events from the watcher
export type RagEvent =
  | { type: 'sync_started'; project: string }
  | { type: 'sync_done'; project: string; result: Record<string, unknown> }
  | { type: 'error'; project: string; error: string }
  | { type: 'unregistered_edit'; path: string }  // Phase 4

async function ragFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${RAG_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`mavis-rag ${res.status} ${path}`)
  return res.json() as Promise<T>
}

export function useRagStatus() {
  return useQuery<RagStatus>({
    queryKey: ['rag-status'],
    queryFn: () => ragFetch<RagStatus>('/status'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export function useRagProjects() {
  return useQuery<{ projects: RagProject[] }>({
    queryKey: ['rag-projects'],
    queryFn: () => ragFetch<{ projects: RagProject[] }>('/projects'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export function useSyncAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => ragFetch('/sync', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-status'] }),
  })
}

export function useReindex() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => ragFetch('/reindex', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-status'] }),
  })
}

/**
 * Trigger the LLM UPDATE graph.
 * - useUpdateAll()  → submits all registered projects, returns immediately (fire-and-forget).
 *   Watch useRagEvents for per-project sync_started / sync_done progress.
 * - useUpdateProject() → runs one project synchronously, awaits the result.
 */
export function useUpdateAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      ragFetch('/update', { method: 'POST', body: JSON.stringify({ changed_files: [] }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rag-status'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (project: string) =>
      ragFetch('/update', {
        method: 'POST',
        body: JSON.stringify({ project, changed_files: [] }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-status'] })
      qc.invalidateQueries({ queryKey: ['rag-projects'] })
    },
  })
}

/**
 * Subscribe to the /events SSE stream (Phase 3).
 *
 * Returns the latest event received from the watcher.
 * Reconnects automatically on disconnect. Stops when the component unmounts.
 */
export function useRagEvents(onEvent?: (event: RagEvent) => void): RagEvent | null {
  const [latest, setLatest] = useState<RagEvent | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    let es: EventSource | null = null
    let stopped = false

    function connect() {
      if (stopped) return
      es = new EventSource(`${RAG_BASE}/events`)

      const handle = (type: string) => (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as Record<string, unknown>
          const evt = { type, ...data } as RagEvent
          setLatest(evt)
          onEventRef.current?.(evt)
        } catch {
          // Malformed event — ignore
        }
      }

      es.addEventListener('sync_started', handle('sync_started'))
      es.addEventListener('sync_done', handle('sync_done'))
      es.addEventListener('error', handle('error'))
      es.addEventListener('unregistered_edit', handle('unregistered_edit'))

      es.onerror = () => {
        es?.close()
        if (!stopped) setTimeout(connect, 5_000)
      }
    }

    connect()
    return () => {
      stopped = true
      es?.close()
    }
  }, [])

  return latest
}

// Phase 4 — register an unregistered project into the brain
export type RegisterProjectInput = {
  path: string
  name: string
  type: string
  description: string
}

export function useRegisterProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterProjectInput) =>
      ragFetch('/register', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-status'] })
      qc.invalidateQueries({ queryKey: ['rag-projects'] })
    },
  })
}

/** Stream a chat turn over SSE fetch. Returns a cleanup fn (abort). */
export function streamChat(
  message: string,
  history: ChatMessage[],
  project: string | null,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const controller = new AbortController()

  const run = async () => {
    let res: Response
    try {
      res = await fetch(`${RAG_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, project }),
        signal: controller.signal,
      })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        onError(e instanceof Error ? e.message : 'Network error')
      }
      return
    }

    if (!res.ok) {
      onError(`Service error: ${res.status}`)
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const block of parts) {
          const lines = block.trim().split('\n')
          let eventType = 'message'
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) data = line.slice(6)
          }
          if (!data) continue
          try {
            const payload = JSON.parse(data) as Record<string, string>
            if (eventType === 'token' && payload.content) onToken(payload.content)
            else if (eventType === 'done') { onDone(); return }
            else if (eventType === 'error') onError(payload.error ?? 'Unknown error')
          } catch {
            // Malformed SSE data — skip
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    onDone()
  }

  run()
  return () => controller.abort()
}
