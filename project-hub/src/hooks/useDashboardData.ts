import { useQuery } from '@tanstack/react-query'
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
  subDays,
  parseISO,
  format,
  eachDayOfInterval,
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useUiStore } from '@/stores/uiStore'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import type { Task } from '@/hooks/useTasks'

type ProjectRow = { id: string; name: string; company_id: string }

export type TaskWithProject = Task & { project: ProjectRow }
export type ThroughputEntry = { [key: string]: string | number }
export type WipEntry = { name: string; wip: number; color: string }

const FALLBACK_COLOR = '#6366f1'

function buildThroughputData(
  tasks: TaskWithProject[],
  companies: Company[],
  from: Date,
  to: Date,
  activeCompanyId: string | null,
): ThroughputEntry[] {
  return eachDayOfInterval({ start: from, end: to }).map((day) => {
    const label = format(day, 'MMM d')
    const dayStr = format(day, 'yyyy-MM-dd')
    const entry: ThroughputEntry = { date: label }

    if (activeCompanyId) {
      entry['count'] = tasks.filter(
        (t) =>
          t.completed_at &&
          format(parseISO(t.completed_at), 'yyyy-MM-dd') === dayStr,
      ).length
    } else {
      for (const c of companies) {
        entry[c.name] = tasks.filter(
          (t) =>
            t.project.company_id === c.id &&
            t.completed_at &&
            format(parseISO(t.completed_at), 'yyyy-MM-dd') === dayStr,
        ).length
      }
    }

    return entry
  })
}

function buildWipData(
  tasks: TaskWithProject[],
  companies: Company[],
  activeCompanyId: string | null,
): WipEntry[] {
  const wipTasks = tasks.filter((t) =>
    ['todo', 'in_progress', 'review'].includes(t.status),
  )

  if (activeCompanyId) {
    const seen = new Map<string, { name: string; count: number }>()
    for (const t of wipTasks) {
      const prev = seen.get(t.project.id)
      seen.set(t.project.id, { name: t.project.name, count: (prev?.count ?? 0) + 1 })
    }
    return [...seen.values()]
      .map((p) => ({ name: p.name, wip: p.count, color: FALLBACK_COLOR }))
      .sort((a, b) => b.wip - a.wip)
  }

  return companies
    .map((c) => ({
      name: c.name,
      wip: wipTasks.filter((t) => t.project.company_id === c.id).length,
      color: c.color ?? FALLBACK_COLOR,
    }))
    .filter((e) => e.wip > 0)
    .sort((a, b) => b.wip - a.wip)
}

export function useDashboardData() {
  const activeCompanyId = useUiStore((s) => s.activeCompanyId)
  const { data: companies = [] } = useCompanies()

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

  const isLoading = tasksLoading || projectsLoading

  const projectMap = new Map(projects.map((p) => [p.id, p]))

  const allTasks: TaskWithProject[] = tasks
    .map((t) => {
      const project = projectMap.get(t.project_id)
      if (!project) return null
      return { ...t, project }
    })
    .filter((t): t is TaskWithProject => t !== null)

  const filtered = activeCompanyId
    ? allTasks.filter((t) => t.project.company_id === activeCompanyId)
    : allTasks

  const now = new Date()
  const today = startOfDay(now)
  const weekEnd = endOfDay(addDays(today, 6))
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEndDate = endOfWeek(now, { weekStartsOn: 1 })
  const thirtyDaysAgo = subDays(today, 29)

  const openTasks = filtered.filter((t) => t.status !== 'done').length

  const dueSoon = filtered.filter((t) => {
    if (!t.due_date || t.status === 'done') return false
    const due = parseISO(t.due_date)
    return due >= today && due <= weekEnd
  }).length

  const overdue = filtered.filter((t) => {
    if (!t.due_date || t.status === 'done') return false
    return parseISO(t.due_date) < today
  }).length

  const completedThisWeek = filtered.filter((t) => {
    if (!t.completed_at) return false
    const c = parseISO(t.completed_at)
    return c >= weekStart && c <= weekEndDate
  }).length

  const completedLast30 = filtered.filter(
    (t) => t.completed_at && parseISO(t.completed_at) >= thirtyDaysAgo,
  )

  const throughputData = buildThroughputData(
    completedLast30,
    companies,
    thirtyDaysAgo,
    now,
    activeCompanyId,
  )

  const wipData = buildWipData(filtered, companies, activeCompanyId)

  const upcomingDeadlines = filtered
    .filter((t) => {
      if (!t.due_date || t.status === 'done') return false
      const due = parseISO(t.due_date)
      return due >= today && due <= weekEnd
    })
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
    .slice(0, 8)

  return {
    isLoading,
    kpi: { openTasks, dueSoon, overdue, completedThisWeek },
    throughputData,
    wipData,
    upcomingDeadlines,
    companies,
    activeCompanyId,
  }
}
