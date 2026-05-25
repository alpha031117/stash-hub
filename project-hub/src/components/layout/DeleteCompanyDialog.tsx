import { useDeleteCompany, type Company } from '@/hooks/useCompanies'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  company: Company | null
  onDeleted?: () => void
}

export function DeleteCompanyDialog({ open, onOpenChange, company, onDeleted }: Props) {
  const deleteCompany = useDeleteCompany()

  const handleDelete = async () => {
    if (!company) return
    await deleteCompany.mutateAsync(company.id)
    onDeleted?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete company</DialogTitle>
          <DialogDescription>
            Delete <strong>{company?.name}</strong>? This will permanently delete all
            projects, tasks, and data in this company. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteCompany.isPending}
          >
            {deleteCompany.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
