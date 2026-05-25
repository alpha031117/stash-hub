import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useUiStore } from '@/stores/uiStore'

export type Tag = {
  id: string
  company_id: string
  name: string
  color: string | null
}

const QUERY_KEY = (companyId: string | null) => ['tags', companyId]

export function useTags() {
  const companyId = useUiStore((s) => s.activeCompanyId)

  return useQuery({
    queryKey: QUERY_KEY(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('company_id', companyId!)
        .order('name')
      if (error) throw error
      return data as Tag[]
    },
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  const companyId = useUiStore((s) => s.activeCompanyId)

  return useMutation({
    mutationFn: async (values: { name: string; color?: string }) => {
      const { data, error } = await supabase
        .from('tags')
        .insert({ ...values, company_id: companyId! })
        .select()
        .single()
      if (error) throw error
      return data as Tag
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(companyId) }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  const companyId = useUiStore((s) => s.activeCompanyId)

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(companyId) }),
  })
}

// Task-tag junction
export function useTaskTags(taskId: string | null) {
  return useQuery({
    queryKey: ['task_tags', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_tags')
        .select('tag_id')
        .eq('task_id', taskId!)
      if (error) throw error
      return (data as { tag_id: string }[]).map((r) => r.tag_id)
    },
  })
}

export function useSetTaskTags(taskId: string | null) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (tagIds: string[]) => {
      if (!taskId) return
      await supabase.from('task_tags').delete().eq('task_id', taskId)
      if (tagIds.length > 0) {
        const { error } = await supabase
          .from('task_tags')
          .insert(tagIds.map((tag_id) => ({ task_id: taskId, tag_id })))
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task_tags', taskId] }),
  })
}
