import { format, startOfDay, subDays, parseISO, isWithinInterval } from 'date-fns'
import type { LookbackMode } from '@/stores/standupStore'
import type { Task, TaskPriority, TaskStatus } from '@/hooks/useTasks'

export type TaskWithProjectName = Task & { projectName: string }

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export function lookbackWindow(mode: LookbackMode, now: Date = new Date()) {
  const today = startOfDay(now)
  let daysBack = 1
  switch (mode) {
    case 'previous-day':
      daysBack = 1
      break
    case 'last-workday': {
      const dow = today.getDay()
      if (dow === 1) daysBack = 3 // Monday → Friday
      else if (dow === 0) daysBack = 2 // Sunday → Friday
      else daysBack = 1
      break
    }
    case 'last-3-days':
      daysBack = 3
      break
    case 'last-7-days':
      daysBack = 7
      break
  }
  const start = subDays(today, daysBack)
  // window is [start, today) — exclusive of today so "today's completions" stay in the today bucket
  return { start, end: today }
}

export function filterYesterday(tasks: TaskWithProjectName[], mode: LookbackMode, now: Date = new Date()) {
  const { start, end } = lookbackWindow(mode, now)
  return tasks
    .filter((t) => {
      if (!t.completed_at) return false
      const c = parseISO(t.completed_at)
      return isWithinInterval(c, { start, end })
    })
    .sort(
      (a, b) =>
        (b.completed_at ?? '').localeCompare(a.completed_at ?? ''),
    )
}

export function filterToday(tasks: TaskWithProjectName[], statuses: TaskStatus[]) {
  if (statuses.length === 0) return []
  const set = new Set(statuses)
  return tasks
    .filter((t) => set.has(t.status))
    .sort((a, b) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (p !== 0) return p
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
}

function formatList(tasks: TaskWithProjectName[], groupByProject: boolean): string {
  if (tasks.length === 0) return 'N/A'
  if (!groupByProject) {
    return tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
  }
  const groups = new Map<string, TaskWithProjectName[]>()
  for (const t of tasks) {
    const arr = groups.get(t.projectName) ?? []
    arr.push(t)
    groups.set(t.projectName, arr)
  }
  return [...groups.entries()]
    .map(
      ([proj, ts]) =>
        `${proj}\n` + ts.map((t, i) => `  ${i + 1}. ${t.title}`).join('\n'),
    )
    .join('\n')
}

function collectBlockers(
  tasks: TaskWithProjectName[],
  freeText: string,
): string {
  const taskLines = tasks
    .filter((t) => t.blockers && t.blockers.trim())
    .map((t) => `${t.title}: ${t.blockers!.trim()}`)
  const free = freeText.trim()
  const all = [...taskLines, ...(free ? [free] : [])]
  if (all.length === 0) return 'N/A'
  if (all.length === 1) return all[0]
  return '\n' + all.map((line, i) => `${i + 1}. ${line}`).join('\n')
}

export function renderStandup(opts: {
  template: string
  yesterday: TaskWithProjectName[]
  today: TaskWithProjectName[]
  blockers: string
  groupByProject: boolean
  name: string
  lookback: LookbackMode
  now?: Date
}): string {
  const now = opts.now ?? new Date()
  const { start } = lookbackWindow(opts.lookback, now)
  const blockers = collectBlockers(opts.today, opts.blockers)
  return opts.template
    .replace(/\{\{date\}\}/g, format(now, 'd/M/yyyy'))
    .replace(/\{\{dayShort\}\}/g, format(now, 'EEE'))
    .replace(/\{\{prevDayShort\}\}/g, format(start, 'EEE'))
    .replace(/\{\{name\}\}/g, opts.name || '')
    .replace(/\{\{yesterday\}\}/g, formatList(opts.yesterday, opts.groupByProject))
    .replace(/\{\{today\}\}/g, formatList(opts.today, opts.groupByProject))
    .replace(/\{\{blockers\}\}/g, blockers)
}

export const LOOKBACK_LABELS: Record<LookbackMode, string> = {
  'previous-day': 'Yesterday',
  'last-workday': 'Last workday',
  'last-3-days': 'Last 3 days',
  'last-7-days': 'Last 7 days',
}

export const PLACEHOLDERS: Array<{ token: string; description: string }> = [
  { token: '{{date}}', description: "Today's date (22/5/2026)" },
  { token: '{{dayShort}}', description: "Today's short day name (Fri)" },
  { token: '{{prevDayShort}}', description: 'Previous workday short name (Thu)' },
  { token: '{{name}}', description: 'Your name' },
  { token: '{{yesterday}}', description: 'Tasks completed within the lookback window' },
  { token: '{{today}}', description: 'Tasks in the selected today statuses' },
  { token: '{{blockers}}', description: "Per-task blockers from today's tasks + free-text below" },
]
