import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useCreateCompany,
  useUpdateCompany,
  type Company,
} from '@/hooks/useCompanies'
import { useUiStore } from '@/stores/uiStore'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

const schema = z.object({
  name: z.string().min(1, 'Required'),
  color: z.string(),
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  company?: Company
}

export function CompanyDialog({ open, onOpenChange, company }: Props) {
  const createCompany = useCreateCompany()
  const updateCompany = useUpdateCompany()
  const setActiveCompany = useUiStore((s) => s.setActiveCompany)
  const isEdit = !!company

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: company?.name ?? '', color: company?.color ?? COLORS[0] },
  })

  useEffect(() => {
    if (open) {
      form.reset({ name: company?.name ?? '', color: company?.color ?? COLORS[0] })
    }
  }, [open, company, form])

  const onSubmit = async (values: FormValues) => {
    if (isEdit) {
      await updateCompany.mutateAsync({ id: company.id, ...values })
    } else {
      const created = await createCompany.mutateAsync(values)
      setActiveCompany(created.id)
    }
    onOpenChange(false)
  }

  const selectedColor = form.watch('color')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit company' : 'New company'}</DialogTitle>
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
                    <Input placeholder="e.g. Main Job" autoFocus {...field} />
                  </FormControl>
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
                    <div className="flex gap-2 flex-wrap">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => field.onChange(c)}
                          className="size-7 rounded-full border-2 transition-transform hover:scale-110"
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
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
