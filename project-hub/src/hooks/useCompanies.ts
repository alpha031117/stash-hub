import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export type Company = {
  id: string
  name: string
  color: string
  owner_id: string
  created_at: string
}

const QUERY_KEY = ['companies']

export function useCompanies() {
  const session = useAuth((s) => s.session)

  return useQuery({
    queryKey: QUERY_KEY,
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at')
      if (error) throw error
      return data as Company[]
    },
  })
}

export function useCreateCompany() {
  const qc = useQueryClient()
  const session = useAuth((s) => s.session)

  return useMutation({
    mutationFn: async (values: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from('companies')
        .insert({ ...values, owner_id: session!.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Company
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateCompany() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...values
    }: { id: string; name: string; color: string }) => {
      const { error } = await supabase
        .from('companies')
        .update(values)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteCompany() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('companies').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
