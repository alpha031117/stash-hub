import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, Trash2 } from 'lucide-react'
import {
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useMoveTask,
  type Task,
  type TaskStatus,
  type TaskPriority,
} from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { useTags, useTaskTags, useSetTaskTags } from '@/hooks/useTags'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const schema = z.object({
  title: z.string().min(1, 'Required'),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  due_date: z.string().optional(),
  blockers: z.string().optional(),
  completed_at: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

type Props = {
  open: boolean
  task: Task | null
  projectId: string
  onClose: () => void
  defaultStatus?: TaskStatus
}

export function TaskDialog({
  open,
  task,
  projectId,
  onClose,
  defaultStatus = 'backlog',
}: Props) {
  const isEdit = !!task

  const createTask = useCreateTask(projectId)
  const updateTask = useUpdateTask(projectId)
  const deleteTask = useDeleteTask(projectId)
  const moveTask = useMoveTask(projectId)
  const { data: tags = [] } = useTags()
  const { data: selectedTagIds = [] } = useTaskTags(task?.id ?? null)
  const setTaskTags = useSetTaskTags(task?.id ?? null)
  const { data: projects = [] } = useProjects()
  const otherProjects = projects.filter((p) => p.id !== projectId)

  const [moveToProjectId, setMoveToProjectId] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      status: defaultStatus,
      priority: 'medium',
      due_date: '',
      blockers: '',
      completed_at: '',
    },
  })

  const watchedStatus = useWatch({ control: form.control, name: 'status' })

  useEffect(() => {
    if (open) {
      form.reset(
        task
          ? {
              title: task.title,
              description: task.description ?? '',
              status: task.status,
              priority: task.priority,
              due_date: task.due_date ? task.due_date.slice(0, 10) : '',
              blockers: task.blockers ?? '',
              completed_at: task.completed_at ? task.completed_at.slice(0, 10) : '',
            }
          : {
              title: '',
              description: '',
              status: defaultStatus,
              priority: 'medium',
              due_date: '',
              blockers: '',
              completed_at: '',
            },
      )
      setMoveToProjectId('')
      setJustSaved(false)
    }
  }, [open, task, defaultStatus, form])

  const onSubmit = async (values: FormValues) => {
    const blockers = values.blockers?.trim() ? values.blockers.trim() : null

    let completed_at: string | null
    if (values.status !== 'done') {
      completed_at = null
    } else if (values.completed_at) {
      // Preserve original time-of-day if editing the same date, otherwise stamp midday UTC.
      const existing = task?.completed_at ?? null
      const sameDay = existing && existing.slice(0, 10) === values.completed_at
      completed_at = sameDay ? existing : `${values.completed_at}T12:00:00Z`
    } else if (isEdit && task.status === 'done' && task.completed_at) {
      completed_at = task.completed_at
    } else {
      completed_at = new Date().toISOString()
    }

    if (isEdit) {
      await updateTask.mutateAsync({
        id: task.id,
        ...values,
        due_date: values.due_date || null,
        blockers,
        completed_at,
      })
    } else {
      await createTask.mutateAsync({
        ...values,
        due_date: values.due_date || null,
        blockers,
        completed_at,
      })
    }
    setJustSaved(true)
    setTimeout(() => onClose(), 900)
  }

  const handleDelete = async () => {
    if (!task) return
    await deleteTask.mutateAsync(task.id)
    onClose()
  }

  const handleMove = async () => {
    if (!task || !moveToProjectId) return
    await moveTask.mutateAsync({ taskId: task.id, targetProjectId: moveToProjectId })
    onClose()
  }

  const toggleTag = async (tagId: string) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId]
    await setTaskTags.mutateAsync(next)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      {/* gap-0 + p-0 resets SheetContent's default gap-4 so we control layout fully */}
      <SheetContent className="w-full sm:max-w-md gap-0 p-0 flex flex-col">

        {/* Pinned header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <SheetTitle>{isEdit ? 'Edit task' : 'New task'}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Scrollable fields */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea className="resize-none" rows={4} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(v: string) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(v: string) => PRIORITY_OPTIONS.find((o) => o.value === v)?.label ?? v}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {watchedStatus === 'done' && (
                  <FormField
                    control={form.control}
                    name="completed_at"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Completed date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="blockers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blockers</FormLabel>
                    <FormControl>
                      <Textarea
                        className="resize-none"
                        rows={2}
                        placeholder="What's blocking this task?"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {tags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full border transition-colors',
                          selectedTagIds.includes(tag.id)
                            ? 'border-transparent text-white'
                            : 'border-border text-muted-foreground hover:border-foreground',
                        )}
                        style={
                          selectedTagIds.includes(tag.id)
                            ? { background: tag.color ?? '#6366f1' }
                            : {}
                        }
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isEdit && otherProjects.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-sm font-medium">Move to project</p>
                  <div className="flex gap-2">
                    <Select value={moveToProjectId} onValueChange={(v) => setMoveToProjectId(v ?? '')}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select project…">
                          {(v: string) => otherProjects.find((p) => p.id === v)?.name ?? v}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {otherProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-2">
                              {p.color && (
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{ background: p.color }}
                                />
                              )}
                              {p.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!moveToProjectId || moveTask.isPending}
                      onClick={handleMove}
                    >
                      Move
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Pinned footer */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-t bg-muted/30">
              {isEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={deleteTask.isPending}
                >
                  <Trash2 className="size-4 mr-1" />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={form.formState.isSubmitting || justSaved}
                  className={justSaved ? 'bg-green-600 text-white hover:bg-green-600' : undefined}
                >
                  {justSaved ? (
                    <>
                      <Check className="size-3.5" />
                      Done
                    </>
                  ) : isEdit ? (
                    'Save'
                  ) : (
                    'Create task'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
