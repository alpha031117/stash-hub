import { CheckCircle2, Clock, AlertTriangle, ListTodo } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  openTasks: number
  dueSoon: number
  overdue: number
  completedThisWeek: number
}

const CARDS = [
  {
    key: 'openTasks' as const,
    label: 'Open tasks',
    icon: ListTodo,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
  },
  {
    key: 'dueSoon' as const,
    label: 'Due this week',
    icon: Clock,
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    key: 'overdue' as const,
    label: 'Overdue',
    icon: AlertTriangle,
    colorClass: 'text-red-500',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
  },
  {
    key: 'completedThisWeek' as const,
    label: 'Completed this week',
    icon: CheckCircle2,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-50 dark:bg-green-950/30',
  },
]

export function KpiCards({ openTasks, dueSoon, overdue, completedThisWeek }: Props) {
  const values = { openTasks, dueSoon, overdue, completedThisWeek }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map(({ key, label, icon: Icon, colorClass, bgClass }) => (
        <Card key={key}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <span className={`p-1 rounded-md ${bgClass}`}>
                <Icon className={`size-3.5 ${colorClass}`} />
              </span>
              {label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-3xl font-bold">{values[key]}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
