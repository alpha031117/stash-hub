import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, TaskStatus } from '@/hooks/useTasks'
import { TaskCard } from '@/components/kanban/TaskCard'
import { cn } from '@/lib/utils'

const COLUMN_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

const COLUMN_COLOR: Record<TaskStatus, string> = {
  backlog: 'bg-slate-400',
  todo: 'bg-blue-400',
  in_progress: 'bg-amber-400',
  review: 'bg-purple-400',
  done: 'bg-green-400',
}

type Props = {
  status: TaskStatus
  tasks: Task[]
  onTaskClick: (task: Task) => void
  tagColorMap: Record<string, Record<string, string | null>>
}

export function Column({ status, tasks, onTaskClick, tagColorMap }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={cn('size-2.5 rounded-full shrink-0', COLUMN_COLOR[status])} />
        <span className="text-sm font-semibold">{COLUMN_LABEL[status]}</span>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-col gap-2 min-h-20 rounded-lg p-1.5 transition-colors',
          isOver && 'bg-accent/50',
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
              tagColors={tagColorMap[task.id] ?? {}}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
