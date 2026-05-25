import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useCreateProject,
  useUpdateProject,
  type Project,
} from '@/hooks/useProjects'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

const schema = z.object({
  name: z.string().min(1, 'Required'),
  description: z.string().optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'archived']),
  color: z.string(),
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project
}

export function ProjectDialog({ open, onOpenChange, project }: Props) {
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const isEdit = !!project

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'active',
      color: project?.color ?? COLORS[0],
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: project?.name ?? '',
        description: project?.description ?? '',
        status: project?.status ?? 'active',
        color: project?.color ?? COLORS[0],
      })
    }
  }, [open, project, form])

  const onSubmit = async (values: FormValues) => {
    if (isEdit) {
      await updateProject.mutateAsync({ id: project.id, ...values })
    } else {
      await createProject.mutateAsync(values)
    }
    onOpenChange(false)
  }

  const selectedColor = form.watch('color')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Website Redesign" autoFocus {...field} />
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
                    <Textarea
                      placeholder="Optional overview…"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
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
                            {(v: string) =>
                              ({ active: 'Active', on_hold: 'On Hold', completed: 'Completed', archived: 'Archived' }[v] ?? v)
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className="flex gap-1.5 flex-wrap pt-1">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => field.onChange(c)}
                            className="size-6 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              background: c,
                              borderColor: selectedColor === c ? 'white' : 'transparent',
                              outline: selectedColor === c ? `2px solid ${c}` : 'none',
                            }}
                          />
                        ))}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
