import { format, parseISO, isToday, isTomorrow } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TaskWithProject } from '@/hooks/useDashboardData'

function dueDateLabel(dateStr: string): { label: string; urgent: boolean } {
  const d = parseISO(dateStr)
  if (isToday(d)) return { label: 'Today', urgent: true }
  if (isTomorrow(d)) return { label: 'Tomorrow', urgent: true }
  return { label: format(d, 'MMM d'), urgent: false }
}

type Props = { tasks: TaskWithProject[] }

export function UpcomingDeadlines({ tasks }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <CalendarDays className="size-4 text-muted-foreground" />
          Upcoming deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No tasks due in the next 7 days
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const { label, urgent } = dueDateLabel(t.due_date!)
              return (
                <li key={t.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.project.name}</p>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium shrink-0',
                      urgent ? 'text-red-500' : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
