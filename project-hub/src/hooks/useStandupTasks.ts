import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useUiStore } from '@/stores/uiStore'
import { useStandupConfig, useStandupScope } from '@/stores/standupStore'
import { filterToday, filterYesterday, type TaskWithProjectName } from '@/lib/standup'
import type { Task } from '@/hooks/useTasks'

type ProjectRow = { id: string; name: string; company_id: string }

export function useStandupTasks() {
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  const scope = useStandupScope()
  const config = useStandupConfig(scope)

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['dashboard-tasks'],
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*')
      if (error) throw error
      return data as Task[]
    },
  })

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['all-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, company_id')
      if (error) throw error
      return data as ProjectRow[]
    },
  })

  const { yesterday, today } = useMemo(() => {
    const projectMap = new Map(projects.map((p) => [p.id, p]))
    const all: TaskWithProjectName[] = tasks
      .map((t) => {
        const p = projectMap.get(t.project_id)
        if (!p) return null
        if (activeCompanyId && p.company_id !== activeCompanyId) return null
        return { ...t, projectName: p.name }
      })
      .filter((t): t is TaskWithProjectName => t !== null)

    return {
      yesterday: filterYesterday(all, config.lookback),
      today: filterToday(all, config.todoStatuses),
    }
  }, [tasks, projects, activeCompanyId, config.lookback, config.todoStatuses])

  return {
    yesterday,
    today,
    isLoading: tasksLoading || projectsLoading,
  }
}
