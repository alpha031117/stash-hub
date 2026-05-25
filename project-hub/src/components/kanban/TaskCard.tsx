import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format } from 'date-fns'
import { CalendarDays, GripVertical } from 'lucide-react'
import type { Task } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'

const PRIORITY_CLASS: Record<Task['priority'], string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

type Props = {
  task: Task
  onClick: () => void
  tagColors?: Record<string, string | null>
}

export function TaskCard({ task, onClick, tagColors = {} }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group bg-card border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow select-none',
        isDragging && 'opacity-40 shadow-lg',
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-1">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-sm font-medium leading-snug">{task.title}</p>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded font-medium',
                PRIORITY_CLASS[task.priority],
              )}
            >
              {task.priority}
            </span>

            {task.due_date && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3" />
                {format(new Date(task.due_date), 'MMM d')}
              </span>
            )}

            {Object.keys(tagColors).length > 0 && (
              <span className="flex gap-1">
                {Object.entries(tagColors).map(([id, color]) => (
                  <span
                    key={id}
                    className="size-2.5 rounded-full"
                    style={{ background: color ?? '#94a3b8' }}
                  />
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
