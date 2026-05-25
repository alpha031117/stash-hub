import { useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import {
  useTasks,
  useUpdateTask,
  midpoint,
  rebalanceColumn,
  type Task,
  type TaskStatus,
} from '@/hooks/useTasks'
import { useTags } from '@/hooks/useTags'
import { useFilterStore } from '@/stores/filterStore'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Column } from '@/components/kanban/Column'
import { TaskCard } from '@/components/kanban/TaskCard'
import { TaskDialog } from '@/components/kanban/TaskDialog'
import { FilterBar } from '@/components/kanban/FilterBar'
import { Button } from '@/components/ui/button'

const STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done']

type DialogState =
  | { open: false }
  | { open: true; task: Task | null }

type Props = { projectId: string }

export function Board({ projectId }: Props) {
  const qc = useQueryClient()
  const { data: tasks = [] } = useTasks(projectId)
  const updateTask = useUpdateTask(projectId)
  const { data: _tags } = useTags()   // preload for FilterBar + TaskDialog

  const [dragActive, setDragActive] = useState<Task | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ open: false })

  const search = useFilterStore((s) => s.search)
  const priorities = useFilterStore((s) => s.priorities)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const columns = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      if (priorities.length && !priorities.includes(t.priority)) return false
      return true
    })
    return Object.fromEntries(
      STATUSES.map((s) => [s, filtered.filter((t) => t.status === s)]),
    ) as Record<TaskStatus, Task[]>
  }, [tasks, search, priorities])

  const tagColorMap = useMemo(
    () => ({}) as Record<string, Record<string, string | null>>,
    [],
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragActive(tasks.find((t) => t.id === active.id) ?? null)
  }

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setDragActive(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    const task = tasks.find((t) => t.id === activeId)
    if (!task) return

    const overIsColumn = STATUSES.includes(overId as TaskStatus)
    const targetStatus: TaskStatus = overIsColumn
      ? (overId as TaskStatus)
      : (tasks.find((t) => t.id === overId)?.status ?? task.status)

    const targetCol = columns[targetStatus]

    const completedAt = (from: TaskStatus, to: TaskStatus): { completed_at?: string | null } => {
      if (to === 'done' && from !== 'done') return { completed_at: new Date().toISOString() }
      if (to !== 'done' && from === 'done') return { completed_at: null }
      return {}
    }

    if (overIsColumn) {
      const maxPos = Math.max(0, ...targetCol.map((t) => t.position))
      await updateTask.mutateAsync({
        id: activeId,
        status: targetStatus,
        position: maxPos + 1000,
        ...completedAt(task.status, targetStatus),
      })
      return
    }

    if (task.status === targetStatus) {
      const oldIdx = targetCol.findIndex((t) => t.id === activeId)
      const newIdx = targetCol.findIndex((t) => t.id === overId)
      if (oldIdx === newIdx) return

      const reordered = arrayMove(targetCol, oldIdx, newIdx)
      const prev = reordered[newIdx - 1]?.position ?? 0
      const next = reordered[newIdx + 1]?.position

      if (next !== undefined && next - prev < 0.01) {
        await rebalanceColumn(projectId, targetStatus, reordered.map((t) => t.id))
        qc.invalidateQueries({ queryKey: ['tasks', projectId] })
        return
      }

      await updateTask.mutateAsync({
        id: activeId,
        position: next !== undefined ? midpoint(prev, next) : prev + 1000,
      })
    } else {
      const overIdx = targetCol.findIndex((t) => t.id === overId)
      const prev = targetCol[overIdx - 1]?.position ?? 0
      const next = targetCol[overIdx]?.position
      await updateTask.mutateAsync({
        id: activeId,
        status: targetStatus,
        position: next !== undefined ? midpoint(prev, next) : prev + 1000,
        ...completedAt(task.status, targetStatus),
      })
    }
  }

  const closeDialog = () => setDialog({ open: false })

  return (
    <div className="space-y-3 flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3">
        <FilterBar />
        <Button
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => setDialog({ open: true, task: null })}
        >
          <Plus className="size-4 mr-1" /> New task
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={columns[status]}
              onTaskClick={(t) => setDialog({ open: true, task: t })}
              tagColorMap={tagColorMap}
            />
          ))}
        </div>

        <DragOverlay>
          {dragActive && <TaskCard task={dragActive} onClick={() => {}} />}
        </DragOverlay>
      </DndContext>

      <TaskDialog
        open={dialog.open}
        task={dialog.open ? dialog.task : null}
        projectId={projectId}
        onClose={closeDialog}
      />
    </div>
  )
}
