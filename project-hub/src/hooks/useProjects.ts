import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useUiStore } from '@/stores/uiStore'

export type Project = {
  id: string
  company_id: string
  name: string
  description: string | null
  status: 'active' | 'on_hold' | 'completed' | 'archived'
  repo_url: string | null
  calendar_id: string | null
  color: string | null
  created_at: string
  updated_at: string
}

type ProjectInput = {
  name: string
  description?: string
  status?: Project['status']
  color?: string
}

function projectQueryKey(companyId: string | null) {
  return ['projects', companyId]
}

export function useProjects() {
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)

  return useQuery({
    queryKey: projectQueryKey(activeCompanyId),
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', activeCompanyId!)
        .order('created_at')
      if (error) throw error
      return data as Project[]
    },
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)

  return useMutation({
    mutationFn: async (values: ProjectInput) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...values, company_id: activeCompanyId! })
        .select()
        .single()
      if (error) throw error
      return data as Project
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectQueryKey(activeCompanyId) }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)

  return useMutation({
    mutationFn: async ({ id, ...values }: ProjectInput & { id: string }) => {
      const { error } = await supabase
        .from('projects')
        .update(values)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectQueryKey(activeCompanyId) }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectQueryKey(activeCompanyId) }),
  })
}
