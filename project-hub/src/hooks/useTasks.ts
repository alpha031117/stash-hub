import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type Task = {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  position: number
  due_date: string | null
  assignee_id: string | null
  github_issue_id: string | null
  github_issue_url: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  blockers: string | null
}

export type TaskInput = {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string | null
  blockers?: string | null
  completed_at?: string | null
}

function taskQueryKey(projectId: string) {
  return ['tasks', projectId]
}

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: taskQueryKey(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('position')
      if (error) throw error
      return data as Task[]
    },
  })
}

const DASHBOARD_QUERY_KEY = ['dashboard-tasks']

export function useCreateTask(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: TaskInput) => {
      // Get max position in the target status column
      const { data: existing } = await supabase
        .from('tasks')
        .select('position')
        .eq('project_id', projectId)
        .eq('status', input.status ?? 'backlog')
        .order('position', { ascending: false })
        .limit(1)

      const maxPos = existing?.[0]?.position ?? 0
      const position = maxPos + 1000

      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...input, project_id: projectId, position })
        .select()
        .single()
      if (error) throw error
      return data as Task
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskQueryKey(projectId) })
      qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY })
    },
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...values
    }: Partial<TaskInput> & { id: string; status?: TaskStatus; priority?: TaskPriority; position?: number; completed_at?: string | null }) => {
      const { error } = await supabase
        .from('tasks')
        .update(values)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskQueryKey(projectId) })
      qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY })
    },
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskQueryKey(projectId) })
      qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY })
    },
  })
}

export function useMoveTask(sourceProjectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, targetProjectId }: { taskId: string; targetProjectId: string }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ project_id: targetProjectId })
        .eq('id', taskId)
      if (error) throw error
    },
    onSuccess: (_data, { targetProjectId }) => {
      qc.invalidateQueries({ queryKey: taskQueryKey(sourceProjectId) })
      qc.invalidateQueries({ queryKey: taskQueryKey(targetProjectId) })
      qc.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY })
    },
  })
}

/** Midpoint between two positions. Rebalance signal if gap < threshold. */
export function midpoint(a: number, b: number) {
  return (a + b) / 2
}

/** Rebalance all positions in a column to multiples of 1000. */
export async function rebalanceColumn(
  projectId: string,
  _status: TaskStatus,
  orderedIds: string[],
) {
  const updates = orderedIds.map((id, i) => ({
    id,
    project_id: projectId,
    position: (i + 1) * 1000,
  }))
  await supabase.from('tasks').upsert(updates, { onConflict: 'id' })
}
